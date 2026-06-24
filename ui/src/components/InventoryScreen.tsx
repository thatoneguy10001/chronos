import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { getItemMeta, getItemName, getItemDescription } from '@/bridge/engine';
import type { CharacterStateDTO } from '@/types/contracts';

const SLOTS: { key: keyof CharacterStateDTO; label: string; unequipCmd: string; span?: boolean }[] = [
  { key: 'equipped_weapon',      label: 'Weapon', unequipCmd: 'unequip weapon',      span: true },
  { key: 'equipped_head',        label: 'Head',   unequipCmd: 'unequip head'         },
  { key: 'equipped_body',        label: 'Body',   unequipCmd: 'unequip body'         },
  { key: 'equipped_hands',       label: 'Hands',  unequipCmd: 'unequip hands'        },
  { key: 'equipped_feet',        label: 'Feet',   unequipCmd: 'unequip feet'         },
  { key: 'equipped_accessory_1', label: 'Acc 1',  unequipCmd: 'unequip accessory'    },
  { key: 'equipped_accessory_2', label: 'Acc 2',  unequipCmd: 'unequip accessory_2'  },
];

function GearSlot({ slotKey, label, unequipCmd, name, span, submitCommand }: {
  slotKey: string; label: string; unequipCmd: string;
  name: string | null | undefined; span?: boolean;
  submitCommand: (cmd: string) => void;
}) {
  return (
    <div style={{
      background: 'var(--ui-card)',
      border: `1px solid ${name ? 'rgba(200,168,74,0.22)' : 'var(--ui-gold-border)'}`,
      borderLeft: slotKey === 'equipped_weapon' ? '3px solid var(--ui-blue)' : undefined,
      borderRadius: 2,
      padding: '7px 8px',
      gridColumn: span ? 'span 2' : undefined,
      display: span ? 'flex' : 'flex',
      flexDirection: span ? 'row' : 'column',
      alignItems: span ? 'center' : 'flex-start',
      gap: span ? 8 : 3,
      minHeight: span ? 44 : 58,
    }}>
      <div style={{ fontSize: 8.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ui-dim)', fontFamily: 'var(--font-dossier)', flexShrink: 0 }}>
        {label}
      </div>
      {name ? (
        <>
          <div style={{ fontSize: 11, color: 'var(--ui-cream)', fontFamily: 'var(--font-dossier)', lineHeight: 1.3, flex: span ? 1 : undefined }}>
            {name}
          </div>
          <button
            onClick={() => submitCommand(unequipCmd)}
            style={{
              background: 'transparent', border: '1px solid rgba(154,58,58,0.25)',
              color: 'rgba(154,58,58,0.55)', fontFamily: 'var(--font-dossier)',
              fontSize: 8.5, padding: '2px 6px', cursor: 'pointer', borderRadius: 2,
              letterSpacing: '0.06em', flexShrink: 0, marginTop: span ? 0 : 'auto',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ui-red-hi)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--ui-red-dim)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(154,58,58,0.55)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(154,58,58,0.25)'; }}
          >
            REMOVE
          </button>
        </>
      ) : (
        <div style={{ fontSize: 9.5, color: 'rgba(212,200,168,0.18)', fontStyle: 'italic', flex: 1 }}>— empty —</div>
      )}
    </div>
  );
}

function ItemRow({ id, submitCommand }: { id: string; submitCommand: (cmd: string) => void }) {
  const [hovered, setHovered] = useState(false);
  const meta = getItemMeta(id);
  const name = getItemName(id);
  const desc = getItemDescription(id);

  let actionLabel = '';
  let actionCmd   = '';
  let actionColor = 'var(--ui-dim)';

  if (meta.canUse)       { actionLabel = 'USE';   actionCmd = `use ${name.toLowerCase()}`; actionColor = 'var(--ui-green)'; }
  else if (meta.canEquip){ actionLabel = 'EQUIP'; actionCmd = `equip ${id}`;               actionColor = 'var(--ui-blue)'; }
  else if (meta.canLoad) { actionLabel = 'LOAD';  actionCmd = `load ${id}`;                actionColor = 'var(--ui-gold)'; }

  const borderAccent = meta.canUse ? 'rgba(100,180,100,0.45)' : meta.canEquip ? 'rgba(100,140,210,0.45)' : meta.canLoad ? 'rgba(200,168,74,0.45)' : 'rgba(212,200,168,0.15)';

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9,
        background: 'var(--ui-card)',
        border: '1px solid var(--ui-gold-border)',
        borderLeft: `3px solid ${borderAccent}`,
        borderRadius: 2,
        padding: '8px 10px', marginBottom: 5,
        cursor: actionLabel ? 'pointer' : 'default',
        transition: 'border-color 0.12s',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 'bold', color: 'var(--ui-cream)', fontFamily: 'var(--font-dossier)' }}>{name}</div>
          {meta.effectHint && (
            <div style={{ fontSize: 9.5, color: actionColor, fontFamily: 'var(--font-dossier)', marginTop: 2 }}>{meta.effectHint}</div>
          )}
        </div>
        {actionLabel && (
          <button
            onClick={() => submitCommand(actionCmd)}
            style={{
              background: 'transparent',
              border: `1px solid ${actionColor}`,
              color: actionColor,
              fontFamily: 'var(--font-dossier)',
              fontSize: 9.5, padding: '3px 9px', cursor: 'pointer', borderRadius: 2,
              letterSpacing: '0.06em', flexShrink: 0, opacity: 0.75,
              transition: 'opacity 0.1s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0.75'; }}
          >
            {actionLabel}
          </button>
        )}
      </div>

      {hovered && desc && (
        <div style={{
          position: 'absolute', right: '100%', top: 0,
          width: 190, marginRight: '0.4rem', zIndex: 100, pointerEvents: 'none',
          background: 'var(--ui-bg-2)', border: '1px solid var(--ui-gold-border)',
          borderLeft: `2px solid ${borderAccent}`,
          padding: '7px 9px', borderRadius: 2,
        }}>
          <div style={{ fontSize: 11, color: actionColor, fontWeight: 'bold', marginBottom: 3, fontFamily: 'var(--font-dossier)' }}>{name}</div>
          <div style={{ fontSize: 10, color: 'var(--ui-dim)', lineHeight: 1.5, fontFamily: 'var(--font-dossier)' }}>{desc}</div>
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

  const combatNote = enemies.some(e => e.hp > 0 && e.room_id === currentRoomId);

  const consumables = inventoryIds.filter(id => { const m = getItemMeta(id); return m.canUse && m.consumable; });
  const gear        = inventoryIds.filter(id => getItemMeta(id).canEquip);
  const loadable    = inventoryIds.filter(id => getItemMeta(id).canLoad);
  const other       = inventoryIds.filter(id => { const m = getItemMeta(id); return !m.canUse && !m.canEquip && !m.canLoad; });

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden', fontFamily: 'var(--font-dossier)' }}>

      {/* ── Left: Loadout ── */}
      <div style={{
        width: 220, flexShrink: 0,
        borderRight: '1px solid var(--ui-gold-border)',
        padding: '11px',
        background: 'var(--ui-bg-2)',
        overflowY: 'auto',
      }}>
        <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ui-gold-dim)', marginBottom: 7 }}>
          Loadout
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
          {SLOTS.map(({ key, label, unequipCmd, span }) => (
            <GearSlot
              key={key}
              slotKey={key}
              label={label}
              unequipCmd={unequipCmd}
              name={playerCharacter[key] as string | null}
              span={span}
              submitCommand={submitCommand}
            />
          ))}
        </div>

        {/* Stat strip */}
        <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--ui-gold-border)', display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {[['ATK', playerCharacter.attack], ['DEF', playerCharacter.defense], ['HIT', playerCharacter.hit], ['LCK', playerCharacter.luck]].map(([l, v]) => (
            <span key={l} style={{ fontSize: 10, background: 'var(--ui-card)', border: '1px solid var(--ui-gold-border)', padding: '2px 7px', borderRadius: 2, color: 'var(--ui-dim)' }}>
              {l} <strong style={{ color: 'var(--ui-cream)' }}>{v}</strong>
            </span>
          ))}
        </div>
      </div>

      {/* ── Right: Bag ── */}
      <div style={{ flex: 1, padding: '11px 12px', overflowY: 'auto' }}>
        {combatNote && (
          <div style={{
            fontSize: 9.5, color: 'var(--ui-red-hi)',
            border: '1px solid var(--ui-red-dim)', borderRadius: 2,
            padding: '5px 9px', marginBottom: 10,
            background: 'rgba(154,58,58,0.06)', fontFamily: 'var(--font-dossier)',
          }}>
            Using an item during combat costs your turn. The enemy acts next.
          </div>
        )}

        {consumables.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ui-gold-dim)', marginBottom: 7 }}>Consumables</div>
            {consumables.map(id => <ItemRow key={id} id={id} submitCommand={submitCommand} />)}
          </div>
        )}
        {gear.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ui-gold-dim)', marginBottom: 7 }}>Gear</div>
            {gear.map(id => <ItemRow key={id} id={id} submitCommand={submitCommand} />)}
          </div>
        )}
        {loadable.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ui-gold-dim)', marginBottom: 7 }}>Payload</div>
            {loadable.map(id => <ItemRow key={id} id={id} submitCommand={submitCommand} />)}
          </div>
        )}
        {other.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ui-gold-dim)', marginBottom: 7 }}>Other</div>
            {other.map(id => <ItemRow key={id} id={id} submitCommand={submitCommand} />)}
          </div>
        )}
        {inventoryIds.length === 0 && (
          <div style={{ color: 'var(--ui-dim)', fontStyle: 'italic', fontSize: 13, fontFamily: 'Georgia, serif', marginTop: '0.5rem' }}>
            Nothing carried.
          </div>
        )}
      </div>
    </div>
  );
}
