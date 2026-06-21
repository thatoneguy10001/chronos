import { useEffect, useRef } from 'react';
import { useGameStore } from '@/store/gameStore';
import type { TerminalLine } from '@/store/gameStore';

const submitCommand = (cmd: string) => useGameStore.getState().submitCommand(cmd);

const LINE_STYLES: Record<TerminalLine['type'], React.CSSProperties> = {
  input:    { color: 'var(--text-input)', opacity: 0.85 },
  output:   { color: 'var(--text)', lineHeight: '1.6' },
  error:    { color: 'var(--error)', lineHeight: '1.6' },
  system:   { color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.85em' },
  npc:      { lineHeight: '1.6' },
  combat:   { color: 'var(--combat-text, #d4886a)', lineHeight: '1.6' },
  movement: { color: 'var(--movement-text, #a0b4c8)', lineHeight: '1.6', borderTop: '1px solid var(--border)', paddingTop: '0.5rem', marginTop: '0.25rem' },
};

export function Terminal() {
  const lines = useGameStore(s => s.lines);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  // Event delegation — catches data-cmd clicks on any child span.
  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    const cmd = target.closest('[data-cmd]')?.getAttribute('data-cmd');
    if (cmd) submitCommand(cmd);
  }

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '1rem 1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
      }}
    >
      {lines.map(line => (
        line.type === 'npc'
          ? <NpcLine key={line.id} line={line} />
          : (
            <div key={line.id} style={LINE_STYLES[line.type]}>
              {line.text.split('\n').map((part, i) => (
                <div key={i} dangerouslySetInnerHTML={{ __html: renderMarkdown(part) }} />
              ))}
            </div>
          )
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function NpcLine({ line }: { line: TerminalLine }) {
  const speakerName = line.speaker;
  return (
    <div style={{
      borderLeft: '2px solid var(--blue)',
      paddingLeft: '0.75rem',
      margin: '0.15rem 0',
    }}>
      {speakerName && (
        <div style={{ color: 'var(--blue)', fontWeight: 'bold', fontSize: '0.85em', marginBottom: '0.15rem' }}>
          {speakerName}
        </div>
      )}
      <div style={{ color: 'var(--text)', lineHeight: '1.6' }}>
        {line.text.split('\n').map((part, i) => (
          <div key={i} dangerouslySetInnerHTML={{ __html: renderMarkdown(part) }} />
        ))}
      </div>
    </div>
  );
}

/** Renders **bold**, and [[display|command]] as clickable entity links. Content is from Rust. */
function renderMarkdown(text: string): string {
  // Replace [[display|command]] with colored clickable spans.
  let out = text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (_, display, cmd) => {
    const cls = entityClass(cmd);
    return `<span class="ent-link ${cls}" data-cmd="${escAttr(cmd)}">${escHtml(display)}</span>`;
  });
  // Bold remaining **...**
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  return out;
}

function entityClass(cmd: string): string {
  const verb = cmd.trim().split(/\s+/)[0].toLowerCase();
  if (verb === 'talk' || verb === 'ask') return 'ent-npc';
  if (verb === 'go') return 'ent-place';
  if (verb === 'attack') return 'ent-enemy';
  return 'ent-item';
}

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
