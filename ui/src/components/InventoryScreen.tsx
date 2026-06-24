import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { getItemMeta, getItemName, getItemDescription } from '@/bridge/engine';
import { SectionLabel } from '@/components/Panel';
import type { CharacterStateDTO } from '@/types/contracts';

const SLOTS: { key: keyof CharacterStateDTO; label: string; unequipCmd: string }[] = [
  { key: 'equipped_weapon',      label: 'Weapon', unequipCmd: 'unequip weapon'      },
  { key: 'equipped_head',        label: 'Head',   unequipCmd: 'unequip head'        },
  { key: 'equipped_body',        label: 'Body',   unequipCmd: 'unequip body'        },
  { key: 'equipped_hands',       label: 'Hands',  unequipCmd: 'unequip hands'       },
  { key: 'equipped_feet',        label: 'Feet',   unequipCmd: 'unequip feet'        },
  { key: 'equipped_accessory_1', label: 'Acc 1',  unequipCmd: 'unequip accessory'   },
  { key: 'equipped_accessory_2', label: 'Acc 2',  unequipCmd: 'unequip accessory_2' },
];

function GearSlots({ ch, submitCommand }: { ch: CharacterStateDTO; submitCommand: (cmd: string) => void }) {
  return (
    <div>
      {SLOTS.map(({ key, label, unequipCmd }) => {
        const name = ch[key] as string | null | undefined;
        return (
          <div key={key} style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.45rem 0',
            borderBottom: '1px solid var(--j-divider)',
            fontFamily: 'var(--font-dossier)',
          }}>
            <span style={{ fontSize: '0.65em', color: 'var(--text-label)', width: '3.2em', flexShrink: 0, letterSpacing: '0.05em' }}>
              {label.toUpperCase()}
            </span>
            {name ? (
              <>
                <span style={{
                  flex: 1, fontSize: '0.8em', color: 'var(--j-text)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {name}
                </span>
                <button
                  onClick={() => submitCommand(unequipCmd)}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--j-border)',
                    color: 'var(--j-text-dim)',
                    fontFamily: 'var(--font-dossier)',
                    fontSize: '0.6em',
                    padding: '0.1rem 0.4rem',
                    cursor: 'pointer',
                    borderRadius: 2,
                    flexShrink: 0,
                    letterSpacing: '0.05em',
                  }}
                  onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = 'var(--danger-text)'; (e.target as HTMLElement).style.color = 'var(--danger-text)'; }}
                  onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = 'var(--j-border)'; (e.target as HTMLElement).style.color = 'var(--j-text-dim)'; }}
                >
                  REMOVE
                </button>
              </>
            ) : (
              <span style={{ flex: 1, fontSize: '0.78em', color: 'var(--ink-faint)', fontStyle: 'italic' }}>— empty —</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ItemRow({ id, submitCommand }: { id: string; submitCommand: (cmd: string) => void }) {
  const [hovered, setHovered] = useState(false);
  const meta = getItemMeta(id);
  const name = getItemName(id);
  const desc = getItemDescription(id);

  let actionLabel = '';
  let actionCmd = '';
  let actionHover = 'var(--j-text)';

  if (meta.canUse) {
    actionLabel = 'USE';
    actionCmd   = `use ${name.toLowerCase()}`;
    actionHover = 'var(--green-bright)';
  } else if (meta.canEquip) {
    actionLabel = 'EQUIP';
    actionCmd   = `equip ${id}`;
    actionHover = 'var(--blue)';
  } else if (meta.canLoad) {
    actionLabel = 'LOAD';
    actionCmd   = `load ${id}`;
    actionHover = 'var(--gold)';
  }

  const nameColor = meta.canEquip
    ? (meta.tags.includes('weapon') ? 'var(--blue)' : 'var(--j-text)')
    : meta.canLoad
    ? 'var(--gold)'
    : 'var(--green-bright)';

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.4rem',
        padding: '0.4rem 0',
        borderBottom: '1px solid var(--j-divider)',
        fontFamily: 'var(--font-dossier)',
      }}>
        <span style={{
          flex: 1, fontSize: '0.8em', color: nameColor,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {name}
        </span>
        {meta.effectHint && (
          <span style={{ fontSize: '0.65em', color: 'var(--text-label)', flexShrink: 0 }}>
            {meta.effectHint}
          </span>
        )}
        {actionLabel && (
          <button
            onClick={() => submitCommand(actionCmd)}
            style={{
              background: 'transparent',
              border: '1px solid var(--j-border)',
              color: 'var(--j-text-dim)',
              fontFamily: 'var(--font-dossier)',
              fontSize: '0.6em',
              padding: '0.1rem 0.4rem',
              cursor: 'pointer',
              borderRadius: 2,
              flexShrink: 0,
              letterSpacing: '0.05em',
            }}
            onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = actionHover; (e.target as HTMLElement).style.color = actionHover; }}
            onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = 'var(--j-border)'; (e.target as HTMLElement).style.color = 'var(--j-text-dim)'; }}
          >
            {actionLabel}
          </button>
        )}
      </div>

      {hovered && desc && (
        <div style={{
          position: 'absolute',
          right: '100%',
          top: 0,
          width: 200,
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
          fontFamily: 'var(--font-dossier)',
        }}>
          <div style={{ color: nameColor, fontWeight: 'bold', marginBottom: '0.2rem' }}>{name}</div>
          <div>{desc}</div>
        </div>
      )}
    </div>
  );
}

export function InventoryScreen() {
  const playerCharacter = useGameStore(s => s.playerCharacter);
  const inventoryIds    = useGameStore(s => s.inventoryIds);
  const submitCommand   = useGameStore(s => s.submitCommand);
  const enemies         = useGameStore(s => s.enemies);
  const currentRoomId   = useGameStore(s => s.currentRoomId);

  if (!playerCharacter) return null;

  const consumables = inventoryIds.filter(id => {
    const m = getItemMeta(id);
    return m.canUse && m.consumable;
  });
  const gear = inventoryIds.filter(id => {
    const m = getItemMeta(id);
    return m.canEquip;
  });
  const other = inventoryIds.filter(id => {
    const m = getItemMeta(id);
    return !m.canUse && !m.canEquip && !m.canLoad;
  });
  const loadable = inventoryIds.filter(id => getItemMeta(id).canLoad);

  const combatNote = enemies.some(e => e.hp > 0 && e.room_id === currentRoomId);

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden', fontFamily: 'var(--font-dossier)' }}>

      {/* ── Left: Gear slots ── */}
      <div style={{
        width: 260, flexShrink: 0,
        borderRight: '1px solid var(--ink-divider)',
        padding: '0.75rem 1rem',
        overflowY: 'auto',
      }}>
        <SectionLabel style={{ display: 'block', marginBottom: '0.5rem' }}>Equipped Gear</SectionLabel>
        <GearSlots ch={playerCharacter} submitCommand={submitCommand} />
      </div>

      {/* ── Right: Carried items ── */}
      <div style={{ flex: 1, padding: '0.75rem 1rem', overflowY: 'auto' }}>

        {combatNote && (
          <div style={{
            fontSize: '0.72em',
            color: 'var(--ink-combat)',
            border: '1px solid rgba(107,26,26,0.25)',
            borderRadius: 2,
            padding: '0.35rem 0.6rem',
            marginBottom: '0.75rem',
            background: 'rgba(107,26,26,0.06)',
          }}>
            Using an item during combat costs your turn. The enemy acts next.
          </div>
        )}

        {consumables.length > 0 && (
          <div style={{ marginBottom: '0.75rem' }}>
            <SectionLabel style={{ display: 'block', marginBottom: '0.4rem' }}>Consumables</SectionLabel>
            {consumables.map(id => <ItemRow key={id} id={id} submitCommand={submitCommand} />)}
          </div>
        )}

        {gear.length > 0 && (
          <div style={{ marginBottom: '0.75rem' }}>
            <SectionLabel style={{ display: 'block', marginBottom: '0.4rem' }}>Gear (Unequipped)</SectionLabel>
            {gear.map(id => <ItemRow key={id} id={id} submitCommand={submitCommand} />)}
          </div>
        )}

        {loadable.length > 0 && (
          <div style={{ marginBottom: '0.75rem' }}>
            <SectionLabel style={{ display: 'block', marginBottom: '0.4rem' }}>Payload</SectionLabel>
            {loadable.map(id => <ItemRow key={id} id={id} submitCommand={submitCommand} />)}
          </div>
        )}

        {other.length > 0 && (
          <div style={{ marginBottom: '0.75rem' }}>
            <SectionLabel style={{ display: 'block', marginBottom: '0.4rem' }}>Other</SectionLabel>
            {other.map(id => <ItemRow key={id} id={id} submitCommand={submitCommand} />)}
          </div>
        )}

        {inventoryIds.length === 0 && (
          <div style={{ color: 'var(--ink-faint)', fontStyle: 'italic', fontSize: '0.85em', marginTop: '1rem', fontFamily: 'var(--font-journal)' }}>
            Nothing carried.
          </div>
        )}
      </div>
    </div>
  );
}
