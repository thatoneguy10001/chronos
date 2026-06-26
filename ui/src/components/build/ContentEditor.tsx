import { useBuildStore } from '@/store/buildStore';
import type { DraftClass, DraftItem, ItemKind } from '@/store/buildStore';

/**
 * Items, Classes & Enemies editor — the stuff that fills the world.
 *
 * Three lists backed by one draft:
 *   • Items     — gear (boosts a stat when equipped), consumables (heal on use),
 *                 or plain objects. The `kind` just chooses which attribute bag
 *                 the engine reads.
 *   • Classes   — what the player can *become*: core stats + the gear they start with.
 *   • Enemies   — what the player *fights*: core stats + XP/gold/loot on death.
 *
 * Classes and enemies are the same engine type (`ClassTemplate`); we only split
 * them in the UI because authoring "a hero" and "a monster" are different jobs.
 * Equipment and loot pick from the items above, so a reference can't dangle.
 */

// One shared input look for every field in this editor — defined once so the
// item and class cards don't each redeclare it.
const inputStyle = {
  background: 'rgba(255,255,255,0.4)',
  border: '1px solid var(--ink-faint)',
  borderRadius: 2,
  color: 'var(--ink-narrative)',
  fontFamily: 'var(--font-journal)',
  padding: '0.35rem 0.5rem',
  fontSize: '0.9em',
} as const;

const labelStyle = {
  color: 'var(--ink-faint)',
  fontSize: '0.7em',
  letterSpacing: '0.15em',
  fontFamily: 'var(--font-dossier)' as const,
};

const cardStyle = {
  border: '1px solid var(--ink-faint)',
  borderRadius: 2,
  padding: '0.85rem 1rem',
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '0.6rem',
};

const addButtonStyle = {
  background: 'transparent',
  border: '1px solid var(--ink-narrative)',
  color: 'var(--ink-narrative)',
  fontFamily: 'var(--font-dossier)' as const,
  fontSize: '0.8em',
  padding: '0.4rem 1rem',
  cursor: 'pointer',
};

const deleteButtonStyle = {
  background: 'transparent',
  border: 'none',
  color: 'var(--ink-faint)',
  cursor: 'pointer',
  fontSize: '1.1em',
  padding: '0 0.3rem',
};

export function ContentEditor({ onBack }: { onBack: () => void }) {
  const items = useBuildStore(s => s.draft.items);
  const classes = useBuildStore(s => s.draft.classes);
  const addItem = useBuildStore(s => s.addItem);
  const addClass = useBuildStore(s => s.addClass);
  const party = useBuildStore(s => s.draft.party);
  const togglePartyMember = useBuildStore(s => s.togglePartyMember);
  const validateContent = useBuildStore(s => s.validateContent);
  const errors = validateContent();

  const heroes = classes.filter(c => c.role === 'playable');
  const enemies = classes.filter(c => c.role === 'enemy');

  return (
    <div style={{ width: 'min(640px, 100%)', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Items */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={labelStyle}>{items.length} ITEM{items.length === 1 ? '' : 'S'}</span>
          <button onClick={() => addItem()} style={addButtonStyle}>+ ADD ITEM</button>
        </div>
        {items.length === 0 && (
          <div style={{ color: 'var(--ink-movement)', fontSize: '0.85em', fontStyle: 'italic' }}>
            No items yet — add gear to equip, potions to drink, or props to find.
          </div>
        )}
        {items.map(item => (
          <ItemCard key={item.id} item={item} />
        ))}
      </section>

      {/* Playable classes */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={labelStyle}>{heroes.length} PLAYABLE CLASS{heroes.length === 1 ? '' : 'ES'}</span>
          <button onClick={() => addClass('playable')} style={addButtonStyle}>+ ADD CLASS</button>
        </div>
        {heroes.length === 0 && (
          <div style={{ color: 'var(--ink-movement)', fontSize: '0.85em', fontStyle: 'italic' }}>
            No classes yet — add at least one for the player to become.
          </div>
        )}
        {heroes.map(cls => (
          <ClassCard key={cls.id} cls={cls} items={items} />
        ))}

        {/* Starting party — companions who travel with the lead into combat. */}
        {heroes.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', paddingTop: '0.25rem' }}>
            <span style={labelStyle}>STARTING PARTY (COMPANIONS)</span>
            <span style={{ color: 'var(--ink-faint)', fontSize: '0.74em', fontStyle: 'italic' }}>
              Playable classes that join the lead as AI companions in combat.
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {heroes.map(cls => (
                <label key={cls.id} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--ink-movement)', fontSize: '0.8em', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={party.includes(cls.id)}
                    onChange={() => togglePartyMember(cls.id)}
                    style={{ accentColor: 'var(--ink-narrative)' }}
                  />
                  {cls.name || cls.id}
                </label>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Enemies */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={labelStyle}>{enemies.length} ENEM{enemies.length === 1 ? 'Y' : 'IES'}</span>
          <button onClick={() => addClass('enemy')} style={addButtonStyle}>+ ADD ENEMY</button>
        </div>
        {enemies.length === 0 && (
          <div style={{ color: 'var(--ink-movement)', fontSize: '0.85em', fontStyle: 'italic' }}>
            No enemies yet — add something for the player to fight.
          </div>
        )}
        {enemies.map(cls => (
          <ClassCard key={cls.id} cls={cls} items={items} />
        ))}
      </section>

      <div style={{ color: errors.length ? 'var(--error)' : 'var(--ink-movement)', fontSize: '0.78em', fontFamily: 'var(--font-dossier)' }}>
        {errors.length === 0 ? '✓ Content is valid — the engine will accept this.' : errors.join('  ')}
      </div>

      <button
        onClick={onBack}
        style={{
          alignSelf: 'flex-start',
          background: 'transparent',
          border: '1px solid var(--ink-faint)',
          color: 'var(--ink-narrative)',
          fontFamily: 'var(--font-dossier)',
          fontSize: '0.8em',
          padding: '0.5rem 1.5rem',
          cursor: 'pointer',
          letterSpacing: '0.12em',
        }}
      >
        ← BUILD SECTIONS
      </button>
    </div>
  );
}

const ITEM_KINDS: { value: ItemKind; label: string }[] = [
  { value: 'plain', label: 'plain object' },
  { value: 'equipment', label: 'equipment' },
  { value: 'consumable', label: 'consumable' },
];

function ItemCard({ item }: { item: DraftItem }) {
  const updateItem = useBuildStore(s => s.updateItem);
  const removeItem = useBuildStore(s => s.removeItem);

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
        <input
          value={item.name}
          onChange={e => updateItem(item.id, { name: e.target.value })}
          placeholder="Item name"
          style={{ ...inputStyle, flex: 1, fontWeight: 600 }}
        />
        <select
          value={item.kind}
          onChange={e => updateItem(item.id, { kind: e.target.value as ItemKind })}
          style={{ ...inputStyle, fontSize: '0.8em' }}
        >
          {ITEM_KINDS.map(k => (
            <option key={k.value} value={k.value}>{k.label}</option>
          ))}
        </select>
        <button onClick={() => removeItem(item.id)} title="Delete item" style={deleteButtonStyle}>✕</button>
      </div>

      <textarea
        value={item.description}
        onChange={e => updateItem(item.id, { description: e.target.value })}
        placeholder="Describe the item — what the player sees when they look at it."
        rows={2}
        style={{ ...inputStyle, resize: 'vertical', fontSize: '0.82em' }}
      />

      {/* Kind-specific fields */}
      {item.kind === 'equipment' && (
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <span style={{ color: 'var(--ink-faint)', fontSize: '0.75em', fontFamily: 'var(--font-dossier)' }}>boosts</span>
          <input
            value={item.equipStat}
            onChange={e => updateItem(item.id, { equipStat: e.target.value })}
            placeholder="stat (e.g. attack)"
            style={{ ...inputStyle, fontSize: '0.8em', width: 160 }}
          />
          <span style={{ color: 'var(--ink-faint)', fontSize: '0.75em', fontFamily: 'var(--font-dossier)' }}>by</span>
          <input
            type="number"
            value={item.equipBonus}
            onChange={e => updateItem(item.id, { equipBonus: Number(e.target.value) })}
            style={{ ...inputStyle, fontSize: '0.8em', width: 70 }}
          />
        </div>
      )}
      {item.kind === 'consumable' && (
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <span style={{ color: 'var(--ink-faint)', fontSize: '0.75em', fontFamily: 'var(--font-dossier)' }}>heals</span>
          <input
            type="number"
            value={item.healAmount}
            onChange={e => updateItem(item.id, { healAmount: Number(e.target.value) })}
            style={{ ...inputStyle, fontSize: '0.8em', width: 70 }}
          />
          <span style={{ color: 'var(--ink-faint)', fontSize: '0.75em', fontFamily: 'var(--font-dossier)' }}>HP on use</span>
        </div>
      )}

      <input
        value={item.tags.join(', ')}
        onChange={e =>
          updateItem(item.id, {
            tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean),
          })
        }
        placeholder="tags, comma-separated (e.g. weapon, aetherian)"
        style={{ ...inputStyle, fontSize: '0.78em' }}
      />
    </div>
  );
}

function ClassCard({ cls, items }: { cls: DraftClass; items: DraftItem[] }) {
  const updateClass = useBuildStore(s => s.updateClass);
  const removeClass = useBuildStore(s => s.removeClass);
  const toggleStartingEquipment = useBuildStore(s => s.toggleStartingEquipment);
  const addLoot = useBuildStore(s => s.addLoot);
  const updateLoot = useBuildStore(s => s.updateLoot);
  const removeLoot = useBuildStore(s => s.removeLoot);

  const statField = (label: string, key: 'hp' | 'attack' | 'defense') => (
    <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--ink-movement)', fontSize: '0.72em', fontFamily: 'var(--font-dossier)' }}>
      {label}
      <input
        type="number"
        value={cls[key]}
        onChange={e => updateClass(cls.id, { [key]: Number(e.target.value) })}
        style={{ ...inputStyle, fontSize: '0.8em', width: 64 }}
      />
    </label>
  );

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
        <input
          value={cls.name}
          onChange={e => updateClass(cls.id, { name: e.target.value })}
          placeholder={cls.role === 'enemy' ? 'Enemy name' : 'Class name'}
          style={{ ...inputStyle, flex: 1, fontWeight: 600 }}
        />
        <button onClick={() => removeClass(cls.id)} title="Delete" style={deleteButtonStyle}>✕</button>
      </div>

      <textarea
        value={cls.description}
        onChange={e => updateClass(cls.id, { description: e.target.value })}
        placeholder={cls.role === 'enemy' ? 'Describe the enemy.' : 'Describe the class — who they are, how they fight.'}
        rows={2}
        style={{ ...inputStyle, resize: 'vertical', fontSize: '0.82em' }}
      />

      <div style={{ display: 'flex', gap: '0.9rem', flexWrap: 'wrap' }}>
        {statField('HP', 'hp')}
        {statField('ATK', 'attack')}
        {statField('DEF', 'defense')}
      </div>

      {/* Playable: starting equipment chosen from the items list. */}
      {cls.role === 'playable' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <span style={labelStyle}>STARTING GEAR</span>
          {items.length === 0 ? (
            <span style={{ color: 'var(--ink-faint)', fontSize: '0.78em', fontStyle: 'italic' }}>Add items above to give this class gear.</span>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {items.map(it => (
                <label key={it.id} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--ink-movement)', fontSize: '0.78em', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={cls.startingEquipment.includes(it.id)}
                    onChange={() => toggleStartingEquipment(cls.id, it.id)}
                    style={{ accentColor: 'var(--ink-narrative)' }}
                  />
                  {it.name || it.id}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Enemy: rewards + loot table. */}
      {cls.role === 'enemy' && (
        <>
          <div style={{ display: 'flex', gap: '0.9rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--ink-movement)', fontSize: '0.72em', fontFamily: 'var(--font-dossier)' }}>
              XP
              <input type="number" value={cls.xpReward} onChange={e => updateClass(cls.id, { xpReward: Number(e.target.value) })} style={{ ...inputStyle, fontSize: '0.8em', width: 64 }} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--ink-movement)', fontSize: '0.72em', fontFamily: 'var(--font-dossier)' }}>
              Gold
              <input type="number" value={cls.goldReward} onChange={e => updateClass(cls.id, { goldReward: Number(e.target.value) })} style={{ ...inputStyle, fontSize: '0.8em', width: 64 }} />
            </label>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span style={labelStyle}>LOOT TABLE</span>
            {cls.loot.map((drop, i) => (
              <div key={i} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <select
                  value={drop.itemId}
                  onChange={e => updateLoot(cls.id, i, { itemId: e.target.value })}
                  style={{ ...inputStyle, fontSize: '0.8em', flex: 1 }}
                >
                  <option value="">— choose item —</option>
                  {items.map(it => (
                    <option key={it.id} value={it.id}>{it.name || it.id}</option>
                  ))}
                </select>
                <span style={{ color: 'var(--ink-faint)', fontSize: '0.75em', fontFamily: 'var(--font-dossier)' }}>@</span>
                {/* Stored as 0..1; shown as a percentage for sanity. */}
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={Math.round(drop.chance * 100)}
                  onChange={e => updateLoot(cls.id, i, { chance: Math.min(100, Math.max(0, Number(e.target.value))) / 100 })}
                  style={{ ...inputStyle, fontSize: '0.8em', width: 60 }}
                />
                <span style={{ color: 'var(--ink-faint)', fontSize: '0.75em', fontFamily: 'var(--font-dossier)' }}>%</span>
                <button onClick={() => removeLoot(cls.id, i)} title="Remove drop" style={{ ...deleteButtonStyle, fontSize: '1em' }}>✕</button>
              </div>
            ))}
            <button
              onClick={() => addLoot(cls.id, { itemId: '', chance: 1 })}
              disabled={items.length === 0}
              style={{
                alignSelf: 'flex-start',
                background: 'transparent',
                border: 'none',
                color: items.length === 0 ? 'var(--ink-faint)' : 'var(--ink-movement)',
                fontFamily: 'var(--font-dossier)',
                fontSize: '0.72em',
                cursor: items.length === 0 ? 'default' : 'pointer',
                textDecoration: 'underline',
                padding: 0,
                opacity: items.length === 0 ? 0.5 : 1,
              }}
            >
              + add drop{items.length === 0 ? ' (need an item)' : ''}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
