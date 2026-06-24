import { useState, useEffect, useRef } from 'react';
import { useGameStore } from '@/store/gameStore';
import { getItemName, getItemDescription, getItemMeta } from '@/bridge/engine';
import { MiniMap } from '@/components/MiniMap';
import { Panel, SectionLabel, pillButton } from '@/components/Panel';
import { OutfitterModal } from '@/components/OutfitterModal';
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

function useDelta(value: number) {
  const prevRef = useRef<number | null>(null);
  const [delta, setDelta] = useState(0);
  const [key, setKey] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (prevRef.current !== null && prevRef.current !== value) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setDelta(value - prevRef.current);
      setKey(k => k + 1);
      timerRef.current = setTimeout(() => setDelta(0), 1700);
    }
    prevRef.current = value;
  }, [value]);

  return { delta, key };
}

function DeltaBadge({ delta, animKey }: { delta: number; animKey: number }) {
  if (delta === 0) return null;
  const positive = delta > 0;
  return (
    <span
      key={animKey}
      className="stat-delta"
      style={{ color: positive ? 'var(--green-bright)' : 'var(--danger-text)' }}
    >
      {positive ? `+${delta}` : delta}
    </span>
  );
}

function StatRow({ label, value, hideIfZero }: { label: string; value: number; hideIfZero?: boolean }) {
  const { delta, key } = useDelta(value);
  if (hideIfZero && value === 0) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8em', marginBottom: 2 }}>
      <span style={{ color: 'var(--text-label)' }}>{label}</span>
      <span style={{ color: 'var(--text)' }}>
        {value}
        <DeltaBadge delta={delta} animKey={key} />
      </span>
    </div>
  );
}

const divider: React.CSSProperties = { borderTop: '1px solid var(--j-divider)', paddingTop: '0.5rem', marginTop: '0.5rem' };

const SLOTS: { key: keyof CharacterStateDTO; label: string; icon: string; cmd: string }[] = [
  { key: 'equipped_weapon',      label: 'WEAPON',    icon: '⚔',  cmd: 'unequip weapon'    },
  { key: 'equipped_head',        label: 'HEAD',      icon: '🪖', cmd: 'unequip head'      },
  { key: 'equipped_body',        label: 'BODY',      icon: '🛡',  cmd: 'unequip body'      },
  { key: 'equipped_hands',       label: 'HANDS',     icon: '🤛', cmd: 'unequip hands'     },
  { key: 'equipped_feet',        label: 'FEET',      icon: '👢', cmd: 'unequip feet'      },
  { key: 'equipped_accessory_1', label: 'ACC 1',     icon: '💎', cmd: 'unequip accessory' },
  { key: 'equipped_accessory_2', label: 'ACC 2',     icon: '💎', cmd: 'unequip accessory_2' },
];

function EquipmentGrid({ ch, submitCommand, onOpenOutfitter }: { ch: CharacterStateDTO; submitCommand: (cmd: string) => void; onOpenOutfitter: () => void }) {
  const hasAny = SLOTS.some(s => ch[s.key]);
  return (
    <div style={{ ...divider, fontSize: '0.7em' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
        <SectionLabel>GEAR</SectionLabel>
        <button
          onClick={onOpenOutfitter}
          style={{ ...pillButton, fontSize: '0.62em', padding: '0.05rem 0.4rem' }}
          onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = 'var(--blue)'; (e.target as HTMLElement).style.color = 'var(--blue)'; }}
          onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = 'var(--j-border)'; (e.target as HTMLElement).style.color = 'var(--j-text-dim)'; }}
        >OUTFITTER</button>
      </div>
      {SLOTS.map(({ key, label, icon, cmd }) => {
        const name = ch[key] as string | null | undefined;
        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.3em', marginBottom: 3 }}>
            <span style={{ width: '1.2em', textAlign: 'center', flexShrink: 0 }}>{icon}</span>
            <span style={{ color: 'var(--text-label)', width: '3.4em', flexShrink: 0 }}>{label}</span>
            {name ? (
              <span
                title={`Click to unequip (${cmd})`}
                onClick={() => submitCommand(cmd)}
                style={{
                  color: 'var(--text)',
                  cursor: 'pointer',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '8em',
                  borderBottom: '1px dotted var(--text-muted)',
                }}
              >
                {name}
              </span>
            ) : (
              <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>—</span>
            )}
          </div>
        );
      })}
      {!hasAny && <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 2 }}>No gear equipped</div>}
    </div>
  );
}

function PlayerCard({ ch, currencyName, currencySymbol, secondaryCurrencyName, secondaryCurrencySymbol, submitCommand, onOpenOutfitter }: {
  ch: CharacterStateDTO;
  currencyName: string;
  currencySymbol: string;
  secondaryCurrencyName: string;
  secondaryCurrencySymbol: string;
  submitCommand: (cmd: string) => void;
  onOpenOutfitter: () => void;
}) {
  const nextXp = xpToNext(ch.level);
  const prevXp = ch.level > 1 ? (XP_THRESHOLDS[ch.level - 2] ?? 0) : 0;
  const xpInLevel = ch.xp - prevXp;
  const xpNeeded = nextXp != null ? nextXp - prevXp : null;
  const hpLow = ch.hp <= ch.max_hp * 0.3;
  const { delta: hpDelta, key: hpKey } = useDelta(ch.hp);

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
            <DeltaBadge delta={hpDelta} animKey={hpKey} />
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
      <EquipmentGrid ch={ch} submitCommand={submitCommand} onOpenOutfitter={onOpenOutfitter} />
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
        <div style={{ ...divider, display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
          {ch.active_effects.map((eff, i) => {
            const isBuff = /\+/.test(eff);
            const isDebuff = /bleed|poison|burn|corrode|blind|chill|frozen|weaken|hemotoxin|plague/i.test(eff);
            const color = isBuff ? 'var(--green-bright)' : isDebuff ? 'var(--danger-text)' : 'var(--text-muted)';
            const borderColor = isBuff ? 'rgba(26,74,26,0.4)' : isDebuff ? 'rgba(139,26,26,0.4)' : 'var(--j-border)';
            return (
              <span key={i} style={{
                fontSize: '0.65em',
                color,
                border: `1px solid ${borderColor}`,
                borderRadius: 2,
                padding: '0.1rem 0.35rem',
                fontFamily: 'var(--font-dossier)',
                letterSpacing: '0.04em',
              }}>{eff}</span>
            );
          })}
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

function ItemActionButton({ id, submitCommand }: { id: string; submitCommand: (cmd: string) => void }) {
  const meta = getItemMeta(id);
  const name = getItemName(id);

  let label: string;
  let cmd: string;
  let hoverColor: string;

  if (meta.canEquip) {
    label = 'EQUIP';
    cmd   = `equip ${id}`;
    hoverColor = 'var(--blue)';
  } else if (meta.canLoad) {
    label = 'LOAD';
    cmd   = `load ${id}`;
    hoverColor = 'var(--payload-text)';
  } else if (meta.canUse) {
    label = 'USE';
    cmd   = `use ${name.toLowerCase()}`;
    hoverColor = 'var(--text)';
  } else {
    return null;
  }

  return (
    <button
      onClick={() => submitCommand(cmd)}
      style={{ ...pillButton, fontSize: '0.7em', padding: '0.08rem 0.5rem', flexShrink: 0, marginLeft: '0.4rem' }}
      onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = hoverColor; (e.target as HTMLElement).style.color = hoverColor; }}
      onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = 'var(--j-border)'; (e.target as HTMLElement).style.color = 'var(--j-text-dim)'; }}
    >
      {label}
    </button>
  );
}

function InventoryList({ inventoryIds, submitCommand }: { inventoryIds: string[]; submitCommand: (cmd: string) => void }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div>
      {inventoryIds.map(id => {
        const meta = getItemMeta(id);
        const isWeapon = meta.tags.includes('weapon');
        const nameColor = isWeapon ? 'var(--blue)' : meta.canLoad ? 'var(--payload-text)' : 'var(--green-bright)';

        return (
          <div
            key={id}
            style={{ position: 'relative' }}
            onMouseEnter={() => setHoveredId(id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78em', marginBottom: '0.3rem' }}>
              <span style={{ color: nameColor, cursor: 'default' }}>{getItemName(id)}</span>
              <ItemActionButton id={id} submitCommand={submitCommand} />
            </div>
            {hoveredId === id && (
              <div style={{
                position: 'absolute',
                right: '100%',
                top: 0,
                width: 220,
                marginRight: '0.5rem',
                background: 'var(--j-bg)',
                border: '1px solid var(--j-border)',
                borderLeft: `2px solid ${nameColor}`,
                padding: '0.5rem 0.6rem',
                fontSize: '0.72em',
                color: 'var(--text-body)',
                lineHeight: 1.5,
                zIndex: 100,
                pointerEvents: 'none',
              }}>
                <div style={{ color: nameColor, fontWeight: 'bold', marginBottom: '0.2rem' }}>{getItemName(id)}</div>
                {meta.effectHint && (
                  <div style={{ color: 'var(--j-text)', marginBottom: '0.25rem', fontFamily: 'var(--font-dossier)', fontSize: '0.9em' }}>
                    {meta.effectHint}{!meta.consumable ? ' (reusable)' : ''}
                  </div>
                )}
                <div style={{ color: 'var(--text-body)', opacity: 0.85 }}>{getItemDescription(id)}</div>
              </div>
            )}
          </div>
        );
      })}
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
  const [outfitterOpen, setOutfitterOpen] = useState(false);
  const visibleEnemies = enemies.filter(e => e.hp > 0 && e.room_id === currentRoomId);
  const activeQuests = playerCharacter?.active_quests ?? [];

  if (!playerCharacter && visibleEnemies.length === 0) return null;

  return (
    <>
    {outfitterOpen && playerCharacter && (
      <OutfitterModal
        ch={playerCharacter}
        inventoryIds={inventoryIds}
        onClose={() => setOutfitterOpen(false)}
        submitCommand={submitCommand}
      />
    )}
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
          ? <PlayerCard ch={playerCharacter} currencyName={currencyName} currencySymbol={currencySymbol} secondaryCurrencyName={secondaryCurrencyName} secondaryCurrencySymbol={secondaryCurrencySymbol} submitCommand={submitCommand} onOpenOutfitter={() => setOutfitterOpen(true)} />
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
    </>
  );
}
