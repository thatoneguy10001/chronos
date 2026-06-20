import { useGameStore } from '@/store/gameStore';
import { getItemName } from '@/bridge/engine';
import type { CharacterStateDTO, EnemyStateDTO, QuestProgressDTO } from '@/types/contracts';

// XP thresholds mirror Rust's XP_THRESHOLDS array in experience.rs
const XP_THRESHOLDS = [100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500];

function xpToNext(level: number): number | null {
  return XP_THRESHOLDS[level - 1] ?? null;
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div style={{ background: '#111', height: 8, borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${pct * 100}%`, height: '100%', background: color, transition: 'width 0.2s' }} />
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8em', marginBottom: 2 }}>
      <span style={{ color: '#4a7a4a' }}>{label}</span>
      <span style={{ color: '#c8ffb0' }}>{value}</span>
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

  return (
    <div style={{ marginBottom: '1.2rem' }}>
      <div style={{ color: '#c8ffb0', fontWeight: 'bold', fontSize: '0.9em', marginBottom: 2 }}>
        {ch.name}
      </div>
      <div style={{ color: '#4a7a4a', fontSize: '0.75em', marginBottom: '0.6rem' }}>
        {ch.class_id} · Lv {ch.level}
      </div>

      <div style={{ marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75em', marginBottom: 2 }}>
          <span style={{ color: '#4a7a4a' }}>HP</span>
          <span style={{ color: ch.hp <= ch.max_hp * 0.3 ? '#ff6666' : '#c8ffb0' }}>
            {ch.hp}/{ch.max_hp}
          </span>
        </div>
        <Bar value={ch.hp} max={ch.max_hp} color={ch.hp <= ch.max_hp * 0.3 ? '#993333' : '#2a6a2a'} />
      </div>

      <div style={{ borderTop: '1px solid #1a3a1a', paddingTop: '0.5rem', marginBottom: '0.5rem' }}>
        <StatRow label="AGI"  value={ch.agility} />
        <StatRow label="ATK"  value={ch.attack} />
        <StatRow label="DEF"  value={ch.defense} />
        <StatRow label="EVA"      value={ch.evasion} />
        <StatRow label="HIT"      value={ch.hit} />
        <StatRow label="INT"      value={ch.intelligence} />
        <StatRow label="LCK"      value={ch.luck} />
        <StatRow label="TECH ATK" value={ch.tech_attack} />
        <StatRow label="TECH DEF" value={ch.endurance} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8em', marginBottom: 2, marginTop: 4, borderTop: '1px solid #1a3a1a', paddingTop: 4 }}>
          <span style={{ color: '#7a7a2a' }}>{currencyName.toUpperCase()}</span>
          <span style={{ color: '#ffdd44' }}>{currencySymbol} {ch.gold ?? 0}</span>
        </div>
        {secondaryCurrencyName && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8em', marginBottom: 2 }}>
            <span style={{ color: '#4a6a7a' }}>{secondaryCurrencyName.toUpperCase()}</span>
            <span style={{ color: '#88ccff' }}>{secondaryCurrencySymbol} {ch.shards ?? 0}</span>
          </div>
        )}
      </div>

      {nextXp != null && (
        <div style={{ marginBottom: ch.active_effects.length > 0 ? '0.5rem' : 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75em', marginBottom: 2 }}>
            <span style={{ color: '#4a7a4a' }}>XP</span>
            <span style={{ color: '#8a8a4a' }}>{xpInLevel}/{xpNeeded}</span>
          </div>
          <Bar value={xpInLevel} max={xpNeeded ?? 1} color='#4a4a1a' />
        </div>
      )}
      {nextXp == null && (
        <div style={{ color: '#8a8a4a', fontSize: '0.75em', marginBottom: ch.active_effects.length > 0 ? '0.5rem' : 0 }}>MAX LEVEL</div>
      )}
      {ch.equipped_weapon && (
        <div style={{ fontSize: '0.72em', color: '#aaddff', borderTop: '1px solid #1a3a1a', paddingTop: '0.4rem', marginBottom: '0.3rem' }}>
          ⚔ {ch.equipped_weapon}
        </div>
      )}
      {ch.payload_capacity > 0 && (
        <div style={{ borderTop: '1px solid #1a3a1a', paddingTop: '0.4rem', marginBottom: '0.3rem' }}>
          <div style={{ color: '#4a6a5a', fontSize: '0.68em', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>
            PAYLOAD ({(ch.payload_slots ?? []).length}/{ch.payload_capacity})
          </div>
          {Array.from({ length: ch.payload_capacity }, (_, i) => {
            const id = (ch.payload_slots ?? [])[i];
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72em', marginBottom: '0.15rem' }}>
                {id ? (
                  <>
                    <span style={{ color: '#88dd99' }}>▸ {getItemName(id)}</span>
                    <button
                      onClick={() => submitCommand(`unload ${id}`)}
                      style={{ background: 'transparent', border: '1px solid #2a4a3a', color: '#4a7a5a', fontFamily: 'inherit', fontSize: '0.75em', padding: '0.05rem 0.3rem', cursor: 'pointer', borderRadius: '2px', flexShrink: 0, marginLeft: '0.3rem' }}
                      onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = '#88dd99'; (e.target as HTMLElement).style.color = '#88dd99'; }}
                      onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = '#2a4a3a'; (e.target as HTMLElement).style.color = '#4a7a5a'; }}
                    >OUT</button>
                  </>
                ) : (
                  <span style={{ color: '#2a4a3a' }}>— empty slot —</span>
                )}
              </div>
            );
          })}
        </div>
      )}
      {ch.active_effects.length > 0 && (
        <div style={{ fontSize: '0.72em', color: '#7a9a5a', borderTop: ch.equipped_weapon ? 'none' : '1px solid #1a3a1a', paddingTop: ch.equipped_weapon ? 0 : '0.4rem' }}>
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
    <div style={{ borderTop: '1px solid #1a3a1a', paddingTop: '0.4rem', marginTop: '0.4rem' }}>
      <div style={{ color: '#2a5a2a', fontSize: '0.68em', letterSpacing: '0.08em', marginBottom: '0.3rem' }}>── QUESTS ──</div>
      {quests.map(q => (
        <div key={q.quest_id} style={{ marginBottom: '0.3rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72em' }}>
            <span style={{ color: q.completed ? '#4a7a4a' : '#8a8a4a' }}>{q.name}</span>
            <span style={{ color: q.completed ? '#4a9a4a' : '#6a6a3a' }}>
              {q.completed ? '✓' : `${q.progress}/${q.target}`}
            </span>
          </div>
          {!q.completed && (
            <Bar value={q.progress} max={q.target} color="#3a4a1a" />
          )}
        </div>
      ))}
    </div>
  );
}

function EnemyCard({ enemy }: { enemy: EnemyStateDTO }) {
  return (
    <div style={{ marginBottom: '0.8rem', padding: '0.4rem 0.5rem', border: '1px solid #3a1a1a', borderRadius: 2 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ color: '#cc6666', fontSize: '0.8em', fontWeight: 'bold' }}>{enemy.name}</span>
        <span style={{ color: enemy.hp <= enemy.max_hp * 0.3 ? '#ff4444' : '#aa5555', fontSize: '0.75em' }}>
          {enemy.hp}/{enemy.max_hp}
        </span>
      </div>
      <Bar value={enemy.hp} max={enemy.max_hp} color='#6a1a1a' />
      {enemy.active_effects.length > 0 && (
        <div style={{ marginTop: 3, fontSize: '0.7em', color: '#6a8a4a' }}>
          {enemy.active_effects.join(', ')}
        </div>
      )}
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
      borderLeft: '1px solid #1a3a1a',
      padding: '1rem 0.75rem',
      overflowY: 'auto',
      fontFamily: 'monospace',
      background: '#030303',
    }}>
      {(() => {
        const { timeStr, dayStr, isNight } = formatGameTime(gameTime);
        return (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem' }}>
            <div style={{ color: '#2a5a2a', fontSize: '0.7em', letterSpacing: '0.1em' }}>── CHARACTER ──</div>
            <div style={{ fontSize: '0.68em', color: isNight ? '#6a5a8a' : '#6a8a4a', textAlign: 'right' }}>
              <span>{isNight ? '☾' : '☀'}</span>
              <span style={{ marginLeft: 4 }}>{timeStr}</span>
              <div style={{ color: '#2a3a2a', fontSize: '0.9em' }}>{dayStr}</div>
            </div>
          </div>
        );
      })()}

      {playerCharacter
        ? <PlayerCard ch={playerCharacter} currencyName={currencyName} currencySymbol={currencySymbol} secondaryCurrencyName={secondaryCurrencyName} secondaryCurrencySymbol={secondaryCurrencySymbol} submitCommand={submitCommand} />
        : <div style={{ color: '#2a4a2a', fontSize: '0.8em' }}>No character yet.<br/>Try: become fighter</div>
      }

      {inventoryIds.length > 0 && (
        <div style={{ borderTop: '1px solid #1a3a1a', paddingTop: '0.5rem', marginBottom: '0.75rem' }}>
          <div style={{ color: '#2a5a2a', fontSize: '0.7em', letterSpacing: '0.1em', marginBottom: '0.4rem' }}>── INVENTORY ──</div>
          {inventoryIds.map(id => (
            <div key={id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78em', marginBottom: '0.3rem' }}>
              <span style={{ color: '#a8d890' }}>{getItemName(id)}</span>
              <button
                onClick={() => submitCommand(`use ${getItemName(id).toLowerCase()}`)}
                style={{
                  background: 'transparent',
                  border: '1px solid #2a4a2a',
                  color: '#4a7a4a',
                  fontFamily: 'inherit',
                  fontSize: '0.75em',
                  padding: '0.1rem 0.35rem',
                  cursor: 'pointer',
                  borderRadius: '2px',
                  flexShrink: 0,
                  marginLeft: '0.4rem',
                }}
                onMouseEnter={e => {
                  (e.target as HTMLElement).style.borderColor = '#c8ffb0';
                  (e.target as HTMLElement).style.color = '#c8ffb0';
                }}
                onMouseLeave={e => {
                  (e.target as HTMLElement).style.borderColor = '#2a4a2a';
                  (e.target as HTMLElement).style.color = '#4a7a4a';
                }}
              >
                USE
              </button>
            </div>
          ))}
        </div>
      )}

      {visibleEnemies.length > 0 && (
        <>
          <div style={{ color: '#2a5a2a', fontSize: '0.7em', letterSpacing: '0.1em', marginBottom: '0.5rem', borderTop: '1px solid #1a3a1a', paddingTop: '0.75rem' }}>
            ── ENEMIES ──
          </div>
          {visibleEnemies.map((e, i) => <EnemyCard key={i} enemy={e} />)}
        </>
      )}
    </div>
  );
}
