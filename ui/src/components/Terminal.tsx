import { useEffect, useRef } from 'react';
import { useGameStore } from '@/store/gameStore';
import type { TerminalLine } from '@/store/gameStore';

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
  system:   { border: 'var(--border)', text: 'var(--text-muted)', labelColor: 'var(--text-dim)', italic: true },
  output:   { border: 'var(--text-dim)', text: 'var(--text-body)', labelColor: 'var(--text-accent)' },
  error:    { border: 'var(--error)',  text: 'var(--error)',       labelColor: 'var(--error)' },
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
      style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column' }}
    >
      {lines.map(line => <LineBlock key={line.id} line={line} />)}
      <div ref={bottomRef} />
    </div>
  );
}

function LineBlock({ line }: { line: TerminalLine }) {
  const cfg = BLOCK[line.type];
  const label = line.label ?? line.speaker;

  if (line.type === 'input') {
    return (
      <div style={{ color: 'var(--text-input)', opacity: 0.65, margin: '0.55rem 0 0.1rem', fontSize: '0.82em' }}>
        {line.text}
      </div>
    );
  }

  return (
    <div style={{
      borderLeft: `2px solid ${cfg.border}`,
      background: cfg.bg,
      padding: '0.45rem 0.75rem',
      margin: '0.1rem 0',
    }}>
      {label && (
        <div style={{
          fontSize: line.type === 'npc' ? '0.8em' : '0.6em',
          letterSpacing: line.type === 'npc' ? '0.02em' : '0.1em',
          textTransform: cfg.labelUppercase ? 'uppercase' : 'none',
          color: cfg.labelColor,
          marginBottom: '0.25rem',
          fontWeight: line.type === 'npc' ? 'bold' : 'normal',
        }}>
          {label}
        </div>
      )}
      <div style={{
        color: cfg.text,
        lineHeight: '1.65',
        fontSize: '0.82em',
        fontStyle: cfg.italic ? 'italic' : 'normal',
      }}>
        {line.text.split('\n').map((part, i) => (
          <div key={i} dangerouslySetInnerHTML={{ __html: renderMarkdown(part) }} />
        ))}
      </div>
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
