export type EquipSlot = 'weapon' | 'head' | 'body' | 'hands' | 'feet' | 'accessory';

/** Derived UI metadata for an item — computed from its JSON definition. */
export interface ItemMeta {
  tags: string[];
  /** Short mechanical hint shown in the tooltip. e.g. "Heals 60 HP", "ATK +5 · 3 turns". */
  effectHint: string;
  /** Should the item show an EQUIP button (weapon / armor). */
  canEquip: boolean;
  /** Which body slot this item equips to, or null if not equippable. */
  equipSlot: EquipSlot | null;
  /** Stat key this item boosts when equipped, e.g. "defense" or "attack". */
  equipStat: string | null;
  /** How much the stat changes when equipped. */
  equipBonus: number | null;
  /** Should the item show a LOAD button (payload loaded into a weapon). */
  canLoad: boolean;
  /** Should the item show a USE button (has a use_effect). */
  canUse: boolean;
  /** Is the item destroyed on use? */
  consumable: boolean;
}

type ItemRaw = {
  id?: string;
  tags?: string[];
  consumable?: boolean;
  attributes?: Record<string, unknown>;
};

const EFFECT_STAT_LABEL: Record<string, string> = {
  attack_up:   'ATK',
  defense_up:  'DEF',
  tech_up:     'TECH',
  agility_up:  'AGI',
  luck_up:     'LCK',
};

const EQUIP_STAT_LABEL: Record<string, string> = {
  attack:       'ATK',
  defense:      'DEF',
  intelligence: 'INT',
  tech_attack:  'TECH',
  agility:      'AGI',
  luck:         'LCK',
};

function buildEffectHint(attr: Record<string, unknown>, tags: string[]): string {
  const effect = attr['use_effect'] as string | undefined;
  const hints: string[] = [];

  if (effect === 'heal' || effect === 'heal_and_cure') {
    const amt = attr['heal_amount'] as number | undefined;
    if (amt) hints.push(`Heals ${amt} HP`);
  }
  if (effect === 'cure_status' || effect === 'heal_and_cure') {
    const cures = attr['cures_kind'] as string | undefined;
    hints.push(cures === 'all' || !cures ? 'Cures all effects' : `Cures ${cures}`);
  }
  if (effect === 'buff') {
    const kind   = attr['effect_kind']    as string | undefined;
    const amt    = attr['effect_amount']  as number | undefined;
    const dur    = attr['effect_duration'] as number | undefined;
    const label  = kind ? (EFFECT_STAT_LABEL[kind] ?? kind.toUpperCase()) : '?';
    if (amt && dur) hints.push(`${label} +${amt} · ${dur} turns`);
  }
  if (effect === 'revive') {
    const pct = attr['revive_percent'] as number | undefined;
    hints.push(`Revives at ${pct ?? 50}% HP`);
  }

  // Passive equip bonus (always active while in inventory or equipped)
  const equipStat  = attr['equip_stat']  as string | undefined;
  const equipBonus = attr['equip_bonus'] as number | undefined;
  if (equipStat && equipBonus) {
    const label = EQUIP_STAT_LABEL[equipStat] ?? equipStat.toUpperCase();
    hints.push(`${label} +${equipBonus} while carried`);
  }

  if (hints.length === 0 && tags.includes('weapon')) hints.push('Equippable weapon');
  if (hints.length === 0 && tags.includes('armor'))  hints.push('Equippable armor');
  if (hints.length === 0 && tags.includes('payload')) hints.push('Load into a weapon');

  return hints.join(' · ');
}

function slotFromTags(tags: string[]): EquipSlot | null {
  for (const tag of tags) {
    switch (tag) {
      case 'weapon': case 'sword': case 'axe': case 'spear': case 'bow':
      case 'staff': case 'dagger': case 'mace': case 'shield': case 'gun':
      case 'syringe-spear':
        return 'weapon';
      case 'helm': case 'helmet': case 'hat': case 'hood': case 'crown':
      case 'cap': case 'headgear': case 'circlet':
        return 'head';
      case 'body': case 'chest': case 'vest': case 'coat': case 'robe':
      case 'plate': case 'cuirass': case 'jerkin': case 'tunic':
        return 'body';
      case 'gloves': case 'gauntlets': case 'bracers': case 'hands': case 'mitts':
        return 'hands';
      case 'boots': case 'shoes': case 'greaves': case 'feet': case 'sandals':
      case 'sabatons':
        return 'feet';
      case 'accessory': case 'ring': case 'amulet': case 'talisman': case 'badge':
      case 'pendant': case 'brooch': case 'charm':
        return 'accessory';
    }
  }
  return null;
}

export function buildItemMeta(raw: ItemRaw): ItemMeta {
  const tags  = raw.tags ?? [];
  const attr  = raw.attributes ?? {};
  const consumable = raw.consumable !== false && (attr['consumable'] as boolean | undefined) !== false;
  const useEffect  = attr['use_effect'] as string | undefined;
  const equipSlot  = slotFromTags(tags);

  return {
    tags,
    effectHint: buildEffectHint(attr, tags),
    canEquip:   equipSlot !== null,
    equipSlot,
    equipStat:  (attr['equip_stat'] as string | undefined) ?? null,
    equipBonus: (attr['equip_bonus'] as number | undefined) ?? null,
    canLoad:    tags.includes('payload'),
    canUse:     !!useEffect,
    consumable,
  };
}
