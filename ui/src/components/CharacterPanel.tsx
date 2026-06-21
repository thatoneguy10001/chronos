import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { getItemName, getItemDescription } from '@/bridge/engine';
import { MiniMap } from '@/components/MiniMap';
import type { CharacterStateDTO, EnemyStateDTO, QuestProgressDTO } from '@/types/contracts';

const XP_THRESHOLDS = [100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500];

function xpToNext(level: number): number | null {
  return XP_THRESHOLDS[level - 1] ?? null;
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div style={{ background: 'var(--bar-bg)', height: 8, borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${pct * 100}%`, height: '100%', background: color, transition: 'width 0.2s' }} />
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8em', marginBottom: 2 }}>
      <span style={{ color: 'var(--text-label)' }}>{label}</span>
      <span style={{ color: 'var(--text)' }}>{value}</span>
    </div>
  );
}

function PlayerCard({ ch, currencyName, currencySymbol, secondaryCurrencyName, secondaryCurrencySymbol, submitCommand }: {
  ch: CharacterStateDTO;
  currencyName: string;
  currencySymbol: string;
  secondaryCurrencyName: string;
  secondaryCurrencySymbol: string;
  submitCommand: (cmd: string) => void;
}) {
  const nextXp = xpToNext(ch.level);
  const prevXp = ch.level > 1 ? (XP_THRESHOLDS[ch.level - 2] ?? 0) : 0;
  const xpInLevel = ch.xp - prevXp;
  const xpNeeded = nextXp != null ? nextXp - prevXp : null;
  const hpLow = ch.hp <= ch.max_hp * 0.3;

  return (
    <div style={{ marginBottom: '1.2rem' }}>
      <div style={{ color: 'var(--text)', fontWeight: 'bold', fontSize: '0.9em', marginBottom: 2 }}>
        {ch.name}
      </div>
      <div style={{ color: 'var(--text-label)', fontSize: '0.75em', marginBottom: '0.6rem' }}>
        {ch.class_id} · Lv {ch.level}
      </div>

      <div style={{ marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75em', marginBottom: 2 }}>
          <span style={{ color: 'var(--text-label)' }}>HP</span>
          <span style={{ color: hpLow ? 'var(--danger-low)' : 'var(--text)' }}>
            {ch.hp}/{ch.max_hp}
          </span>
        </div>
        <Bar value={ch.hp} max={ch.max_hp} color={hpLow ? 'var(--bar-hp-low)' : 'var(--bar-hp)'} />
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.5rem', marginBottom: '0.5rem' }}>
        <StatRow label="AGI"      value={ch.agility} />
        <StatRow label="ATK"      value={ch.attack} />
        <StatRow label="DEF"      value={ch.defense} />
        <StatRow label="EVA"      value={ch.evasion} />
        <StatRow label="HIT"      value={ch.hit} />
        <StatRow label="INT"      value={ch.intelligence} />
        <StatRow label="LCK"      value={ch.luck} />
        <StatRow label="TECH ATK" value={ch.tech_attack} />
        <StatRow label="TECH DEF" value={ch.endurance} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8em', marginBottom: 2, marginTop: 4, borderTop: '1px solid var(--border)', paddingTop: 4 }}>
          <span style={{ color: 'var(--gold-dim)' }}>{currencyName.toUpperCase()}</span>
          <span style={{ color: 'var(--gold)' }}>{currencySymbol} {ch.gold ?? 0}</span>
        </div>
        {secondaryCurrencyName && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8em', marginBottom: 2 }}>
            <span style={{ color: 'var(--blue-dim)' }}>{secondaryCurrencyName.toUpperCase()}</span>
            <span style={{ color: 'var(--blue)' }}>{secondaryCurrencySymbol} {ch.shards ?? 0}</span>
          </div>
        )}
      </div>

      {nextXp != null && (
        <div style={{ marginBottom: ch.active_effects.length > 0 ? '0.5rem' : 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75em', marginBottom: 2 }}>
            <span style={{ color: 'var(--text-label)' }}>XP</span>
            <span style={{ color: 'var(--xp-text)' }}>{xpInLevel}/{xpNeeded}</span>
          </div>
          <Bar value={xpInLevel} max={xpNeeded ?? 1} color='var(--bar-xp)' />
        </div>
      )}
      {nextXp == null && (
        <div style={{ color: 'var(--xp-text)', fontSize: '0.75em', marginBottom: ch.active_effects.length > 0 ? '0.5rem' : 0 }}>MAX LEVEL</div>
      )}
      {ch.equipped_weapon && (
        <div style={{ fontSize: '0.72em', color: 'var(--blue)', borderTop: '1px solid var(--border)', paddingTop: '0.4rem', marginBottom: '0.3rem' }}>
          ⚔ {ch.equipped_weapon}
        </div>
      )}
      {ch.payload_capacity > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.4rem', marginBottom: '0.3rem' }}>
          <div style={{ color: 'var(--payload-text)', fontSize: '0.68em', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>
            PAYLOAD ({(ch.payload_slots ?? []).length}/{ch.payload_capacity})
          </div>
          {Array.from({ length: ch.payload_capacity }, (_, i) => {
            const id = (ch.payload_slots ?? [])[i];
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72em', marginBottom: '0.15rem' }}>
                {id ? (
                  <>
                    <span style={{ color: 'var(--green-bright)' }}>▸ {getItemName(id)}</span>
                    <button
                      onClick={() => submitCommand(`unload ${id}`)}
                      style={{ background: 'transparent', border: '1px solid var(--payload-border)', color: 'var(--payload-text)', fontFamily: 'inherit', fontSize: '0.75em', padding: '0.05rem 0.3rem', cursor: 'pointer', borderRadius: '2px', flexShrink: 0, marginLeft: '0.3rem' }}
                      onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = 'var(--green-bright)'; (e.target as HTMLElement).style.color = 'var(--green-bright)'; }}
                      onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = 'var(--payload-border)'; (e.target as HTMLElement).style.color = 'var(--payload-text)'; }}
                    >OUT</button>
                  </>
                ) : (
                  <span style={{ color: 'var(--payload-border)' }}>— empty slot —</span>
                )}
              </div>
            );
          })}
        </div>
      )}
      {ch.active_effects.length > 0 && (
        <div style={{ fontSize: '0.72em', color: 'var(--text-body)', borderTop: ch.equipped_weapon ? 'none' : '1px solid var(--border)', paddingTop: ch.equipped_weapon ? 0 : '0.4rem' }}>
          {ch.active_effects.join(' · ')}
        </div>
      )}
      {ch.active_quests?.length > 0 && (
        <QuestMiniLog quests={ch.active_quests} />
      )}
    </div>
  );
}

function QuestMiniLog({ quests }: { quests: QuestProgressDTO[] }) {
  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.4rem', marginTop: '0.4rem' }}>
      <div style={{ color: 'var(--text-dim)', fontSize: '0.68em', letterSpacing: '0.08em', marginBottom: '0.3rem' }}>── QUESTS ──</div>
      {quests.map(q => (
        <div key={q.quest_id} style={{ marginBottom: '0.3rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72em' }}>
            <span style={{ color: q.completed ? 'var(--text-label)' : 'var(--xp-text)' }}>{q.name}</span>
            <span style={{ color: q.completed ? 'var(--text-accent)' : 'var(--xp-text)' }}>
              {q.completed ? '✓' : `${q.progress}/${q.target}`}
            </span>
          </div>
          {!q.completed && (
            <Bar value={q.progress} max={q.target} color="var(--bar-quest)" />
          )}
        </div>
      ))}
    </div>
  );
}

function EnemyCard({ enemy }: { enemy: EnemyStateDTO }) {
  const hpLow = enemy.hp <= enemy.max_hp * 0.3;
  return (
    <div style={{ marginBottom: '0.8rem', padding: '0.4rem 0.5rem', border: '1px solid var(--danger-border)', borderRadius: 2 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ color: 'var(--danger-text)', fontSize: '0.8em', fontWeight: 'bold' }}>{enemy.name}</span>
        <span style={{ color: hpLow ? 'var(--danger-low)' : 'var(--danger-mid)', fontSize: '0.75em' }}>
          {enemy.hp}/{enemy.max_hp}
        </span>
      </div>
      <Bar value={enemy.hp} max={enemy.max_hp} color='var(--danger-bar)' />
      {enemy.active_effects.length > 0 && (
        <div style={{ marginTop: 3, fontSize: '0.7em', color: 'var(--text-body)' }}>
          {enemy.active_effects.join(', ')}
        </div>
      )}
    </div>
  );
}

function InventorySection({ inventoryIds, submitCommand }: { inventoryIds: string[]; submitCommand: (cmd: string) => void }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const desc = hoveredId ? getItemDescription(hoveredId) : '';

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.5rem', marginBottom: '0.75rem' }}>
      <div style={{ color: 'var(--text-dim)', fontSize: '0.7em', letterSpacing: '0.1em', marginBottom: '0.4rem' }}>── INVENTORY ──</div>
      {inventoryIds.map(id => (
        <div
          key={id}
          style={{ position: 'relative' }}
          onMouseEnter={() => setHoveredId(id)}
          onMouseLeave={() => setHoveredId(null)}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78em', marginBottom: '0.3rem' }}>
            <span style={{ color: 'var(--green-bright)', cursor: 'default' }}>{getItemName(id)}</span>
            <button
              onClick={() => submitCommand(`use ${getItemName(id).toLowerCase()}`)}
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--text-label)',
                fontFamily: 'inherit',
                fontSize: '0.75em',
                padding: '0.1rem 0.35rem',
                cursor: 'pointer',
                borderRadius: '2px',
                flexShrink: 0,
                marginLeft: '0.4rem',
              }}
              onMouseEnter={e => {
                (e.target as HTMLElement).style.borderColor = 'var(--text)';
                (e.target as HTMLElement).style.color = 'var(--text)';
              }}
              onMouseLeave={e => {
                (e.target as HTMLElement).style.borderColor = 'var(--border)';
                (e.target as HTMLElement).style.color = 'var(--text-label)';
              }}
            >
              USE
            </button>
          </div>
          {hoveredId === id && desc && (
            <div style={{
              position: 'absolute',
              right: '100%',
              top: 0,
              width: 220,
              marginRight: '0.5rem',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderLeft: '2px solid var(--green-bright)',
              padding: '0.5rem 0.6rem',
              fontSize: '0.72em',
              color: 'var(--text-body)',
              lineHeight: 1.5,
              zIndex: 100,
              pointerEvents: 'none',
            }}>
              <div style={{ color: 'var(--green-bright)', fontWeight: 'bold', marginBottom: '0.25rem' }}>{getItemName(id)}</div>
              {desc}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function formatGameTime(minutes: number): { timeStr: string; dayStr: string; isNight: boolean } {
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  const day = Math.floor(minutes / 1440) + 1;
  const isNight = h >= 20 || h < 6;
  return {
    timeStr: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
    dayStr: `Day ${day}`,
    isNight,
  };
}

export function CharacterPanel() {
  const playerCharacter = useGameStore(s => s.playerCharacter);
  const enemies = useGameStore(s => s.enemies);
  const currentRoomId = useGameStore(s => s.currentRoomId);
  const currencyName = useGameStore(s => s.currencyName);
  const currencySymbol = useGameStore(s => s.currencySymbol);
  const secondaryCurrencyName = useGameStore(s => s.secondaryCurrencyName);
  const secondaryCurrencySymbol = useGameStore(s => s.secondaryCurrencySymbol);
  const gameTime = useGameStore(s => s.gameTime);
  const inventoryIds = useGameStore(s => s.inventoryIds);
  const submitCommand = useGameStore(s => s.submitCommand);
  const visibleEnemies = enemies.filter(e => e.hp > 0 && e.room_id === currentRoomId);

  if (!playerCharacter && visibleEnemies.length === 0) return null;

  return (
    <div style={{
      width: 220,
      flexShrink: 0,
      borderLeft: '1px solid var(--border)',
      padding: '1rem 0.75rem',
      overflowY: 'auto',
      fontFamily: 'monospace',
      background: 'var(--bg-panel)',
    }}>
      <MiniMap />

      {(() => {
        const { timeStr, dayStr, isNight } = formatGameTime(gameTime);
        return (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem' }}>
            <div style={{ color: 'var(--text-dim)', fontSize: '0.7em', letterSpacing: '0.1em' }}>── CHARACTER ──</div>
            <div style={{ fontSize: '0.68em', color: isNight ? 'var(--time-night)' : 'var(--time-day)', textAlign: 'right' }}>
              <span>{isNight ? '☾' : '☀'}</span>
              <span style={{ marginLeft: 4 }}>{timeStr}</span>
              <div style={{ color: 'var(--text-faint)', fontSize: '0.9em' }}>{dayStr}</div>
            </div>
          </div>
        );
      })()}

      {playerCharacter
        ? <PlayerCard ch={playerCharacter} currencyName={currencyName} currencySymbol={currencySymbol} secondaryCurrencyName={secondaryCurrencyName} secondaryCurrencySymbol={secondaryCurrencySymbol} submitCommand={submitCommand} />
        : <div style={{ color: 'var(--text-dim)', fontSize: '0.8em' }}>No character yet.<br/>Try: become fighter</div>
      }

      {inventoryIds.length > 0 && (
        <InventorySection inventoryIds={inventoryIds} submitCommand={submitCommand} />
      )}

      {visibleEnemies.length > 0 && (
        <>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.7em', letterSpacing: '0.1em', marginBottom: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
            ── ENEMIES ──
          </div>
          {visibleEnemies.map((e, i) => <EnemyCard key={i} enemy={e} />)}
        </>
      )}
    </div>
  );
}
