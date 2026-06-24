import { useGameStore } from '@/store/gameStore';
import type { CharacterStateDTO, EnemyStateDTO } from '@/types/contracts';

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div style={{ background: 'var(--bar-bg)', height: 6, borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${pct * 100}%`, height: '100%', background: color, transition: 'width 0.3s' }} />
    </div>
  );
}

function PlayerCard({ ch }: { ch: CharacterStateDTO }) {
  const hpLow = ch.hp <= ch.max_hp * 0.3;
  return (
    <div style={{
      flex: 1,
      borderLeft: '3px solid var(--blue)',
      border: '1px solid var(--j-border)',
      borderLeftWidth: 3,
      borderLeftColor: 'var(--blue)',
      borderRadius: 2,
      padding: '0.75rem',
      background: 'var(--parchment-light)',
      fontFamily: 'var(--font-dossier)',
    }}>
      <div style={{ fontWeight: 'bold', fontSize: '0.9em', color: 'var(--j-text)', marginBottom: 1 }}>{ch.name}</div>
      <div style={{ fontSize: '0.7em', color: 'var(--text-label)', marginBottom: '0.5rem' }}>{ch.class_id} · Lv {ch.level}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75em', marginBottom: 3 }}>
        <span style={{ color: 'var(--text-label)' }}>HP</span>
        <span style={{ color: hpLow ? 'var(--danger-low)' : 'var(--j-text)' }}>{ch.hp}/{ch.max_hp}</span>
      </div>
      <Bar value={ch.hp} max={ch.max_hp} color={hpLow ? 'var(--bar-hp-low)' : 'var(--bar-hp)'} />
      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
        {[['ATK', ch.attack], ['DEF', ch.defense], ['INT', ch.intelligence]] .map(([l, v]) => (
          <span key={l} style={{
            fontSize: '0.65em', padding: '0.1rem 0.35rem',
            border: '1px solid var(--j-border)', borderRadius: 2,
            color: 'var(--text-label)', letterSpacing: '0.04em',
          }}>{l} {v}</span>
        ))}
      </div>
      {ch.active_effects.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.2rem', marginTop: '0.4rem' }}>
          {ch.active_effects.map(fx => (
            <span key={fx} style={{
              fontSize: '0.6em', padding: '0.1rem 0.35rem',
              border: '1px solid var(--ink-combat)', color: 'var(--ink-combat)', borderRadius: 2,
            }}>{fx}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function EnemyCard({ enemy }: { enemy: EnemyStateDTO }) {
  const hpLow = enemy.hp <= enemy.max_hp * 0.3;
  return (
    <div style={{
      flex: 1,
      border: '1px solid var(--danger-border)',
      borderLeftWidth: 3,
      borderLeftColor: 'var(--danger-text)',
      borderRadius: 2,
      padding: '0.75rem',
      background: 'var(--parchment-light)',
      fontFamily: 'var(--font-dossier)',
    }}>
      <div style={{ fontWeight: 'bold', fontSize: '0.9em', color: 'var(--danger-text)', marginBottom: 1 }}>{enemy.name}</div>
      <div style={{ fontSize: '0.7em', color: 'var(--text-label)', marginBottom: '0.5rem' }}>Hostile</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75em', marginBottom: 3 }}>
        <span style={{ color: 'var(--text-label)' }}>HP</span>
        <span style={{ color: hpLow ? 'var(--danger-low)' : 'var(--danger-mid)' }}>{enemy.hp}/{enemy.max_hp}</span>
      </div>
      <Bar value={enemy.hp} max={enemy.max_hp} color={hpLow ? 'var(--bar-hp-low)' : 'var(--danger-bar)'} />
      {enemy.active_effects.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.2rem', marginTop: '0.4rem' }}>
          {enemy.active_effects.map(fx => (
            <span key={fx} style={{
              fontSize: '0.6em', padding: '0.1rem 0.35rem',
              border: '1px solid var(--ink-combat)', color: 'var(--ink-combat)', borderRadius: 2,
            }}>{fx}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionCard({
  icon, title, desc, accent, disabled = false, onClick, children,
}: {
  icon: string; title: string; desc?: string; accent?: string;
  disabled?: boolean; onClick?: () => void; children?: React.ReactNode;
}) {
  const borderColor = accent ?? 'var(--j-border)';
  return (
    <div
      onClick={disabled ? undefined : onClick}
      style={{
        background: 'var(--parchment-light)',
        border: `1px solid var(--j-border)`,
        borderLeft: `3px solid ${borderColor}`,
        borderRadius: 2,
        padding: '0.7rem 0.75rem',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.38 : 1,
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.5rem',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLElement).style.background = 'var(--parchment-cream)'; }}
      onMouseLeave={e => { if (!disabled) (e.currentTarget as HTMLElement).style.background = 'var(--parchment-light)'; }}
    >
      <span style={{ fontSize: '1em', flexShrink: 0, lineHeight: 1.4 }}>{icon}</span>
      <div style={{ flex: 1, fontFamily: 'var(--font-dossier)' }}>
        <div style={{ fontSize: '0.85em', fontWeight: 'bold', color: 'var(--j-text)', marginBottom: 1 }}>{title}</div>
        {desc && <div style={{ fontSize: '0.7em', color: 'var(--text-label)', lineHeight: 1.4 }}>{desc}</div>}
        {children}
      </div>
    </div>
  );
}

export function CombatScreen() {
  const playerCharacter = useGameStore(s => s.playerCharacter);
  const enemies         = useGameStore(s => s.enemies);
  const currentRoomId   = useGameStore(s => s.currentRoomId);
  const contextActions  = useGameStore(s => s.contextActions);
  const lines           = useGameStore(s => s.lines);
  const submitCommand   = useGameStore(s => s.submitCommand);
  const setScreen       = useGameStore(s => s.setScreen);

  if (!playerCharacter) return null;

  const visibleEnemies = enemies.filter(e => e.hp > 0 && e.room_id === currentRoomId);
  const recentLines = lines.filter(l => l.type !== 'input').slice(-4);

  const attackAction   = contextActions.find(a => a.command.startsWith('attack'));
  const abilityActions = contextActions.filter(a =>
    !a.command.startsWith('attack') &&
    !['north','south','east','west','up','down','ne','nw','se','sw']
      .some(d => a.command === d || a.command.startsWith(`go ${d}`))
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>

      {/* ── Combatants ── */}
      <div style={{
        display: 'flex', gap: '0.75rem',
        padding: '0.75rem 1.25rem',
        borderBottom: '1px solid var(--ink-divider)',
        flexShrink: 0,
      }}>
        <PlayerCard ch={playerCharacter} />
        {visibleEnemies.length > 0
          ? visibleEnemies.map((e, i) => <EnemyCard key={i} enemy={e} />)
          : (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-label)', fontSize: '0.8em', fontStyle: 'italic',
              fontFamily: 'var(--font-journal)',
            }}>
              All enemies defeated.
            </div>
          )
        }
      </div>

      {/* ── Combat log ── */}
      <div style={{
        padding: '0.6rem 1.25rem',
        borderBottom: '1px solid var(--ink-divider)',
        flexShrink: 0,
        minHeight: 72,
      }}>
        <div style={{
          fontSize: '0.6em', letterSpacing: '0.12em',
          color: 'var(--text-label)', textTransform: 'uppercase', marginBottom: '0.35rem',
          fontFamily: 'var(--font-dossier)',
        }}>
          Combat Log
        </div>
        {recentLines.map((line, i) => (
          <div key={line.id} style={{
            fontSize: '0.88em',
            lineHeight: 1.6,
            color: i === recentLines.length - 1 ? 'var(--ink-narrative)' : 'var(--ink-faint)',
            fontFamily: 'var(--font-journal)',
          }}>
            {line.text}
          </div>
        ))}
      </div>

      {/* ── Action cards ── */}
      <div style={{ flex: 1, padding: '0.75rem 1.25rem', overflowY: 'auto' }}>
        <div style={{
          fontSize: '0.6em', letterSpacing: '0.12em',
          color: 'var(--text-label)', textTransform: 'uppercase', marginBottom: '0.6rem',
          fontFamily: 'var(--font-dossier)',
        }}>
          Your Turn
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <ActionCard
            icon="⚔"
            title={attackAction?.label ?? 'Attack'}
            desc="Strike with your equipped weapon."
            accent="var(--danger-text)"
            disabled={!attackAction}
            onClick={() => attackAction && submitCommand(attackAction.command)}
          />

          <ActionCard
            icon="✦"
            title="Abilities"
            desc={abilityActions.length > 0 ? `${abilityActions.length} available` : 'No abilities unlocked yet.'}
            accent="var(--blue)"
            disabled={abilityActions.length === 0}
          >
            {abilityActions.length > 0 && (
              <div style={{ marginTop: '0.35rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                {abilityActions.map(a => (
                  <button
                    key={a.command}
                    onClick={e => { e.stopPropagation(); submitCommand(a.command); }}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--j-border)',
                      color: 'var(--j-text)',
                      fontFamily: 'var(--font-dossier)',
                      fontSize: '0.75em',
                      padding: '0.2rem 0.5rem',
                      cursor: 'pointer',
                      borderRadius: 1,
                      textAlign: 'left',
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </ActionCard>

          <ActionCard
            icon="⊞"
            title="Inventory"
            desc="Use a consumable — costs your turn."
            accent="var(--gold)"
            onClick={() => setScreen('inventory')}
          />

          <ActionCard
            icon="↩"
            title="Flee"
            desc="Cannot retreat mid-combat."
            disabled
          />
        </div>

        {/* Fallback parser */}
        <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ color: 'var(--ink-faint)', fontFamily: 'var(--font-journal)', fontSize: '1.1em' }}>›</span>
          <input
            onKeyDown={e => {
              if (e.key === 'Enter') {
                const val = (e.target as HTMLInputElement).value.trim();
                if (val) { submitCommand(val); (e.target as HTMLInputElement).value = ''; }
              }
            }}
            placeholder="or type a command..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid var(--ink-divider)',
              outline: 'none',
              color: 'var(--ink-narrative)',
              fontFamily: 'var(--font-journal)',
              fontSize: '0.95em',
              padding: '0.2rem 0',
              caretColor: 'var(--ink-narrative)',
            }}
          />
        </div>
      </div>
    </div>
  );
}
