import { useEffect, useRef } from 'react';
import { useGameStore } from '@/store/gameStore';
import type { TerminalLine, NpcSection } from '@/store/gameStore';

const submitCommand = (cmd: string) => useGameStore.getState().submitCommand(cmd);

type BlockCfg = {
  inkClass: string;
  text: string;
  labelColor: string;
  labelUppercase?: boolean;
  italic?: boolean;
  dossier?: boolean;
};

const BLOCK: Record<TerminalLine['type'], BlockCfg> = {
  input:    { inkClass: 'ink-narrative', text: 'var(--ink-input)',    labelColor: 'transparent' },
  system:   { inkClass: 'ink-system',   text: 'var(--ink-system)',   labelColor: 'var(--ink-system)',   dossier: true },
  output:   { inkClass: 'ink-narrative',text: 'var(--ink-narrative)',labelColor: 'var(--parchment-dark)' },
  error:    { inkClass: 'ink-error',    text: 'var(--ink-error)',    labelColor: 'var(--ink-error)' },
  movement: { inkClass: 'ink-movement', text: 'var(--ink-movement)', labelColor: 'var(--ink-movement)', labelUppercase: true },
  combat:   { inkClass: 'ink-combat',   text: 'var(--ink-combat)',   labelColor: 'var(--ink-combat)',   labelUppercase: true },
  npc:      { inkClass: 'ink-npc',      text: 'var(--ink-npc)',      labelColor: 'var(--ink-npc)' },
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
      style={{
        flex: 1, overflowY: 'auto',
        padding: '1.5rem 2rem',
        display: 'flex', flexDirection: 'column',
        fontFamily: 'var(--font-journal)',
        fontSize: '1.2rem',
        background: [
          'radial-gradient(ellipse at 18% 25%, rgba(160,112,40,0.35) 0%, transparent 55%)',
          'radial-gradient(ellipse at 82% 72%, rgba(140,96,32,0.28) 0%, transparent 48%)',
          'radial-gradient(ellipse at 50% 95%, rgba(120,80,24,0.22) 0%, transparent 35%)',
          'var(--parchment)',
        ].join(', '),
      }}
    >
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
      <div style={{ color: 'var(--ink-input)', opacity: 0.5, margin: '0.6rem 0 0.1rem', fontStyle: 'italic' }}>
        {line.text}
      </div>
    );
  }

  if (cfg.dossier) {
    return (
      <div style={{
        background: 'var(--parchment-cream)',
        border: `1px solid rgba(46,26,8,0.25)`,
        padding: '0.65rem 1rem',
        margin: '0.5rem 0',
        transform: 'rotate(-0.3deg)',
        fontFamily: 'var(--font-dossier)',
        position: 'relative',
      }}>
        {label && (
          <div style={{
            fontSize: '0.6em',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'rgba(26,46,64,0.55)',
            marginBottom: '0.3rem',
          }}>
            {label}
          </div>
        )}
        <div className="ink-system" style={{ color: 'var(--ink-system)', lineHeight: 1.6, fontStyle: 'italic' }}>
          {line.text.split('\n').map((part, i) => (
            <div key={i} dangerouslySetInnerHTML={{ __html: renderMarkdown(part) }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ borderTop: `1px solid var(--ink-divider)`, padding: '0.55rem 0', margin: '0.1rem 0' }}>
      {label && (
        <div style={{
          fontFamily: 'var(--font-dossier)',
          fontSize: '0.6em',
          letterSpacing: '0.15em',
          textTransform: cfg.labelUppercase ? 'uppercase' : 'none',
          color: cfg.labelColor,
          marginBottom: '0.3rem',
          opacity: 0.75,
        }}>
          {label}
        </div>
      )}
      {line.type === 'npc' && line.npcSections?.length
        ? <NpcBody sections={line.npcSections} />
        : (
          <div className={cfg.inkClass} style={{ color: cfg.text, lineHeight: 1.65, fontStyle: cfg.italic ? 'italic' : 'normal' }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      {sections.map((sec, i) =>
        sec.kind === 'speech' ? (
          <div key={i} className="ink-npc" style={{
            borderLeft: '2px solid rgba(26,61,26,0.45)',
            paddingLeft: '0.7rem',
            color: 'var(--ink-npc)',
            lineHeight: 1.65,
            fontWeight: 600,
          }}>
            <span style={{ opacity: 0.6 }}>&ldquo;</span>
            <span dangerouslySetInnerHTML={{ __html: renderMarkdown(sec.text) }} />
            <span style={{ opacity: 0.6 }}>&rdquo;</span>
          </div>
        ) : (
          <div key={i} className="ink-npc" style={{
            color: 'var(--ink-npc)',
            lineHeight: 1.65,
            fontStyle: 'italic',
            opacity: 0.75,
          }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(sec.text) }}
          />
        )
      )}
    </div>
  );
}

/**
 * Wrap single-quoted dialogue in an inline speech span so spoken lines pop
 * inside flowing room/quest/output text — not just the dedicated NPC channel.
 *
 * Mirrors the engine's contraction-aware split (systems/dialogue.rs): a quote
 * flanked by letters on both sides (it's, don't, you'll) is an apostrophe, not
 * a delimiter, so it's left alone. Paired delimiters become "…" callouts.
 * Runs on raw text before other HTML is introduced, so the scan only sees the
 * original narrative quotes.
 */
function wrapSpeech(text: string): string {
  const isAlpha = (c: string) => c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z';
  const delims: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "'") continue;
    const prev = i > 0 ? text[i - 1] : '';
    const next = i + 1 < text.length ? text[i + 1] : '';
    if (!(isAlpha(prev) && isAlpha(next))) delims.push(i);
  }
  if (delims.length < 2) return text;

  let out = '';
  let last = 0;
  for (let k = 0; k + 1 < delims.length; k += 2) {
    const open = delims[k], close = delims[k + 1];
    out += text.slice(last, open);
    out += `<span class="speech-inline">"${text.slice(open + 1, close)}"</span>`;
    last = close + 1;
  }
  out += text.slice(last);
  return out;
}

function renderMarkdown(text: string): string {
  let out = wrapSpeech(text);
  out = out.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (_, display, cmd) => {
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
