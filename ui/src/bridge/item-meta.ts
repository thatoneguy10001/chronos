/** Derived UI metadata for an item — computed from its JSON definition. */
export interface ItemMeta {
  tags: string[];
  /** Short mechanical hint shown in the tooltip. e.g. "Heals 60 HP", "ATK +5 · 3 turns". */
  effectHint: string;
  /** Should the item show an EQUIP button (weapon / armor). */
  canEquip: boolean;
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

export function buildItemMeta(raw: ItemRaw): ItemMeta {
  const tags  = raw.tags ?? [];
  const attr  = raw.attributes ?? {};
  const consumable = raw.consumable !== false && (attr['consumable'] as boolean | undefined) !== false;
  const useEffect  = attr['use_effect'] as string | undefined;

  return {
    tags,
    effectHint: buildEffectHint(attr, tags),
    canEquip:   tags.includes('weapon') || tags.includes('armor') || tags.includes('accessory'),
    canLoad:    tags.includes('payload'),
    canUse:     !!useEffect,
    consumable,
  };
}
