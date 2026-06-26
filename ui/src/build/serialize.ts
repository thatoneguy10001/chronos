import type { WorldMeta } from '@/bridge/engine';
import type { BuildDraft, DraftClass } from '@/store/buildStore';
import { LAYER_ORDER } from '@/build/layers';

/**
 * Draft → world JSON serializer — the keystone of Build Mode.
 *
 * Everything the editors accumulate lives in the buildStore draft. This module
 * turns that draft into the exact JSON bundle the engine loads: a manifest plus
 * per-entity files (rooms, items, classes, npcs, quests). The same bundle powers
 * both halves of "your world runs":
 *   • Test Play (#45) feeds it straight into an in-browser engine instance.
 *   • Export (#46) writes the same files out for sharing.
 *
 * Building it once, here, is what guarantees the world you test is byte-for-byte
 * the world you export and the world someone else plays. The shapes below mirror
 * the engine's serde structs in `engine/chronos-core/src/data/schemas.rs` — keep
 * them in sync.
 */

/** One serialized entity file: a name and its JSON text, as the engine loads them. */
export interface SerializedFile {
  filename: string;
  content: string;
}

/**
 * A fully serialized world, in the shape the WASM engine constructor consumes
 * (`{ rooms, items, … , manifest }`) plus the `meta` the play UI shows in chrome.
 */
export interface SerializedWorld {
  meta: WorldMeta;
  rooms: SerializedFile[];
  items: SerializedFile[];
  classes: SerializedFile[];
  npcs: SerializedFile[];
  quests: SerializedFile[];
  passives: SerializedFile[];
  manifest: string;
}

const file = (id: string, obj: unknown): SerializedFile => ({
  filename: `${id}.json`,
  content: JSON.stringify(obj),
});

/** Item draft → engine ItemTemplate. The `kind` becomes the right attribute bag. */
function itemToTemplate(item: BuildDraft['items'][number]) {
  const attributes: Record<string, unknown> =
    item.kind === 'equipment'
      ? { equip_stat: item.equipStat, equip_bonus: item.equipBonus }
      : item.kind === 'consumable'
        ? { use_effect: 'heal', heal_amount: item.healAmount }
        : {};
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    takeable: true,
    attributes,
    tags: item.tags,
  };
}

/**
 * Class draft → engine ClassTemplate. Heroes and enemies are the same engine
 * type; the only difference is that enemies carry rewards + a loot table, while a
 * playable class omits `xp_reward`/`gold_reward` (which is exactly how the loaders
 * tell a playable class from an enemy).
 */
function classToTemplate(cls: DraftClass) {
  const base = {
    id: cls.id,
    name: cls.name,
    description: cls.description,
    // `intelligence` rounds out the stat block the engine expects; the content
    // editor only exposes the three core stats, so it defaults to 0 for now.
    base_stats: { hp: cls.hp, attack: cls.attack, defense: cls.defense, intelligence: 0 },
  };
  if (cls.role === 'enemy') {
    return {
      ...base,
      xp_reward: cls.xpReward,
      gold_reward: cls.goldReward,
      loot_table: cls.loot
        .filter(l => l.itemId)
        .map(l => ({ item_id: l.itemId, chance: l.chance })),
    };
  }
  return { ...base, starting_equipment: cls.startingEquipment };
}

/** NPC draft → engine NpcTemplate. Engine `DialogueLine` needs a `prompt`; we use
 *  the keyword as the button label, which reads naturally enough ("war" → "war"). */
function npcToTemplate(npc: BuildDraft['npcs'][number]) {
  return {
    id: npc.id,
    name: npc.name,
    greeting: npc.greeting,
    dialogue: npc.dialogue.map(d => ({
      keyword: d.keyword,
      prompt: d.keyword,
      response: d.response,
    })),
  };
}

/** Room draft → engine RoomTemplate. The exits array becomes a direction-keyed map. */
function roomToTemplate(room: BuildDraft['rooms'][number]) {
  const exits: Record<string, { target_room_id: string }> = {};
  for (const exit of room.exits) {
    if (exit.target) exits[exit.direction] = { target_room_id: exit.target };
  }
  return { id: room.id, name: room.name, description: room.description, exits };
}

/** Quest draft → engine QuestTemplate, with the tagged objective the engine wants. */
function questToTemplate(quest: BuildDraft['quests'][number]) {
  const objective =
    quest.objectiveType === 'kill_count'
      ? { type: 'kill_count', class_id: quest.targetId, count: quest.killCount }
      : quest.objectiveType === 'reach_room'
        ? { type: 'reach_room', room_id: quest.targetId }
        : { type: 'talk_to', npc_id: quest.targetId };
  return {
    id: quest.id,
    name: quest.name,
    description: quest.description,
    objective,
    gold_reward: quest.goldReward,
    xp_reward: quest.xpReward,
    giver_npc_id: quest.giverNpcId ?? '',
    accept_text: quest.acceptText,
    complete_text: quest.completeText,
    hope_reward: quest.hopeReward,
    requires_quest_complete: quest.prereqQuestIds,
  };
}

/** Synthetic id/title for a draft world until a world-name field exists (#46). */
const DRAFT_WORLD_ID = '__draft__';

/**
 * Serialize a draft into the engine's world bundle.
 *
 * Two placement defaults bridge gaps the editors don't yet capture:
 *   • Every enemy is dropped into the start room as an encounter, so a test world
 *     is actually fightable. (A dedicated placement editor can refine this later.)
 *   • NPCs are placed by their authored `roomId`; unplaced NPCs are left out.
 */
export function serializeWorld(draft: BuildDraft, opts: { title?: string } = {}): SerializedWorld {
  const title = opts.title?.trim() || 'Your World';
  const startRoomId = draft.startRoomId ?? draft.rooms[0]?.id ?? '';

  const enemyEncounters = startRoomId
    ? draft.classes
        .filter(c => c.role === 'enemy')
        .map(c => ({ class_id: c.id, room_id: startRoomId }))
    : [];

  const npcPlacements = draft.npcs
    .filter(n => n.roomId)
    .map(n => ({ npc_id: n.id, room_id: n.roomId }));

  // Layers in canonical pipeline order, as `{ id }` configs.
  const layers = [...draft.layers]
    .sort((a, b) => LAYER_ORDER.indexOf(a) - LAYER_ORDER.indexOf(b))
    .map(id => ({ id }));

  const manifest = {
    schema_version: 1,
    start_room_id: startRoomId,
    title,
    layers,
    encounters: enemyEncounters,
    npc_placements: npcPlacements,
  };

  const meta: WorldMeta = {
    id: DRAFT_WORLD_ID,
    title,
    tagline: 'A world you built.',
    description: '',
    tone: 'fantasy',
    currency: 'gold',
    currency_symbol: '⬡',
  };

  return {
    meta,
    rooms: draft.rooms.map(r => file(r.id, roomToTemplate(r))),
    items: draft.items.map(i => file(i.id, itemToTemplate(i))),
    classes: draft.classes.map(c => file(c.id, classToTemplate(c))),
    npcs: draft.npcs.map(n => file(n.id, npcToTemplate(n))),
    quests: draft.quests.map(q => file(q.id, questToTemplate(q))),
    passives: [],
    manifest: JSON.stringify(manifest),
  };
}
