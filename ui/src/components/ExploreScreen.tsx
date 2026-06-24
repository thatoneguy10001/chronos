import { useGameStore } from '@/store/gameStore';
import type { ContextAction } from '@/types/contracts';

// ── Action classification ────────────────────────────────────────────────────

type ActionKind = 'move' | 'attack' | 'talk' | 'item' | 'other';

const DIRS = new Set([
  'north','south','east','west','up','down',
  'ne','nw','se','sw','northeast','northwest','southeast','southwest',
]);

function classifyAction(cmd: string): ActionKind {
  const parts = cmd.trim().toLowerCase().split(/\s+/);
  const verb = parts[0];
  if (DIRS.has(verb) || (verb === 'go' && DIRS.has(parts[1]))) return 'move';
  if (verb === 'attack' || verb === 'fight') return 'attack';
  if (verb === 'talk' || verb === 'ask' || verb === 'speak') return 'talk';
  if (['take', 'pick', 'get', 'use'].includes(verb)) return 'item';
  return 'other';
}

const KIND_ICON: Record<ActionKind, string> = {
  move:   'ti-arrow-right',
  attack: 'ti-sword',
  talk:   'ti-message-circle',
  item:   'ti-package',
  other:  'ti-circle-dot',
};

const KIND_LABEL: Record<ActionKind, string> = {
  move:   'Exit',
  attack: 'Hostile',
  talk:   'Person',
  item:   'Item',
  other:  'Action',
};

const KIND_BORDER: Record<ActionKind, string> = {
  move:   'rgba(100,140,210,0.45)',
  attack: 'var(--ui-red)',
  talk:   'rgba(100,180,100,0.45)',
  item:   'rgba(200,168,74,0.45)',
  other:  'rgba(212,200,168,0.2)',
};

// Derive a short NPC name from a talk action label ("Talk to Private Marsh" → "Private Marsh")
function extractNpcName(label: string): string {
  return label
    .replace(/^(talk|speak|ask)\s+(to|with)\s+/i, '')
    .replace(/^talk\s+/i, '')
    .trim();
}

// Short direction label from command
function dirLabel(cmd: string): string {
  const parts = cmd.trim().toLowerCase().split(/\s+/);
  const dir = parts[0] === 'go' ? parts[1] : parts[0];
  const MAP: Record<string, string> = {
    north: 'N', south: 'S', east: 'E', west: 'W',
    up: 'U', down: 'D',
    northeast: 'NE', northwest: 'NW', southeast: 'SE', southwest: 'SW',
    ne: 'NE', nw: 'NW', se: 'SE', sw: 'SW',
  };
  return MAP[dir] ?? dir.toUpperCase();
}

// Strip "go north to Fort Iron Gate" → "Fort Iron Gate", or fall back to label
function exitDestination(label: string): string {
  const m = label.match(/(?:to\s+)(.+)$/i);
  return m ? m[1] : label;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function ZoneCard({ action, kind, onClick }: { action: ContextAction; kind: ActionKind; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--ui-card)',
        border: '1px solid var(--ui-gold-border)',
        borderTop: `2px solid ${KIND_BORDER[kind]}`,
        borderRadius: 2,
        padding: '10px 11px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        minHeight: 88,
        transition: 'border-color 0.12s, background 0.1s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--ui-gold-border-hi)';
        (e.currentTarget as HTMLElement).style.background = 'var(--ui-card-hover)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--ui-gold-border)';
        (e.currentTarget as HTMLElement).style.background = 'var(--ui-card)';
      }}
    >
      <div style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ui-dim)', fontFamily: 'var(--font-dossier)' }}>
        {KIND_LABEL[kind]}
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 'bold', color: 'var(--ui-cream)', fontFamily: 'var(--font-dossier)', lineHeight: 1.3, flex: 1 }}>
        {action.label}
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
        <i className={`ti ${KIND_ICON[kind]}`} aria-hidden="true" style={{ fontSize: 11, color: KIND_BORDER[kind] }} />
        <span style={{ fontSize: 9, color: 'var(--ui-dim)', fontFamily: 'var(--font-dossier)' }}>Free</span>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function ExploreScreen() {
  const currentRoomName = useGameStore(s => s.currentRoomName);
  const currentRoomId   = useGameStore(s => s.currentRoomId);
  const contextActions  = useGameStore(s => s.contextActions);
  const roomActions     = useGameStore(s => s.roomActions);
  const enemies         = useGameStore(s => s.enemies);
  const lines           = useGameStore(s => s.lines);
  const submitCommand   = useGameStore(s => s.submitCommand);
  const worldTitle      = useGameStore(s => s.worldTitle);

  // Combine and deduplicate actions
  const allActions: ContextAction[] = [];
  const seen = new Set<string>();
  for (const a of [...contextActions, ...roomActions]) {
    if (!seen.has(a.command)) { seen.add(a.command); allActions.push(a); }
  }

  const moveActions  = allActions.filter(a => classifyAction(a.command) === 'move');
  const zoneActions  = allActions.filter(a => classifyAction(a.command) !== 'move');

  const talkActions  = zoneActions.filter(a => classifyAction(a.command) === 'talk');
  const visibleEnemies = enemies.filter(e => e.hp > 0 && e.room_id === currentRoomId);

  // Last 4 non-input lines for the event log
  const recentLines = lines.filter(l => l.type !== 'input').slice(-4);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>

      {/* ── Location header ── */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--ui-gold-border)',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 9, letterSpacing: '0.18em', color: 'var(--ui-gold-dim)', textTransform: 'uppercase', fontFamily: 'var(--font-dossier)', marginBottom: 3 }}>
          {worldTitle} · Location
        </div>
        <div style={{ fontSize: 19, color: 'var(--ui-gold)', fontFamily: 'Georgia, serif' }}>
          {currentRoomName || 'Unknown Location'}
        </div>
      </div>

      {/* ── Body: zones + sidebar ── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* Zone grid */}
        <div style={{ flex: 1, padding: '11px 12px', overflowY: 'auto' }}>
          {zoneActions.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7 }}>
              {zoneActions.map(action => (
                <ZoneCard
                  key={action.command}
                  action={action}
                  kind={classifyAction(action.command)}
                  onClick={() => submitCommand(action.command)}
                />
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--ui-dim)', fontStyle: 'italic', fontSize: 13, fontFamily: 'Georgia, serif', marginTop: '0.5rem' }}>
              Nothing to interact with here.
            </div>
          )}

          {/* Event log */}
          {recentLines.length > 0 && (
            <div style={{ marginTop: 14, borderTop: '1px solid var(--ui-gold-border)', paddingTop: 10 }}>
              <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ui-gold-dim)', fontFamily: 'var(--font-dossier)', marginBottom: 7 }}>
                Recent events
              </div>
              {recentLines.map((line, i) => (
                <div key={line.id} style={{
                  fontSize: 12,
                  lineHeight: 1.65,
                  color: i === recentLines.length - 1 ? 'var(--ui-cream)' : 'var(--ui-dim)',
                  fontFamily: 'Georgia, serif',
                  paddingBottom: 5,
                  borderBottom: i < recentLines.length - 1 ? '1px solid rgba(200,168,74,0.06)' : 'none',
                  marginBottom: i < recentLines.length - 1 ? 5 : 0,
                }}>
                  {line.text}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar: present + exits */}
        <div style={{
          width: 168, flexShrink: 0,
          borderLeft: '1px solid var(--ui-gold-border)',
          padding: '11px',
          background: 'var(--ui-bg-2)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          overflowY: 'auto',
        }}>

          {/* Hostiles */}
          {visibleEnemies.length > 0 && (
            <div>
              <div style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ui-gold-dim)', fontFamily: 'var(--font-dossier)', marginBottom: 5 }}>
                Hostile
              </div>
              {visibleEnemies.map((enemy, i) => {
                const hpPct = enemy.max_hp > 0 ? Math.max(0, Math.min(1, enemy.hp / enemy.max_hp)) : 0;
                return (
                  <div key={i} style={{
                    background: 'var(--ui-card)',
                    border: '1px solid var(--ui-red-dim)',
                    borderRadius: 2,
                    padding: '5px 7px',
                    marginBottom: 4,
                  }}>
                    <div style={{ fontSize: 10.5, color: 'var(--ui-red-hi)', fontFamily: 'var(--font-dossier)', fontWeight: 'bold' }}>{enemy.name}</div>
                    <div style={{ fontSize: 9, color: 'var(--ui-dim)', marginTop: 1 }}>{enemy.hp} / {enemy.max_hp} HP</div>
                    <div style={{ height: 2, background: 'rgba(212,200,168,0.08)', borderRadius: 1, overflow: 'hidden', marginTop: 3 }}>
                      <div style={{ height: '100%', background: 'var(--ui-bar-enemy)', width: `${hpPct * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* NPCs from talk actions */}
          {talkActions.length > 0 && (
            <div>
              <div style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ui-gold-dim)', fontFamily: 'var(--font-dossier)', marginBottom: 5 }}>
                Present
              </div>
              {talkActions.map(a => (
                <div
                  key={a.command}
                  onClick={() => submitCommand(a.command)}
                  style={{
                    background: 'var(--ui-card)',
                    border: '1px solid var(--ui-gold-border)',
                    borderRadius: 2,
                    padding: '5px 7px',
                    marginBottom: 4,
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--ui-gold-border-hi)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--ui-gold-border)'}
                >
                  <div style={{ fontSize: 10, color: 'var(--ui-cream)', fontFamily: 'var(--font-dossier)' }}>
                    {extractNpcName(a.label)}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--ui-dim)' }}>Talk</div>
                </div>
              ))}
            </div>
          )}

          {/* Exits */}
          {moveActions.length > 0 && (
            <div style={{ marginTop: 'auto' }}>
              <div style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ui-gold-dim)', fontFamily: 'var(--font-dossier)', marginBottom: 5 }}>
                Exits
              </div>
              {moveActions.map(a => (
                <div
                  key={a.command}
                  onClick={() => submitCommand(a.command)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    background: 'var(--ui-card)', border: '1px solid var(--ui-gold-border)',
                    borderRadius: 2, padding: '5px 7px', marginBottom: 3, cursor: 'pointer',
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--ui-gold-border-hi)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--ui-gold-border)'}
                >
                  <span style={{ fontSize: 10, color: 'var(--ui-blue)', fontWeight: 'bold', fontFamily: 'var(--font-dossier)', width: 16, flexShrink: 0 }}>
                    {dirLabel(a.command)}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--ui-dim)', fontFamily: 'var(--font-dossier)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {exitDestination(a.label)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Fallback parser */}
          <div style={{ paddingTop: 8, borderTop: '1px solid var(--ui-gold-border)' }}>
            <div style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--ui-gold-dim)', fontFamily: 'var(--font-dossier)', marginBottom: 5 }}>Command</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: 'var(--ui-gold-dim)', fontFamily: 'Georgia, serif', fontSize: 14 }}>›</span>
              <input
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const val = (e.target as HTMLInputElement).value.trim();
                    if (val) { submitCommand(val); (e.target as HTMLInputElement).value = ''; }
                  }
                }}
                placeholder="type a command…"
                style={{
                  flex: 1, background: 'transparent', border: 'none',
                  borderBottom: '1px solid var(--ui-gold-border)', outline: 'none',
                  color: 'var(--ui-cream)', fontFamily: 'var(--font-dossier)',
                  fontSize: 10, padding: '2px 0', caretColor: 'var(--ui-gold)',
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
