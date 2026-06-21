import { useEffect, useRef } from 'react';
import { useGameStore } from '@/store/gameStore';
import type { TerminalLine, NpcSection } from '@/store/gameStore';

const submitCommand = (cmd: string) => useGameStore.getState().submitCommand(cmd);

type BlockCfg = {
  border: string;
  bg?: string;
  text: string;
  labelColor: string;
  labelUppercase?: boolean;
  italic?: boolean;
};

const BLOCK: Record<TerminalLine['type'], BlockCfg> = {
  input:    { border: 'transparent',   text: 'var(--text-input)',  labelColor: 'transparent' },
  system:   { border: '#1a2a1a', bg: 'transparent', text: 'var(--text-muted)', labelColor: '#3a5a3a', italic: true },
  output:   { border: '#2a4a2a', bg: '#080e08', text: '#8aaa8a',  labelColor: '#5a9a5a' },
  error:    { border: '#6a2020', bg: 'transparent', text: '#c04040', labelColor: '#c04040' },
  movement: { border: '#1a3550', bg: '#050a0f', text: '#4a6a8a',  labelColor: '#3a5a7a', labelUppercase: true },
  combat:   { border: '#501a10', bg: '#0a0603', text: 'var(--combat-text)', labelColor: '#7a3a2a', labelUppercase: true },
  npc:      { border: '#2a4a1a', bg: '#070c05', text: '#7a9a5a',  labelColor: 'var(--green-bright)' },
};

export function Terminal() {
  const lines = useGameStore(s => s.lines);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const cmd = (e.target as HTMLElement).closest('[data-cmd]')?.getAttribute('data-cmd');
    if (cmd) submitCommand(cmd);
  }

  return (
    <div
      onClick={handleClick}
      style={{ flex: 1, overflowY: 'auto', padding: 'var(--sp-3) var(--sp-3)', display: 'flex', flexDirection: 'column' }}
    >
      {/* marginTop:auto bottom-anchors the log so newest content hugs the input
          when sparse, but collapses to 0 and scrolls normally when it overflows. */}
      <div style={{ marginTop: 'auto' }}>
        {lines.map(line => <LineBlock key={line.id} line={line} />)}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function LineBlock({ line }: { line: TerminalLine }) {
  const cfg = BLOCK[line.type];
  const rawLabel = line.label ?? line.speaker;
  const label = line.type === 'movement' && rawLabel
    ? `MOVEMENT · ${rawLabel.toUpperCase()}`
    : line.type === 'system' && !rawLabel
    ? 'SYSTEM'
    : rawLabel;

  if (line.type === 'input') {
    return (
      <div style={{ color: 'var(--text-input)', opacity: 0.65, margin: '0.7rem 0 0.15rem', fontSize: 'var(--fs-body)' }}>
        {line.text}
      </div>
    );
  }

  return (
    <div style={{
      borderLeft: `2px solid ${cfg.border}`,
      background: cfg.bg,
      padding: '0.6rem 0.9rem',
      margin: '0.25rem 0',
    }}>
      {label && (
        <div style={{
          fontSize: line.type === 'npc' ? '0.85em' : 'var(--fs-label)',
          letterSpacing: line.type === 'npc' ? '0.02em' : '0.12em',
          textTransform: cfg.labelUppercase ? 'uppercase' : 'none',
          color: cfg.labelColor,
          marginBottom: '0.35rem',
          fontWeight: line.type === 'npc' ? 'bold' : 'normal',
        }}>
          {label}
        </div>
      )}
      {line.type === 'npc' && line.npcSections?.length
        ? <NpcBody sections={line.npcSections} />
        : (
          <div style={{
            color: cfg.text,
            lineHeight: '1.75',
            fontSize: 'var(--fs-body)',
            fontStyle: cfg.italic ? 'italic' : 'normal',
          }}>
            {line.text.split('\n').map((part, i) => (
              <div key={i} dangerouslySetInnerHTML={{ __html: renderMarkdown(part) }} />
            ))}
          </div>
        )
      }
    </div>
  );
}

function NpcBody({ sections }: { sections: NpcSection[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      {sections.map((sec, i) =>
        sec.kind === 'speech' ? (
          <div key={i} style={{
            borderLeft: '2px solid #5a8a2a',
            paddingLeft: '0.7rem',
            color: '#c8e87a',
            fontSize: 'var(--fs-body)',
            lineHeight: '1.75',
          }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(sec.text) }}
          />
        ) : (
          <div key={i} style={{
            color: '#4a6a3a',
            fontSize: 'var(--fs-body)',
            lineHeight: '1.75',
            fontStyle: 'italic',
          }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(sec.text) }}
          />
        )
      )}
    </div>
  );
}

function renderMarkdown(text: string): string {
  let out = text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (_, display, cmd) => {
    const cls = entityClass(cmd);
    return `<span class="ent-link ${cls}" data-cmd="${escAttr(cmd)}">${escHtml(display)}</span>`;
  });
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
