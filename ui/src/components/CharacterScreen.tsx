import { useGameStore } from '@/store/gameStore';

const XP_THRESHOLDS = [100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500];

function xpToNext(level: number): number | null {
  return XP_THRESHOLDS[level - 1] ?? null;
}

function SmallBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div style={{ background: 'rgba(212,200,168,0.08)', height: 4, borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${pct * 100}%`, height: '100%', background: color, transition: 'width 0.3s' }} />
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: number }) {
  if (!value) return null;
  const pct = Math.min(1, value / 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
      <span style={{ fontSize: 9, letterSpacing: '0.1em', color: 'var(--ui-dim)', fontFamily: 'var(--font-dossier)', width: 60, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, background: 'rgba(200,168,74,0.06)', height: 3, borderRadius: 1, overflow: 'hidden' }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', background: 'rgba(200,168,74,0.35)' }} />
      </div>
      <span style={{ fontSize: 10, color: 'var(--ui-cream)', fontFamily: 'var(--font-dossier)', width: 22, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

export function CharacterScreen() {
  const ch             = useGameStore(s => s.playerCharacter);
  const currencyName   = useGameStore(s => s.currencyName);
  const currencySymbol = useGameStore(s => s.currencySymbol);
  const sec2ndName     = useGameStore(s => s.secondaryCurrencyName);
  const sec2ndSymbol   = useGameStore(s => s.secondaryCurrencySymbol);

  if (!ch) return null;

  const nextXp    = xpToNext(ch.level);
  const prevXp    = ch.level > 1 ? (XP_THRESHOLDS[ch.level - 2] ?? 0) : 0;
  const xpInLevel = ch.xp - prevXp;
  const xpNeeded  = nextXp != null ? nextXp - prevXp : null;
  const hpLow     = ch.hp <= ch.max_hp * 0.3;

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden', fontFamily: 'var(--font-dossier)' }}>

      {/* ── Col 1: Portrait + identity ── */}
      <div style={{
        width: 168, flexShrink: 0,
        borderRight: '1px solid var(--ui-gold-border)',
        padding: 13,
        background: 'var(--ui-bg-2)',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}>
        {/* Portrait */}
        <div style={{
          height: 90,
          background: 'linear-gradient(145deg, rgba(200,168,74,0.06) 0%, rgba(100,140,210,0.05) 100%)',
          border: '1px solid var(--ui-gold-border)',
          borderRadius: 2,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5,
        }}>
          <i className="ti ti-user-circle" aria-hidden="true" style={{ fontSize: 34, color: 'rgba(200,168,74,0.4)' }} />
          <span style={{ fontSize: 7.5, letterSpacing: '0.14em', color: 'var(--ui-gold-dim)' }}>
            {ch.class_id.toUpperCase()}
          </span>
        </div>

        <div>
          <div style={{ fontSize: 16, fontFamily: 'Georgia, serif', color: 'var(--ui-cream)', marginBottom: 2 }}>{ch.name}</div>
          <div style={{ fontSize: 9, color: 'var(--ui-dim)', letterSpacing: '0.08em' }}>{ch.class_id}</div>
          <div style={{
            display: 'inline-block', marginTop: 5,
            fontSize: 8.5, padding: '2px 8px',
            border: '1px solid var(--ui-gold-border)', borderRadius: 2,
            color: 'var(--ui-gold)', letterSpacing: '0.12em',
          }}>
            LEVEL {ch.level}
          </div>
        </div>

        {/* HP */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, marginBottom: 3 }}>
            <span style={{ color: 'var(--ui-dim)' }}>HP</span>
            <span style={{ color: hpLow ? 'var(--ui-red-hi)' : 'var(--ui-cream)', fontWeight: 'bold' }}>{ch.hp}/{ch.max_hp}</span>
          </div>
          <SmallBar value={ch.hp} max={ch.max_hp} color={hpLow ? 'var(--ui-bar-hp-low)' : 'var(--ui-bar-hp)'} />
        </div>

        {/* XP */}
        {xpNeeded != null ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, marginBottom: 3 }}>
              <span style={{ color: 'var(--ui-dim)' }}>XP</span>
              <span style={{ color: 'rgba(200,168,74,0.6)' }}>{xpInLevel}/{xpNeeded}</span>
            </div>
            <SmallBar value={xpInLevel} max={xpNeeded} color="var(--ui-bar-xp)" />
          </div>
        ) : (
          <div style={{ fontSize: 9, color: 'var(--ui-gold-dim)', letterSpacing: '0.1em' }}>MAX LEVEL</div>
        )}

        {/* Currency */}
        <div style={{ marginTop: 'auto', borderTop: '1px solid var(--ui-gold-border)', paddingTop: 9 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 3 }}>
            <span style={{ color: 'var(--ui-gold-dim)' }}>{currencyName.toUpperCase()}</span>
            <span style={{ color: 'var(--ui-gold)', fontWeight: 'bold' }}>{currencySymbol} {ch.gold ?? 0}</span>
          </div>
          {sec2ndName && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
              <span style={{ color: 'var(--ui-blue)' }}>{sec2ndName.toUpperCase()}</span>
              <span style={{ color: 'var(--ui-blue)', fontWeight: 'bold' }}>{sec2ndSymbol} {ch.shards ?? 0}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Col 2: Stats with gear bonuses ── */}
      <div style={{
        width: 210, flexShrink: 0,
        borderRight: '1px solid var(--ui-gold-border)',
        padding: 13,
        overflowY: 'auto',
      }}>
        <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ui-gold-dim)', marginBottom: 10 }}>
          Combat Stats
        </div>
        <StatRow label="ATTACK"    value={ch.attack} />
        <StatRow label="DEFENSE"   value={ch.defense} />
        <StatRow label="INTELLECT" value={ch.intelligence} />
        <StatRow label="HIT"       value={ch.hit} />
        <StatRow label="TECH ATK"  value={ch.tech_attack} />
        <StatRow label="EVASION"   value={ch.evasion} />
        <StatRow label="ENDURANCE" value={ch.endurance} />
        <StatRow label="LUCK"      value={ch.luck} />
        <StatRow label="AGILITY"   value={ch.agility} />

        {ch.active_effects.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 11, borderTop: '1px solid var(--ui-gold-border)' }}>
            <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ui-gold-dim)', marginBottom: 7 }}>
              Active Effects
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {ch.active_effects.map(fx => {
                const isBuff   = /\+/.test(fx);
                const isDebuff = /bleed|poison|burn|corrode|blind|chill|frozen|weaken/i.test(fx);
                const color       = isBuff ? 'var(--ui-green)' : isDebuff ? 'var(--ui-red-hi)' : 'var(--ui-dim)';
                const borderColor = isBuff ? 'var(--ui-green-dim)' : isDebuff ? 'var(--ui-red-dim)' : 'var(--ui-gold-border)';
                return (
                  <span key={fx} style={{
                    fontSize: 9, padding: '2px 6px',
                    border: `1px solid ${borderColor}`, color, borderRadius: 2,
                    letterSpacing: '0.04em',
                  }}>
                    {fx}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Col 3: Quests + Abilities ── */}
      <div style={{ flex: 1, padding: 13, overflowY: 'auto' }}>

        {ch.active_quests.length > 0 ? (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ui-gold-dim)', marginBottom: 9 }}>
              Active Quests
            </div>
            {ch.active_quests.map(q => (
              <div key={q.quest_id} style={{
                background: 'var(--ui-card)',
                border: `1px solid ${q.completed ? 'rgba(100,180,100,0.25)' : 'var(--ui-gold-border)'}`,
                borderLeft: `3px solid ${q.completed ? 'var(--ui-green)' : 'var(--ui-gold-dim)'}`,
                borderRadius: 2,
                padding: '9px 10px',
                marginBottom: 6,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 'bold', color: q.completed ? 'var(--ui-dim)' : 'var(--ui-cream)', marginBottom: 3 }}>
                      {q.name}
                    </div>
                    {!q.completed && (
                      <div style={{ fontSize: 10, color: 'var(--ui-dim)', lineHeight: 1.4, fontFamily: 'Georgia, serif' }}>
                        {q.objective_hint}
                      </div>
                    )}
                  </div>
                  <span style={{
                    fontSize: 9.5, flexShrink: 0, fontWeight: 'bold',
                    color: q.completed ? 'var(--ui-green)' : 'rgba(200,168,74,0.6)',
                  }}>
                    {q.completed ? '✓' : `${q.progress}/${q.target}`}
                  </span>
                </div>
                {!q.completed && q.target > 1 && (
                  <div style={{ marginTop: 7, height: 3, background: 'rgba(212,200,168,0.08)', borderRadius: 1, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(1, q.progress / q.target) * 100}%`, height: '100%', background: 'rgba(200,168,74,0.45)' }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ui-gold-dim)', marginBottom: 7 }}>
              Active Quests
            </div>
            <div style={{ color: 'var(--ui-dim)', fontStyle: 'italic', fontSize: 12, fontFamily: 'Georgia, serif' }}>No active quests.</div>
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--ui-gold-border)', paddingTop: 11 }}>
          <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ui-gold-dim)', marginBottom: 7 }}>
            Abilities
          </div>
          <div style={{ color: 'var(--ui-dim)', fontStyle: 'italic', fontSize: 12, fontFamily: 'Georgia, serif', lineHeight: 1.6 }}>
            Abilities are learned as you level up. Use them from the combat screen.
          </div>
        </div>
      </div>
    </div>
  );
}
