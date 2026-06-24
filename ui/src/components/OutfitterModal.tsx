import { useState, useEffect, useCallback } from 'react';
import { getAllItems, getItemMeta } from '@/bridge/engine';
import type { CharacterStateDTO } from '@/types/contracts';
import type { EquipSlot } from '@/bridge/item-meta';

const EQUIP_STAT_LABEL: Record<string, string> = {
  attack:       'ATK',
  defense:      'DEF',
  intelligence: 'INT',
  tech_attack:  'TECH',
  agility:      'AGI',
  luck:         'LCK',
};

type SlotDef = {
  key: keyof CharacterStateDTO;
  slot: EquipSlot;
  label: string;
  icon: string;
  unequipCmd: string;
};

const SLOT_DEFS: SlotDef[] = [
  { key: 'equipped_weapon',      slot: 'weapon',    label: 'WEAPON', icon: '⚔',  unequipCmd: 'unequip weapon'     },
  { key: 'equipped_head',        slot: 'head',      label: 'HEAD',   icon: '🪖', unequipCmd: 'unequip head'       },
  { key: 'equipped_body',        slot: 'body',      label: 'BODY',   icon: '🛡',  unequipCmd: 'unequip body'       },
  { key: 'equipped_hands',       slot: 'hands',     label: 'HANDS',  icon: '🤛', unequipCmd: 'unequip hands'      },
  { key: 'equipped_feet',        slot: 'feet',      label: 'FEET',   icon: '👢', unequipCmd: 'unequip feet'       },
  { key: 'equipped_accessory_1', slot: 'accessory', label: 'ACC 1',  icon: '💎', unequipCmd: 'unequip accessory'  },
  { key: 'equipped_accessory_2', slot: 'accessory', label: 'ACC 2',  icon: '💎', unequipCmd: 'unequip accessory_2'},
];

function statLabel(stat: string | null | undefined): string {
  return stat ? (EQUIP_STAT_LABEL[stat] ?? stat.toUpperCase()) : '?';
}

function DiffBadge({ current, candidate, stat }: { current: number | null; candidate: number; stat: string | null }) {
  const base = current ?? 0;
  const diff = candidate - base;
  const color = diff > 0 ? 'var(--green-bright)' : diff < 0 ? 'var(--danger-text)' : 'var(--text-muted)';
  const sign = diff >= 0 ? '+' : '';
  return (
    <span style={{ color, fontSize: '0.75em', marginLeft: '0.4em', fontFamily: 'var(--font-dossier)' }}>
      {statLabel(stat)} {sign}{diff}
    </span>
  );
}

export function OutfitterModal({
  ch,
  inventoryIds,
  onClose,
  submitCommand,
}: {
  ch: CharacterStateDTO;
  inventoryIds: string[];
  onClose: () => void;
  submitCommand: (cmd: string) => void;
}) {
  const [focusedSlotIdx, setFocusedSlotIdx] = useState(0);

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  const focusedDef = SLOT_DEFS[focusedSlotIdx];
  const allItems = getAllItems();

  // Find equipped item in focused slot by matching the display name in the DTO
  const equippedName = (ch[focusedDef.key] as string | null | undefined) ?? null;
  const equippedItem = equippedName
    ? allItems.find(i => i.name === equippedName)
    : null;
  const equippedBonus = equippedItem?.meta.equipBonus ?? null;
  const equippedStat  = equippedItem?.meta.equipStat  ?? null;

  // Inventory items that match this slot
  const candidates = inventoryIds
    .map(id => ({ id, meta: getItemMeta(id), name: allItems.find(i => i.id === id)?.name ?? id }))
    .filter(({ meta }) => meta.equipSlot === focusedDef.slot);

  function equip(id: string) {
    submitCommand(`equip ${id}`);
    onClose();
  }

  function unequip(cmd: string) {
    submitCommand(cmd);
    onClose();
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 660, maxHeight: '80vh',
          background: 'var(--parchment-light)',
          border: '1px solid var(--j-border)',
          borderTop: '3px solid var(--ink)',
          display: 'flex', flexDirection: 'column',
          fontFamily: 'var(--font-dossier)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0.6rem 0.9rem',
          borderBottom: '1px solid var(--j-divider)',
          background: 'var(--parchment)',
        }}>
          <span style={{ fontSize: '0.75em', letterSpacing: '0.12em', color: 'var(--text-label)' }}>
            OUTFITTER
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: '1em', padding: '0 0.2rem',
            }}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Left: slot list */}
          <div style={{
            width: 210, flexShrink: 0,
            borderRight: '1px solid var(--j-divider)',
            overflowY: 'auto',
            padding: '0.5rem 0',
          }}>
            {SLOT_DEFS.map((def, idx) => {
              const name = (ch[def.key] as string | null | undefined) ?? null;
              const item = name ? allItems.find(i => i.name === name) : null;
              const bonus = item?.meta.equipBonus;
              const stat  = item?.meta.equipStat;
              const isFocused = idx === focusedSlotIdx;
              return (
                <div
                  key={idx}
                  onClick={() => setFocusedSlotIdx(idx)}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 1,
                    padding: '0.4rem 0.75rem',
                    cursor: 'pointer',
                    background: isFocused ? 'var(--parchment)' : 'transparent',
                    borderLeft: isFocused ? '2px solid var(--ink)' : '2px solid transparent',
                    transition: 'background 0.1s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4em' }}>
                    <span style={{ width: '1.2em', textAlign: 'center', flexShrink: 0 }}>{def.icon}</span>
                    <span style={{ fontSize: '0.65em', color: 'var(--text-label)', width: '3.2em', flexShrink: 0, letterSpacing: '0.06em' }}>
                      {def.label}
                    </span>
                    <span style={{
                      fontSize: '0.72em',
                      color: name ? 'var(--j-text)' : 'var(--text-muted)',
                      fontStyle: name ? 'normal' : 'italic',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {name ?? '— empty —'}
                    </span>
                  </div>
                  {name && bonus != null && (
                    <div style={{ paddingLeft: '1.6em', fontSize: '0.65em', color: 'var(--text-muted)' }}>
                      {statLabel(stat)} +{bonus}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right: candidates for focused slot */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0.6rem 0.8rem' }}>
            <div style={{ fontSize: '0.65em', color: 'var(--text-label)', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
              {focusedDef.label} — available in inventory
            </div>

            {/* Currently equipped item action */}
            {equippedName && (
              <div style={{
                padding: '0.4rem 0.5rem',
                marginBottom: '0.5rem',
                background: 'var(--parchment)',
                border: '1px solid var(--j-divider)',
                fontSize: '0.78em',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--j-text)' }}>
                    {equippedName}
                    {equippedBonus != null && (
                      <span style={{ color: 'var(--text-muted)', marginLeft: '0.4em' }}>
                        {statLabel(equippedStat)} +{equippedBonus}
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => unequip(focusedDef.unequipCmd)}
                    style={{
                      background: 'none',
                      border: '1px solid var(--danger-border)',
                      color: 'var(--danger-text)',
                      fontSize: '0.7em',
                      padding: '0.1rem 0.5rem',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-dossier)',
                      letterSpacing: '0.04em',
                    }}
                  >REMOVE</button>
                </div>
              </div>
            )}

            {candidates.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.78em', marginTop: '0.3rem' }}>
                No {focusedDef.label.toLowerCase()} gear in inventory.
              </div>
            ) : (
              candidates.map(({ id, name, meta }) => {
                const isSameAsEquipped = name === equippedName;
                return (
                  <div
                    key={id}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '0.4rem 0.5rem',
                      marginBottom: '0.3rem',
                      border: '1px solid var(--j-divider)',
                      background: isSameAsEquipped ? 'var(--parchment)' : 'transparent',
                      opacity: isSameAsEquipped ? 0.5 : 1,
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '0.8em', color: 'var(--j-text)' }}>{name}</span>
                      {meta.equipBonus != null && (
                        <span style={{ fontSize: '0.72em', color: 'var(--text-muted)', marginLeft: '0.5em' }}>
                          {statLabel(meta.equipStat)} +{meta.equipBonus}
                        </span>
                      )}
                      {meta.equipBonus != null && !isSameAsEquipped && (
                        <DiffBadge
                          current={equippedBonus}
                          candidate={meta.equipBonus}
                          stat={meta.equipStat}
                        />
                      )}
                    </div>
                    {!isSameAsEquipped && (
                      <button
                        onClick={() => equip(id)}
                        style={{
                          background: 'none',
                          border: '1px solid var(--j-border)',
                          color: 'var(--j-text-dim)',
                          fontSize: '0.7em',
                          padding: '0.1rem 0.5rem',
                          cursor: 'pointer',
                          fontFamily: 'var(--font-dossier)',
                          letterSpacing: '0.04em',
                          flexShrink: 0,
                          marginLeft: '0.5rem',
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLElement).style.borderColor = 'var(--blue)';
                          (e.currentTarget as HTMLElement).style.color = 'var(--blue)';
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLElement).style.borderColor = 'var(--j-border)';
                          (e.currentTarget as HTMLElement).style.color = 'var(--j-text-dim)';
                        }}
                      >EQUIP</button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
