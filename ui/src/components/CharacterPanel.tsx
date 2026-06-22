import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { getItemName, getItemDescription } from '@/bridge/engine';
import { MiniMap } from '@/components/MiniMap';
import { Panel, SectionLabel, pillButton } from '@/components/Panel';
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

function StatRow({ label, value, hideIfZero }: { label: string; value: number; hideIfZero?: boolean }) {
  if (hideIfZero && value === 0) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8em', marginBottom: 2 }}>
      <span style={{ color: 'var(--text-label)' }}>{label}</span>
      <span style={{ color: 'var(--text)' }}>{value}</span>
    </div>
  );
}

const divider: React.CSSProperties = { borderTop: '1px solid var(--j-divider)', paddingTop: '0.5rem', marginTop: '0.5rem' };

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
    <div>
      <div style={{ color: 'var(--j-text)', fontWeight: 'bold', fontSize: '0.9em', marginBottom: 2 }}>
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

      <div style={divider}>
        <StatRow label="AGI"      value={ch.agility}      hideIfZero />
        <StatRow label="ATK"      value={ch.attack} />
        <StatRow label="DEF"      value={ch.defense} />
        <StatRow label="EVA"      value={ch.evasion}      hideIfZero />
        <StatRow label="HIT"      value={ch.hit}          hideIfZero />
        <StatRow label="INT"      value={ch.intelligence} />
        <StatRow label="LCK"      value={ch.luck}         hideIfZero />
        <StatRow label="TECH ATK" value={ch.tech_attack}  hideIfZero />
        <StatRow label="TECH DEF" value={ch.endurance}    hideIfZero />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8em', marginBottom: 2, marginTop: 4, borderTop: '1px solid var(--j-divider)', paddingTop: 4 }}>
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
        <div style={{ marginTop: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75em', marginBottom: 2 }}>
            <span style={{ color: 'var(--text-label)' }}>XP</span>
            <span style={{ color: 'var(--xp-text)' }}>{xpInLevel}/{xpNeeded}</span>
          </div>
          <Bar value={xpInLevel} max={xpNeeded ?? 1} color='var(--bar-xp)' />
        </div>
      )}
      {nextXp == null && (
        <div style={{ color: 'var(--xp-text)', fontSize: '0.75em', marginTop: '0.5rem' }}>MAX LEVEL</div>
      )}
      {ch.equipped_weapon && (
        <div style={{ fontSize: '0.72em', color: 'var(--blue)', ...divider }}>
          ⚔ {ch.equipped_weapon}
        </div>
      )}
      {ch.payload_capacity > 0 && (
        <div style={divider}>
          <SectionLabel style={{ display: 'block', marginBottom: '0.3rem' }}>
            Payload ({(ch.payload_slots ?? []).length}/{ch.payload_capacity})
          </SectionLabel>
          {Array.from({ length: ch.payload_capacity }, (_, i) => {
            const id = (ch.payload_slots ?? [])[i];
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72em', marginBottom: '0.15rem' }}>
                {id ? (
                  <>
                    <span style={{ color: 'var(--green-bright)' }}>▸ {getItemName(id)}</span>
                    <button
                      onClick={() => submitCommand(`unload ${id}`)}
                      style={{ ...pillButton, fontSize: '0.7em', padding: '0.05rem 0.45rem', flexShrink: 0, marginLeft: '0.3rem' }}
                      onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = 'var(--green-bright)'; (e.target as HTMLElement).style.color = 'var(--green-bright)'; }}
                      onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = 'var(--j-border)'; (e.target as HTMLElement).style.color = 'var(--j-text-dim)'; }}
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
        <div style={{ fontSize: '0.72em', color: 'var(--text-body)', ...divider }}>
          {ch.active_effects.join(' · ')}
        </div>
      )}
    </div>
  );
}

function QuestList({ quests }: { quests: QuestProgressDTO[] }) {
  return (
    <div>
      {quests.map(q => (
        <div key={q.quest_id} style={{ marginBottom: '0.3rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72em' }}>
            <span style={{ color: q.completed ? 'var(--text-label)' : 'var(--j-text)' }}>{q.name}</span>
            <span style={{ color: q.completed ? 'var(--text-accent)' : 'var(--xp-text)' }}>
              {q.completed ? '✓' : `${q.progress}/${q.target}`}
            </span>
          </div>
          {!q.completed && q.target > 1 && (
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
    <div style={{ marginBottom: '0.6rem' }}>
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

function InventoryList({ inventoryIds, submitCommand }: { inventoryIds: string[]; submitCommand: (cmd: string) => void }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const desc = hoveredId ? getItemDescription(hoveredId) : '';

  return (
    <div>
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
              style={{ ...pillButton, fontSize: '0.7em', padding: '0.08rem 0.5rem', flexShrink: 0, marginLeft: '0.4rem' }}
              onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = 'var(--text)'; (e.target as HTMLElement).style.color = 'var(--text)'; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = 'var(--j-border)'; (e.target as HTMLElement).style.color = 'var(--j-text-dim)'; }}
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
              background: 'var(--j-bg)',
              border: '1px solid var(--j-border)',
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

export function CharacterPanel() {
  const playerCharacter = useGameStore(s => s.playerCharacter);
  const enemies = useGameStore(s => s.enemies);
  const currentRoomId = useGameStore(s => s.currentRoomId);
  const currencyName = useGameStore(s => s.currencyName);
  const currencySymbol = useGameStore(s => s.currencySymbol);
  const secondaryCurrencyName = useGameStore(s => s.secondaryCurrencyName);
  const secondaryCurrencySymbol = useGameStore(s => s.secondaryCurrencySymbol);
  const inventoryIds = useGameStore(s => s.inventoryIds);
  const submitCommand = useGameStore(s => s.submitCommand);
  const visibleEnemies = enemies.filter(e => e.hp > 0 && e.room_id === currentRoomId);
  const activeQuests = playerCharacter?.active_quests ?? [];

  if (!playerCharacter && visibleEnemies.length === 0) return null;

  return (
    <div style={{
      width: 232,
      flexShrink: 0,
      borderLeft: '1px solid var(--ink-divider)',
      padding: '0.75rem',
      overflowY: 'auto',
      fontFamily: 'var(--font-dossier)',
      background: 'var(--parchment-light)',
    }}>
      <MiniMap />

      <Panel label="Character">
        {playerCharacter
          ? <PlayerCard ch={playerCharacter} currencyName={currencyName} currencySymbol={currencySymbol} secondaryCurrencyName={secondaryCurrencyName} secondaryCurrencySymbol={secondaryCurrencySymbol} submitCommand={submitCommand} />
          : <div style={{ color: 'var(--text-dim)', fontSize: '0.8em' }}>No character yet.<br/>Try: become fighter</div>
        }
      </Panel>

      {activeQuests.length > 0 && (
        <Panel label="Quests">
          <QuestList quests={activeQuests} />
        </Panel>
      )}

      {inventoryIds.length > 0 && (
        <Panel label="Inventory">
          <InventoryList inventoryIds={inventoryIds} submitCommand={submitCommand} />
        </Panel>
      )}

      {visibleEnemies.length > 0 && (
        <Panel label="Enemies" style={{ borderColor: 'var(--danger-border)' }}>
          {visibleEnemies.map((e, i) => <EnemyCard key={i} enemy={e} />)}
        </Panel>
      )}
    </div>
  );
}
