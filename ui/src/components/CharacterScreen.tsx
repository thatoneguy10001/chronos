import { useGameStore } from '@/store/gameStore';
import { SectionLabel } from '@/components/Panel';

const XP_THRESHOLDS = [100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500];

function xpToNext(level: number): number | null {
  return XP_THRESHOLDS[level - 1] ?? null;
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div style={{ background: 'var(--bar-bg)', height: 5, borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${pct * 100}%`, height: '100%', background: color, transition: 'width 0.3s' }} />
    </div>
  );
}

function StatLine({ label, value, gear }: { label: string; value: number; gear?: number }) {
  if (value === 0 && !gear) return null;
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      fontSize: '0.8em', marginBottom: 3, fontFamily: 'var(--font-dossier)',
    }}>
      <span style={{ color: 'var(--text-label)', letterSpacing: '0.04em' }}>{label}</span>
      <span style={{ color: 'var(--j-text)' }}>
        {value}
        {gear != null && gear !== 0 && (
          <span style={{ fontSize: '0.8em', color: gear > 0 ? 'var(--green-bright)' : 'var(--danger-text)', marginLeft: '0.3em' }}>
            ({gear > 0 ? '+' : ''}{gear})
          </span>
        )}
      </span>
    </div>
  );
}

export function CharacterScreen() {
  const ch              = useGameStore(s => s.playerCharacter);
  const currencyName    = useGameStore(s => s.currencyName);
  const currencySymbol  = useGameStore(s => s.currencySymbol);
  const sec2ndName      = useGameStore(s => s.secondaryCurrencyName);
  const sec2ndSymbol    = useGameStore(s => s.secondaryCurrencySymbol);

  if (!ch) return null;

  const nextXp   = xpToNext(ch.level);
  const prevXp   = ch.level > 1 ? (XP_THRESHOLDS[ch.level - 2] ?? 0) : 0;
  const xpInLevel  = ch.xp - prevXp;
  const xpNeeded = nextXp != null ? nextXp - prevXp : null;
  const hpLow    = ch.hp <= ch.max_hp * 0.3;

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden', fontFamily: 'var(--font-dossier)' }}>

      {/* ── Left: Identity + stats ── */}
      <div style={{
        width: 280, flexShrink: 0,
        borderRight: '1px solid var(--ink-divider)',
        padding: '0.75rem 1rem',
        overflowY: 'auto',
      }}>
        {/* Portrait row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div style={{
            width: 44, height: 44, borderRadius: 2, flexShrink: 0,
            border: '1px solid var(--j-border)',
            background: 'var(--parchment-mid)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.5em', color: 'var(--ink-movement)',
          }}>
            ☩
          </div>
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '0.95em', color: 'var(--j-text)' }}>{ch.name}</div>
            <div style={{ fontSize: '0.72em', color: 'var(--text-label)', marginTop: 1 }}>{ch.class_id}</div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
              marginTop: '0.2rem',
              fontSize: '0.65em', padding: '0.1rem 0.5rem',
              border: '1px solid var(--blue-dim)', color: 'var(--blue)',
              borderRadius: 2, letterSpacing: '0.06em',
            }}>
              LV {ch.level}
            </div>
          </div>
        </div>

        {/* HP */}
        <div style={{ marginBottom: '0.6rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75em', marginBottom: 3 }}>
            <span style={{ color: 'var(--text-label)' }}>HP</span>
            <span style={{ color: hpLow ? 'var(--danger-low)' : 'var(--j-text)' }}>{ch.hp}/{ch.max_hp}</span>
          </div>
          <Bar value={ch.hp} max={ch.max_hp} color={hpLow ? 'var(--bar-hp-low)' : 'var(--bar-hp)'} />
        </div>

        {/* XP */}
        {xpNeeded != null && (
          <div style={{ marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72em', marginBottom: 3 }}>
              <span style={{ color: 'var(--text-label)' }}>XP</span>
              <span style={{ color: 'var(--xp-text)' }}>{xpInLevel}/{xpNeeded}</span>
            </div>
            <Bar value={xpInLevel} max={xpNeeded} color="var(--bar-xp)" />
          </div>
        )}
        {xpNeeded == null && (
          <div style={{ fontSize: '0.72em', color: 'var(--xp-text)', marginBottom: '0.75rem' }}>MAX LEVEL</div>
        )}

        {/* Stats */}
        <div style={{ borderTop: '1px solid var(--j-divider)', paddingTop: '0.5rem', marginBottom: '0.6rem' }}>
          <SectionLabel style={{ display: 'block', marginBottom: '0.4rem' }}>Combat Stats</SectionLabel>
          <StatLine label="ATK"      value={ch.attack}       />
          <StatLine label="DEF"      value={ch.defense}      />
          <StatLine label="INT"      value={ch.intelligence} />
          <StatLine label="HIT"      value={ch.hit}          />
          <StatLine label="TECH ATK" value={ch.tech_attack}  />
          <StatLine label="EVA"      value={ch.evasion}      />
          <StatLine label="ENDURANCE" value={ch.endurance}   />
          <StatLine label="LCK"      value={ch.luck}         />
          <StatLine label="AGI"      value={ch.agility}      />
        </div>

        {/* Currency */}
        <div style={{ borderTop: '1px solid var(--j-divider)', paddingTop: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8em', marginBottom: 2 }}>
            <span style={{ color: 'var(--gold-dim)' }}>{currencyName.toUpperCase()}</span>
            <span style={{ color: 'var(--gold)', fontWeight: 'bold' }}>{currencySymbol} {ch.gold ?? 0}</span>
          </div>
          {sec2ndName && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8em' }}>
              <span style={{ color: 'var(--blue-dim)' }}>{sec2ndName.toUpperCase()}</span>
              <span style={{ color: 'var(--blue)', fontWeight: 'bold' }}>{sec2ndSymbol} {ch.shards ?? 0}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Effects + Quests ── */}
      <div style={{ flex: 1, padding: '0.75rem 1rem', overflowY: 'auto' }}>

        {ch.active_effects.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <SectionLabel style={{ display: 'block', marginBottom: '0.5rem' }}>Active Effects</SectionLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
              {ch.active_effects.map(fx => {
                const isBuff   = /\+/.test(fx);
                const isDebuff = /bleed|poison|burn|corrode|blind|chill|frozen|weaken/i.test(fx);
                const color       = isBuff ? 'var(--green-bright)' : isDebuff ? 'var(--danger-text)' : 'var(--text-label)';
                const borderColor = isBuff ? 'rgba(26,74,26,0.4)' : isDebuff ? 'rgba(139,26,26,0.4)' : 'var(--j-border)';
                return (
                  <span key={fx} style={{
                    fontSize: '0.72em', padding: '0.15rem 0.45rem',
                    border: `1px solid ${borderColor}`, color, borderRadius: 2,
                    letterSpacing: '0.04em', fontFamily: 'var(--font-dossier)',
                  }}>
                    {fx}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {ch.active_quests.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <SectionLabel style={{ display: 'block', marginBottom: '0.5rem' }}>Active Quests</SectionLabel>
            {ch.active_quests.map(q => (
              <div key={q.quest_id} style={{
                marginBottom: '0.6rem',
                padding: '0.5rem 0.6rem',
                border: '1px solid var(--j-border)',
                borderRadius: 2,
                background: 'var(--parchment-light)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8em', marginBottom: 2 }}>
                  <span style={{ color: q.completed ? 'var(--text-label)' : 'var(--j-text)', fontFamily: 'var(--font-dossier)' }}>
                    {q.name}
                  </span>
                  <span style={{ color: q.completed ? 'var(--green-bright)' : 'var(--xp-text)', fontSize: '0.9em', flexShrink: 0, marginLeft: '0.5rem' }}>
                    {q.completed ? '✓ done' : `${q.progress}/${q.target}`}
                  </span>
                </div>
                {!q.completed && (
                  <div style={{ fontSize: '0.7em', color: 'var(--text-label)', fontFamily: 'var(--font-journal)', lineHeight: 1.4 }}>
                    {q.objective_hint}
                  </div>
                )}
                {!q.completed && q.target > 1 && (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ background: 'var(--bar-bg)', height: 3, borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(1, q.progress / q.target) * 100}%`, height: '100%', background: 'var(--bar-quest)' }} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {ch.active_effects.length === 0 && ch.active_quests.length === 0 && (
          <div style={{ color: 'var(--ink-faint)', fontStyle: 'italic', fontSize: '0.85em', marginTop: '0.5rem', fontFamily: 'var(--font-journal)' }}>
            No active effects or quests.
          </div>
        )}

        {/* Abilities placeholder */}
        <div style={{ borderTop: '1px solid var(--j-divider)', paddingTop: '0.5rem', marginTop: '0.5rem' }}>
          <SectionLabel style={{ display: 'block', marginBottom: '0.4rem' }}>Abilities</SectionLabel>
          <div style={{ fontSize: '0.78em', color: 'var(--ink-faint)', fontStyle: 'italic', fontFamily: 'var(--font-journal)', lineHeight: 1.6 }}>
            Abilities are learned as you level up. Check the combat screen to use them in battle.
          </div>
        </div>
      </div>
    </div>
  );
}
