import { useGameStore } from '@/store/gameStore';
import type { CharacterStateDTO, EnemyStateDTO } from '@/types/contracts';

// ── Shared bar ───────────────────────────────────────────────────────────────

function HpBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div style={{ height: 7, background: 'rgba(212,200,168,0.08)', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${pct * 100}%`, height: '100%', background: color, transition: 'width 0.3s' }} />
    </div>
  );
}

// ── Combatant cards ───────────────────────────────────────────────────────────

function PlayerCard({ ch }: { ch: CharacterStateDTO }) {
  const hpLow = ch.hp <= ch.max_hp * 0.3;
  return (
    <div style={{
      flex: 1, padding: '13px 15px',
      background: 'var(--ui-card)',
      border: '1px solid var(--ui-gold-border)',
      borderTop: '2px solid var(--ui-blue)',
      borderRadius: 2,
      fontFamily: 'var(--font-dossier)',
    }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{
          width: 52, height: 60, flexShrink: 0, borderRadius: 2,
          background: 'var(--ui-blue-dim)', border: '1px solid rgba(100,140,210,0.25)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}>
          <i className="ti ti-user" aria-hidden="true" style={{ fontSize: 24, color: 'var(--ui-blue)' }} />
          <span style={{ fontSize: 7.5, letterSpacing: '0.1em', color: 'var(--ui-gold-dim)' }}>{ch.class_id.toUpperCase()}</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, color: 'var(--ui-cream)', fontFamily: 'Georgia, serif', marginBottom: 1 }}>{ch.name}</div>
          <div style={{ fontSize: 9.5, color: 'var(--ui-dim)', marginBottom: 8 }}>Level {ch.level}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 3 }}>
            <span style={{ color: 'var(--ui-dim)' }}>HP</span>
            <span style={{ color: hpLow ? 'var(--ui-red-hi)' : 'var(--ui-cream)', fontWeight: 'bold' }}>{ch.hp}/{ch.max_hp}</span>
          </div>
          <HpBar value={ch.hp} max={ch.max_hp} color={hpLow ? 'var(--ui-bar-hp-low)' : 'var(--ui-bar-hp)'} />
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
            {[['ATK', ch.attack], ['DEF', ch.defense], ['INT', ch.intelligence]] .map(([l, v]) => (
              <span key={l} style={{
                fontSize: 9, padding: '1px 5px',
                border: '1px solid var(--ui-gold-border)', borderRadius: 2,
                color: 'var(--ui-dim)',
              }}>{l} {v}</span>
            ))}
          </div>
          {ch.active_effects.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
              {ch.active_effects.map(fx => (
                <span key={fx} style={{ fontSize: 9, padding: '1px 5px', border: '1px solid var(--ui-red-dim)', color: 'var(--ui-red-hi)', borderRadius: 2 }}>{fx}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EnemyCard({ enemy }: { enemy: EnemyStateDTO }) {
  const hpLow = enemy.hp <= enemy.max_hp * 0.3;
  return (
    <div style={{
      flex: 1, padding: '13px 15px',
      background: 'var(--ui-card)',
      border: '1px solid var(--ui-red-dim)',
      borderTop: '2px solid var(--ui-red)',
      borderRadius: 2,
      fontFamily: 'var(--font-dossier)',
    }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{
          width: 52, height: 60, flexShrink: 0, borderRadius: 2,
          background: 'var(--ui-red-dim)', border: '1px solid rgba(154,58,58,0.3)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}>
          <i className="ti ti-bug" aria-hidden="true" style={{ fontSize: 24, color: 'var(--ui-red-hi)' }} />
          <span style={{ fontSize: 7.5, letterSpacing: '0.1em', color: 'rgba(154,58,58,0.5)' }}>HOSTILE</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, color: 'rgba(200,100,100,0.9)', fontFamily: 'Georgia, serif', marginBottom: 1 }}>{enemy.name}</div>
          <div style={{ fontSize: 9.5, color: 'var(--ui-dim)', marginBottom: 8 }}>
            {hpLow ? 'Weakened' : 'Hostile'}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 3 }}>
            <span style={{ color: 'var(--ui-dim)' }}>HP</span>
            <span style={{ color: hpLow ? 'var(--ui-red-hi)' : 'rgba(200,100,100,0.9)', fontWeight: 'bold' }}>{enemy.hp}/{enemy.max_hp}</span>
          </div>
          <HpBar value={enemy.hp} max={enemy.max_hp} color="var(--ui-bar-enemy)" />
          {enemy.active_effects.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
              {enemy.active_effects.map(fx => (
                <span key={fx} style={{ fontSize: 9, padding: '1px 5px', border: '1px solid var(--ui-red-dim)', color: 'var(--ui-red-hi)', borderRadius: 2 }}>{fx}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Action card ───────────────────────────────────────────────────────────────

function ActionCard({
  icon, title, desc, accentColor, disabled = false, onClick, children,
}: {
  icon: string; title: string; desc?: string; accentColor?: string;
  disabled?: boolean; onClick?: () => void; children?: React.ReactNode;
}) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      style={{
        background: 'var(--ui-card)',
        border: '1px solid var(--ui-gold-border)',
        borderTop: `2px solid ${accentColor ?? 'rgba(212,200,168,0.15)'}`,
        borderRadius: 2,
        padding: '10px 11px',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.3 : 1,
        display: 'flex', alignItems: 'flex-start', gap: 9,
        transition: 'border-color 0.12s, background 0.1s',
      }}
      onMouseEnter={e => { if (!disabled) { (e.currentTarget as HTMLElement).style.borderColor = 'var(--ui-gold-border-hi)'; (e.currentTarget as HTMLElement).style.background = 'var(--ui-card-hover)'; } }}
      onMouseLeave={e => { if (!disabled) { (e.currentTarget as HTMLElement).style.borderColor = 'var(--ui-gold-border)'; (e.currentTarget as HTMLElement).style.background = 'var(--ui-card)'; } }}
    >
      <i className={`ti ${icon}`} aria-hidden="true" style={{ fontSize: 18, color: accentColor ?? 'var(--ui-dim)', flexShrink: 0, lineHeight: 1.3, marginTop: 1 }} />
      <div style={{ flex: 1, fontFamily: 'var(--font-dossier)' }}>
        <div style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--ui-cream)', marginBottom: 2 }}>{title}</div>
        {desc && <div style={{ fontSize: 10, color: 'var(--ui-dim)', lineHeight: 1.45 }}>{desc}</div>}
        {children}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

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
  const recentLines    = lines.filter(l => l.type !== 'input').slice(-3);

  const attackAction   = contextActions.find(a => a.command.startsWith('attack') || a.command.startsWith('fight'));
  const abilityActions = contextActions.filter(a => {
    const cmd = a.command.toLowerCase();
    const verb = cmd.split(/\s+/)[0];
    return verb !== 'attack' && verb !== 'fight' && !['north','south','east','west','up','down','ne','nw','se','sw'].includes(verb) && verb !== 'go';
  });

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>

      {/* ── Combatants ── */}
      <div style={{
        display: 'flex', gap: 10,
        padding: '12px 16px',
        borderBottom: '1px solid var(--ui-gold-border)',
        flexShrink: 0,
      }}>
        <PlayerCard ch={playerCharacter} />
        <div style={{
          width: 42, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'rgba(200,168,74,0.2)', fontSize: 11, fontFamily: 'var(--font-dossier)',
          borderLeft: '1px solid var(--ui-gold-border)', borderRight: '1px solid var(--ui-gold-border)',
          background: 'var(--ui-bg-2)',
        }}>
          VS
        </div>
        {visibleEnemies.length > 0
          ? visibleEnemies.map((e, i) => <EnemyCard key={i} enemy={e} />)
          : (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--ui-dim)', fontSize: 13, fontStyle: 'italic', fontFamily: 'Georgia, serif',
            }}>
              All enemies defeated.
            </div>
          )
        }
      </div>

      {/* ── Combat log ── */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--ui-gold-border)',
        flexShrink: 0, minHeight: 70,
      }}>
        <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ui-gold-dim)', fontFamily: 'var(--font-dossier)', marginBottom: 7 }}>
          Combat log
        </div>
        {recentLines.map((line, i) => (
          <div key={line.id} style={{
            fontSize: 12.5, lineHeight: 1.65, fontFamily: 'Georgia, serif',
            color: i === recentLines.length - 1 ? 'var(--ui-cream)' : 'var(--ui-dim)',
            paddingLeft: i === recentLines.length - 1 ? 10 : 0,
            borderLeft: i === recentLines.length - 1 ? '2px solid var(--ui-gold)' : '2px solid transparent',
            marginBottom: 3,
          }}>
            {line.text}
          </div>
        ))}
      </div>

      {/* ── Actions ── */}
      <div style={{ flex: 1, padding: '10px 14px', overflowY: 'auto' }}>
        <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ui-gold-dim)', fontFamily: 'var(--font-dossier)', marginBottom: 7 }}>
          Your turn
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
          <ActionCard
            icon="ti-sword"
            title={attackAction?.label ?? 'Attack'}
            desc="Strike with your equipped weapon."
            accentColor="var(--ui-red)"
            disabled={!attackAction}
            onClick={() => attackAction && submitCommand(attackAction.command)}
          />

          <ActionCard
            icon="ti-sparkles"
            title="Abilities"
            desc={abilityActions.length > 0 ? `${abilityActions.length} available` : 'No abilities unlocked yet.'}
            accentColor="var(--ui-blue)"
            disabled={abilityActions.length === 0}
          >
            {abilityActions.length > 0 && (
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {abilityActions.map(a => (
                  <button
                    key={a.command}
                    onClick={e => { e.stopPropagation(); submitCommand(a.command); }}
                    style={{
                      background: 'rgba(100,140,210,0.06)',
                      border: '1px solid rgba(100,140,210,0.2)',
                      color: 'var(--ui-blue)',
                      fontFamily: 'var(--font-dossier)',
                      fontSize: 10.5,
                      padding: '4px 7px',
                      cursor: 'pointer',
                      borderRadius: 2,
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
            icon="ti-backpack"
            title="Use Item"
            desc="Open inventory — costs your turn."
            accentColor="rgba(200,168,74,0.55)"
            onClick={() => setScreen('inventory')}
          />

          <ActionCard
            icon="ti-run"
            title="Flee"
            desc="Cannot retreat mid-combat."
            disabled
          />
        </div>

        {/* Parser fallback */}
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--ui-gold-dim)', fontFamily: 'Georgia, serif', fontSize: 14 }}>›</span>
          <input
            onKeyDown={e => {
              if (e.key === 'Enter') {
                const val = (e.target as HTMLInputElement).value.trim();
                if (val) { submitCommand(val); (e.target as HTMLInputElement).value = ''; }
              }
            }}
            placeholder="or type a command…"
            style={{
              flex: 1, background: 'transparent', border: 'none',
              borderBottom: '1px solid var(--ui-gold-border)', outline: 'none',
              color: 'var(--ui-cream)', fontFamily: 'var(--font-dossier)',
              fontSize: 10.5, padding: '2px 0', caretColor: 'var(--ui-gold)',
            }}
          />
        </div>
      </div>
    </div>
  );
}
