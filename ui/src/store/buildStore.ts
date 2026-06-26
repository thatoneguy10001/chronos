import { create } from 'zustand';
import {
  GENRE_PRESETS,
  KNOWN_LAYERS,
  inCanonicalOrder,
  layerSpec,
} from '@/build/layers';

/**
 * Build Mode draft — the world being authored.
 *
 * For now it holds the layer stack (the genre-defining `layers[]`). As later
 * Phase-3 editors land (rooms, NPCs, items, quests), the draft grows to hold the
 * whole world, and `toManifestLayers()` / an eventual exporter serialize it to
 * the exact JSON the engine already consumes.
 *
 * The stack is always kept in canonical pipeline order and dependency-complete:
 * adding a layer pulls in what it requires; removing one drops whatever depended
 * on it. So the draft can't drift into an invalid state, and `validate()` is a
 * belt-and-braces check rather than the only guard.
 */

/** One exit from a room: leave in `direction`, arrive at room `target`. */
export interface DraftExit {
  direction: string;
  target: string;
}

/** A room being authored. `id` is stable (exits reference it); `name` is display. */
export interface DraftRoom {
  id: string;
  name: string;
  description: string;
  exits: DraftExit[];
}

export interface BuildDraft {
  /** Active layer ids, always in canonical order. */
  layers: string[];
  /** The world's rooms. */
  rooms: DraftRoom[];
  /** Which room the player spawns in. Must reference an existing room. */
  startRoomId: string | null;
  /** The world's NPCs. */
  npcs: DraftNpc[];
  /** The world's items — gear, consumables, plain objects. */
  items: DraftItem[];
  /** The world's character classes — playable heroes and enemies alike. */
  classes: DraftClass[];
  /** The world's quests — the objectives that chain into a story. */
  quests: DraftQuest[];
}

/**
 * What kind of item this is. The engine reads different `attributes` for each:
 * equipment carries `equip_stat`/`equip_bonus`; a consumable carries
 * `use_effect`/`heal_amount`; a plain item carries neither. Picking the kind here
 * is just a friendlier way to author that attribute bag.
 */
export type ItemKind = 'plain' | 'equipment' | 'consumable';

/** An item being authored. `kind` drives which of the kind-specific fields matter. */
export interface DraftItem {
  id: string;
  name: string;
  description: string;
  kind: ItemKind;
  /** Equipment: the stat the gear boosts (e.g. "attack", "defense"). */
  equipStat: string;
  /** Equipment: how much it boosts that stat. */
  equipBonus: number;
  /** Consumable: HP restored when used. */
  healAmount: number;
  /** Free-form tags (e.g. "weapon", "medical"). */
  tags: string[];
}

/** Whether a class is something the player can *become* or an *enemy* they fight. */
export type ClassRole = 'playable' | 'enemy';

/** One loot possibility: item `itemId` drops with probability `chance` (0..1). */
export interface DraftLoot {
  itemId: string;
  chance: number;
}

/**
 * A character class being authored — a playable hero or an enemy.
 *
 * Both serialize to the engine's single `ClassTemplate`; `role` only changes how
 * the world *references* the class (a playable class is chosen with `become`, an
 * enemy is dropped into a room as an encounter). Keeping them in one list (and one
 * id namespace) mirrors the engine, where class ids must be unique across both.
 */
export interface DraftClass {
  id: string;
  name: string;
  description: string;
  role: ClassRole;
  /** Core stats. World-defined/flex stats are a later pass. */
  hp: number;
  attack: number;
  defense: number;
  /** Playable only: item ids the hero spawns holding. */
  startingEquipment: string[];
  /** Enemy only: XP granted to whoever lands the killing blow. */
  xpReward: number;
  /** Enemy only: gold dropped on death. */
  goldReward: number;
  /** Enemy only: items that may drop on death, each rolled independently. */
  loot: DraftLoot[];
}

/**
 * What the player must do to finish a quest. Mirrors the engine's tagged
 * `QuestObjective`: kill N of an enemy class, reach a room, or talk to an NPC.
 */
export type QuestObjectiveType = 'kill_count' | 'reach_room' | 'talk_to';

/** The three objective types, with the kind of thing each one targets. */
export const QUEST_OBJECTIVES: { value: QuestObjectiveType; label: string; targets: 'enemy' | 'room' | 'npc' }[] = [
  { value: 'kill_count', label: 'Kill enemies', targets: 'enemy' },
  { value: 'reach_room', label: 'Reach a room', targets: 'room' },
  { value: 'talk_to', label: 'Talk to an NPC', targets: 'npc' },
];

/**
 * A quest being authored. An NPC `giver` hands it out; the player completes the
 * `objective` (whose `targetId` points at an enemy class, a room, or an NPC
 * depending on the type) and earns the rewards. `prereqQuestIds` gates this quest
 * behind others, which is how a string of quests becomes a story.
 */
export interface DraftQuest {
  id: string;
  name: string;
  description: string;
  /** NPC who grants the quest (references draft.npcs), or null if unset. */
  giverNpcId: string | null;
  objectiveType: QuestObjectiveType;
  /** The objective's target id: an enemy class / room / NPC, per objectiveType. */
  targetId: string;
  /** kill_count only: how many to defeat. */
  killCount: number;
  goldReward: number;
  xpReward: number;
  hopeReward: number;
  /** Shown when the player accepts the quest. */
  acceptText: string;
  /** Shown when the player turns it in. */
  completeText: string;
  /** Quests that must be completed before this one is offered. */
  prereqQuestIds: string[];
}

/** One conversation topic: the player types `keyword`, the NPC says `response`. */
export interface DraftDialogue {
  keyword: string;
  response: string;
}

/** An NPC being authored: stands in a room, greets, and can be asked topics. */
export interface DraftNpc {
  id: string;
  name: string;
  greeting: string;
  /** Room the NPC stands in (references draft.rooms), or null if unplaced. */
  roomId: string | null;
  dialogue: DraftDialogue[];
}

/** The compass directions a room exit can use, in display order. */
export const EXIT_DIRECTIONS = ['north', 'south', 'east', 'west', 'up', 'down'] as const;

interface BuildStore {
  draft: BuildDraft;
  // --- Layers ---
  /** Toggle a layer on/off, cascading dependencies both ways. */
  toggleLayer: (id: string) => void;
  /** Replace the stack with a genre preset. */
  applyPreset: (presetId: string) => void;
  /** Clear the stack. */
  clearLayers: () => void;
  /** Dependency-validate the current stack; empty array means valid. */
  validate: () => string[];
  // --- Rooms ---
  /** Add a fresh room and return its generated id. The first room becomes start. */
  addRoom: () => string;
  /** Patch a room's name/description. */
  updateRoom: (id: string, patch: Partial<Pick<DraftRoom, 'name' | 'description'>>) => void;
  /** Delete a room, plus any exits pointing at it; clears start if it was start. */
  removeRoom: (id: string) => void;
  /** Set the player's spawn room. */
  setStartRoom: (id: string) => void;
  /** Add an exit from a room. */
  addExit: (roomId: string, exit: DraftExit) => void;
  /** Patch an exit by index. */
  updateExit: (roomId: string, index: number, patch: Partial<DraftExit>) => void;
  /** Remove an exit by index. */
  removeExit: (roomId: string, index: number) => void;
  /** Validate rooms (start set, exit targets exist); empty means valid. */
  validateRooms: () => string[];
  // --- NPCs ---
  /** Add a fresh NPC and return its generated id. */
  addNpc: () => string;
  /** Patch an NPC's name/greeting/placement. */
  updateNpc: (id: string, patch: Partial<Pick<DraftNpc, 'name' | 'greeting' | 'roomId'>>) => void;
  /** Delete an NPC. */
  removeNpc: (id: string) => void;
  /** Add a dialogue topic to an NPC. */
  addDialogue: (npcId: string, line: DraftDialogue) => void;
  /** Patch a dialogue topic by index. */
  updateDialogue: (npcId: string, index: number, patch: Partial<DraftDialogue>) => void;
  /** Remove a dialogue topic by index. */
  removeDialogue: (npcId: string, index: number) => void;
  /** Validate NPCs (names, placements, dialogue completeness); empty means valid. */
  validateNpcs: () => string[];
  // --- Items ---
  /** Add a fresh item and return its generated id. */
  addItem: () => string;
  /** Patch an item's fields. */
  updateItem: (id: string, patch: Partial<Omit<DraftItem, 'id'>>) => void;
  /** Delete an item, scrubbing references to it from class equipment and loot. */
  removeItem: (id: string) => void;
  // --- Classes (playable + enemies) ---
  /** Add a fresh class of the given role and return its generated id. */
  addClass: (role: ClassRole) => string;
  /** Patch a class's scalar fields. */
  updateClass: (
    id: string,
    patch: Partial<Omit<DraftClass, 'id' | 'startingEquipment' | 'loot'>>,
  ) => void;
  /** Delete a class. */
  removeClass: (id: string) => void;
  /** Toggle an item in a playable class's starting equipment. */
  toggleStartingEquipment: (classId: string, itemId: string) => void;
  /** Add a loot row to an enemy class. */
  addLoot: (classId: string, loot: DraftLoot) => void;
  /** Patch a loot row by index. */
  updateLoot: (classId: string, index: number, patch: Partial<DraftLoot>) => void;
  /** Remove a loot row by index. */
  removeLoot: (classId: string, index: number) => void;
  /** Validate items + classes (names, stats, references); empty means valid. */
  validateContent: () => string[];
  // --- Quests ---
  /** Add a fresh quest and return its generated id. */
  addQuest: () => string;
  /** Patch a quest's scalar fields. */
  updateQuest: (
    id: string,
    patch: Partial<Omit<DraftQuest, 'id' | 'prereqQuestIds'>>,
  ) => void;
  /** Delete a quest, scrubbing it from other quests' prerequisites. */
  removeQuest: (id: string) => void;
  /** Toggle whether `prereqId` is a prerequisite of `questId`. */
  toggleQuestPrereq: (questId: string, prereqId: string) => void;
  /** Validate quests (names, giver, objective target, references); empty means valid. */
  validateQuests: () => string[];
  // --- Whole-draft ---
  /** Replace the entire draft (used by world-file import). */
  loadDraft: (draft: BuildDraft) => void;
  /** True when nothing has been authored yet — used to guard import overwrites. */
  isDraftEmpty: () => boolean;
}

// Next stable room id. Scans existing `room_N` ids so deletes don't cause reuse
// collisions (which would silently re-point old exits at a new room).
function nextRoomId(rooms: DraftRoom[]): string {
  let max = 0;
  for (const r of rooms) {
    const m = /^room_(\d+)$/.exec(r.id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `room_${max + 1}`;
}

// Next stable NPC id (`npc_N`), same scheme as rooms.
function nextNpcId(npcs: DraftNpc[]): string {
  let max = 0;
  for (const n of npcs) {
    const m = /^npc_(\d+)$/.exec(n.id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `npc_${max + 1}`;
}

// Next stable id of the form `<prefix>_N`, scanning existing ids so deletes never
// cause reuse. Shared by items and classes (same scheme as rooms/npcs).
function nextSeqId<T extends { id: string }>(items: T[], prefix: string): string {
  const re = new RegExp(`^${prefix}_(\\d+)$`);
  let max = 0;
  for (const it of items) {
    const m = re.exec(it.id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}_${max + 1}`;
}

// Add `id` plus everything it (transitively) requires.
function withDependencies(active: string[], id: string): string[] {
  const next = new Set(active);
  const queue = [id];
  while (queue.length) {
    const cur = queue.pop()!;
    if (next.has(cur)) continue;
    next.add(cur);
    for (const req of layerSpec(cur)?.requires ?? []) queue.push(req);
  }
  return inCanonicalOrder([...next]);
}

// Remove `id` plus anything that (transitively) depends on it.
function withoutDependents(active: string[], id: string): string[] {
  const removed = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const layer of active) {
      if (removed.has(layer)) continue;
      const reqs = layerSpec(layer)?.requires ?? [];
      if (reqs.some(r => removed.has(r))) {
        removed.add(layer);
        changed = true;
      }
    }
  }
  return inCanonicalOrder(active.filter(l => !removed.has(l)));
}

export const useBuildStore = create<BuildStore>((set, get) => ({
  draft: { layers: [], rooms: [], startRoomId: null, npcs: [], items: [], classes: [], quests: [] },

  toggleLayer: (id: string) =>
    set(state => {
      const active = state.draft.layers;
      const layers = active.includes(id)
        ? withoutDependents(active, id)
        : withDependencies(active, id);
      return { draft: { ...state.draft, layers } };
    }),

  applyPreset: (presetId: string) =>
    set(state => {
      const preset = GENRE_PRESETS.find(p => p.id === presetId);
      if (!preset) return state;
      return { draft: { ...state.draft, layers: inCanonicalOrder(preset.layers) } };
    }),

  clearLayers: () => set(state => ({ draft: { ...state.draft, layers: [] } })),

  validate: () => {
    const active = get().draft.layers;
    const errors: string[] = [];
    const seen: string[] = [];
    for (const id of active) {
      const spec = layerSpec(id);
      if (!spec) {
        errors.push(`Unknown layer "${id}".`);
        continue;
      }
      for (const req of spec.requires) {
        if (!active.includes(req)) {
          errors.push(`"${spec.label}" needs "${layerSpec(req)?.label ?? req}".`);
        } else if (!seen.includes(req)) {
          errors.push(`"${spec.label}" must come after "${layerSpec(req)?.label ?? req}".`);
        }
      }
      seen.push(id);
    }
    return errors;
  },

  addRoom: () => {
    const id = nextRoomId(get().draft.rooms);
    set(state => {
      const n = state.draft.rooms.length + 1;
      const room: DraftRoom = {
        id,
        name: `Room ${n}`,
        description: '',
        exits: [],
      };
      const rooms = [...state.draft.rooms, room];
      // The first room added becomes the spawn point by default.
      const startRoomId = state.draft.startRoomId ?? id;
      return { draft: { ...state.draft, rooms, startRoomId } };
    });
    return id;
  },

  updateRoom: (id, patch) =>
    set(state => ({
      draft: {
        ...state.draft,
        rooms: state.draft.rooms.map(r => (r.id === id ? { ...r, ...patch } : r)),
      },
    })),

  removeRoom: id =>
    set(state => {
      const rooms = state.draft.rooms
        .filter(r => r.id !== id)
        // Drop any exits that pointed at the removed room — they'd dangle otherwise.
        .map(r => ({ ...r, exits: r.exits.filter(e => e.target !== id) }));
      const startRoomId =
        state.draft.startRoomId === id ? (rooms[0]?.id ?? null) : state.draft.startRoomId;
      return { draft: { ...state.draft, rooms, startRoomId } };
    }),

  setStartRoom: id => set(state => ({ draft: { ...state.draft, startRoomId: id } })),

  addExit: (roomId, exit) =>
    set(state => ({
      draft: {
        ...state.draft,
        rooms: state.draft.rooms.map(r =>
          r.id === roomId ? { ...r, exits: [...r.exits, exit] } : r,
        ),
      },
    })),

  updateExit: (roomId, index, patch) =>
    set(state => ({
      draft: {
        ...state.draft,
        rooms: state.draft.rooms.map(r =>
          r.id === roomId
            ? { ...r, exits: r.exits.map((e, i) => (i === index ? { ...e, ...patch } : e)) }
            : r,
        ),
      },
    })),

  removeExit: (roomId, index) =>
    set(state => ({
      draft: {
        ...state.draft,
        rooms: state.draft.rooms.map(r =>
          r.id === roomId ? { ...r, exits: r.exits.filter((_, i) => i !== index) } : r,
        ),
      },
    })),

  validateRooms: () => {
    const { rooms, startRoomId } = get().draft;
    const errors: string[] = [];
    const ids = new Set(rooms.map(r => r.id));
    if (rooms.length === 0) {
      errors.push('Add at least one room.');
    } else if (!startRoomId || !ids.has(startRoomId)) {
      errors.push('Choose a start room.');
    }
    for (const room of rooms) {
      if (!room.name.trim()) errors.push(`A room is missing a name.`);
      for (const exit of room.exits) {
        if (!exit.target || !ids.has(exit.target)) {
          errors.push(`"${room.name || room.id}" has an exit going nowhere.`);
        }
      }
    }
    return errors;
  },

  addNpc: () => {
    const id = nextNpcId(get().draft.npcs);
    set(state => {
      const n = state.draft.npcs.length + 1;
      const npc: DraftNpc = {
        id,
        name: `Person ${n}`,
        greeting: '',
        // Default placement to the start room if there is one — most NPCs live somewhere.
        roomId: state.draft.startRoomId ?? state.draft.rooms[0]?.id ?? null,
        dialogue: [],
      };
      return { draft: { ...state.draft, npcs: [...state.draft.npcs, npc] } };
    });
    return id;
  },

  updateNpc: (id, patch) =>
    set(state => ({
      draft: {
        ...state.draft,
        npcs: state.draft.npcs.map(n => (n.id === id ? { ...n, ...patch } : n)),
      },
    })),

  removeNpc: id =>
    set(state => ({
      draft: { ...state.draft, npcs: state.draft.npcs.filter(n => n.id !== id) },
    })),

  addDialogue: (npcId, line) =>
    set(state => ({
      draft: {
        ...state.draft,
        npcs: state.draft.npcs.map(n =>
          n.id === npcId ? { ...n, dialogue: [...n.dialogue, line] } : n,
        ),
      },
    })),

  updateDialogue: (npcId, index, patch) =>
    set(state => ({
      draft: {
        ...state.draft,
        npcs: state.draft.npcs.map(n =>
          n.id === npcId
            ? { ...n, dialogue: n.dialogue.map((d, i) => (i === index ? { ...d, ...patch } : d)) }
            : n,
        ),
      },
    })),

  removeDialogue: (npcId, index) =>
    set(state => ({
      draft: {
        ...state.draft,
        npcs: state.draft.npcs.map(n =>
          n.id === npcId ? { ...n, dialogue: n.dialogue.filter((_, i) => i !== index) } : n,
        ),
      },
    })),

  validateNpcs: () => {
    const { npcs, rooms } = get().draft;
    const errors: string[] = [];
    const roomIds = new Set(rooms.map(r => r.id));
    for (const npc of npcs) {
      const who = npc.name || npc.id;
      if (!npc.name.trim()) errors.push('An NPC is missing a name.');
      if (!npc.greeting.trim()) errors.push(`"${who}" has no greeting.`);
      if (npc.roomId && !roomIds.has(npc.roomId)) {
        errors.push(`"${who}" is placed in a room that no longer exists.`);
      }
      for (const d of npc.dialogue) {
        if (!d.keyword.trim() || !d.response.trim()) {
          errors.push(`"${who}" has an incomplete topic.`);
        }
      }
    }
    return errors;
  },

  addItem: () => {
    const id = nextSeqId(get().draft.items, 'item');
    set(state => {
      const n = state.draft.items.length + 1;
      const item: DraftItem = {
        id,
        name: `Item ${n}`,
        description: '',
        kind: 'plain',
        equipStat: 'attack',
        equipBonus: 1,
        healAmount: 10,
        tags: [],
      };
      return { draft: { ...state.draft, items: [...state.draft.items, item] } };
    });
    return id;
  },

  updateItem: (id, patch) =>
    set(state => ({
      draft: {
        ...state.draft,
        items: state.draft.items.map(it => (it.id === id ? { ...it, ...patch } : it)),
      },
    })),

  removeItem: id =>
    set(state => ({
      draft: {
        ...state.draft,
        items: state.draft.items.filter(it => it.id !== id),
        // Scrub the deleted item from anything that referenced it, so no class
        // points at gear/loot that no longer exists.
        classes: state.draft.classes.map(c => ({
          ...c,
          startingEquipment: c.startingEquipment.filter(eq => eq !== id),
          loot: c.loot.filter(l => l.itemId !== id),
        })),
      },
    })),

  addClass: role => {
    const id = nextSeqId(get().draft.classes, 'class');
    set(state => {
      // Number the default name within its role, so the first enemy is "Enemy 1"
      // even when playable classes already exist (ids stay globally unique).
      const n = state.draft.classes.filter(c => c.role === role).length + 1;
      const cls: DraftClass = {
        id,
        name: role === 'enemy' ? `Enemy ${n}` : `Class ${n}`,
        description: '',
        role,
        hp: role === 'enemy' ? 20 : 100,
        attack: 10,
        defense: 5,
        startingEquipment: [],
        xpReward: 10,
        goldReward: 0,
        loot: [],
      };
      return { draft: { ...state.draft, classes: [...state.draft.classes, cls] } };
    });
    return id;
  },

  updateClass: (id, patch) =>
    set(state => ({
      draft: {
        ...state.draft,
        classes: state.draft.classes.map(c => (c.id === id ? { ...c, ...patch } : c)),
      },
    })),

  removeClass: id =>
    set(state => ({
      draft: { ...state.draft, classes: state.draft.classes.filter(c => c.id !== id) },
    })),

  toggleStartingEquipment: (classId, itemId) =>
    set(state => ({
      draft: {
        ...state.draft,
        classes: state.draft.classes.map(c =>
          c.id === classId
            ? {
                ...c,
                startingEquipment: c.startingEquipment.includes(itemId)
                  ? c.startingEquipment.filter(eq => eq !== itemId)
                  : [...c.startingEquipment, itemId],
              }
            : c,
        ),
      },
    })),

  addLoot: (classId, loot) =>
    set(state => ({
      draft: {
        ...state.draft,
        classes: state.draft.classes.map(c =>
          c.id === classId ? { ...c, loot: [...c.loot, loot] } : c,
        ),
      },
    })),

  updateLoot: (classId, index, patch) =>
    set(state => ({
      draft: {
        ...state.draft,
        classes: state.draft.classes.map(c =>
          c.id === classId
            ? { ...c, loot: c.loot.map((l, i) => (i === index ? { ...l, ...patch } : l)) }
            : c,
        ),
      },
    })),

  removeLoot: (classId, index) =>
    set(state => ({
      draft: {
        ...state.draft,
        classes: state.draft.classes.map(c =>
          c.id === classId ? { ...c, loot: c.loot.filter((_, i) => i !== index) } : c,
        ),
      },
    })),

  validateContent: () => {
    const { items, classes } = get().draft;
    const errors: string[] = [];
    const itemIds = new Set(items.map(i => i.id));

    for (const item of items) {
      const who = item.name || item.id;
      if (!item.name.trim()) errors.push('An item is missing a name.');
      if (item.kind === 'equipment' && !item.equipStat.trim()) {
        errors.push(`"${who}" is equipment but boosts no stat.`);
      }
      if (item.kind === 'consumable' && item.healAmount <= 0) {
        errors.push(`"${who}" is a consumable that heals nothing.`);
      }
    }

    for (const cls of classes) {
      const who = cls.name || cls.id;
      if (!cls.name.trim()) errors.push('A class is missing a name.');
      if (cls.hp <= 0) errors.push(`"${who}" needs at least 1 HP.`);
      for (const eq of cls.startingEquipment) {
        if (!itemIds.has(eq)) errors.push(`"${who}" starts with an item that no longer exists.`);
      }
      for (const l of cls.loot) {
        if (!l.itemId || !itemIds.has(l.itemId)) {
          errors.push(`"${who}" drops an item that no longer exists.`);
        }
        if (l.chance < 0 || l.chance > 1) {
          errors.push(`"${who}" has a drop chance outside 0–100%.`);
        }
      }
    }
    return errors;
  },

  loadDraft: (draft: BuildDraft) => set({ draft }),

  isDraftEmpty: () => {
    const d = get().draft;
    return (
      d.rooms.length === 0 &&
      d.npcs.length === 0 &&
      d.items.length === 0 &&
      d.classes.length === 0 &&
      d.quests.length === 0 &&
      d.layers.length === 0
    );
  },

  addQuest: () => {
    const id = nextSeqId(get().draft.quests, 'quest');
    set(state => {
      const n = state.draft.quests.length + 1;
      const quest: DraftQuest = {
        id,
        name: `Quest ${n}`,
        description: '',
        // Default the giver to the first NPC if there is one — a quest needs a giver.
        giverNpcId: state.draft.npcs[0]?.id ?? null,
        objectiveType: 'kill_count',
        targetId: '',
        killCount: 1,
        goldReward: 0,
        xpReward: 10,
        hopeReward: 0,
        acceptText: '',
        completeText: '',
        prereqQuestIds: [],
      };
      return { draft: { ...state.draft, quests: [...state.draft.quests, quest] } };
    });
    return id;
  },

  updateQuest: (id, patch) =>
    set(state => ({
      draft: {
        ...state.draft,
        quests: state.draft.quests.map(q => {
          if (q.id !== id) return q;
          const next = { ...q, ...patch };
          // Switching objective type clears the old target — an enemy id is
          // meaningless once the objective is "reach a room".
          if (patch.objectiveType && patch.objectiveType !== q.objectiveType) {
            next.targetId = '';
          }
          return next;
        }),
      },
    })),

  removeQuest: id =>
    set(state => ({
      draft: {
        ...state.draft,
        quests: state.draft.quests
          .filter(q => q.id !== id)
          // Scrub the deleted quest from any prerequisite list so none dangles.
          .map(q => ({ ...q, prereqQuestIds: q.prereqQuestIds.filter(p => p !== id) })),
      },
    })),

  toggleQuestPrereq: (questId, prereqId) =>
    set(state => ({
      draft: {
        ...state.draft,
        quests: state.draft.quests.map(q =>
          q.id === questId
            ? {
                ...q,
                prereqQuestIds: q.prereqQuestIds.includes(prereqId)
                  ? q.prereqQuestIds.filter(p => p !== prereqId)
                  : [...q.prereqQuestIds, prereqId],
              }
            : q,
        ),
      },
    })),

  validateQuests: () => {
    const { quests, npcs, rooms, classes } = get().draft;
    const errors: string[] = [];
    const npcIds = new Set(npcs.map(n => n.id));
    const roomIds = new Set(rooms.map(r => r.id));
    const enemyIds = new Set(classes.filter(c => c.role === 'enemy').map(c => c.id));
    const questIds = new Set(quests.map(q => q.id));

    for (const quest of quests) {
      const who = quest.name || quest.id;
      if (!quest.name.trim()) errors.push('A quest is missing a name.');
      if (!quest.giverNpcId || !npcIds.has(quest.giverNpcId)) {
        errors.push(`"${who}" has no NPC to give it out.`);
      }
      // The objective must point at something real, of the matching kind.
      if (!quest.targetId) {
        errors.push(`"${who}" has no objective target.`);
      } else if (quest.objectiveType === 'kill_count' && !enemyIds.has(quest.targetId)) {
        errors.push(`"${who}" targets an enemy that no longer exists.`);
      } else if (quest.objectiveType === 'reach_room' && !roomIds.has(quest.targetId)) {
        errors.push(`"${who}" targets a room that no longer exists.`);
      } else if (quest.objectiveType === 'talk_to' && !npcIds.has(quest.targetId)) {
        errors.push(`"${who}" targets an NPC that no longer exists.`);
      }
      if (quest.objectiveType === 'kill_count' && quest.killCount < 1) {
        errors.push(`"${who}" needs to kill at least 1.`);
      }
      for (const p of quest.prereqQuestIds) {
        if (!questIds.has(p)) errors.push(`"${who}" requires a quest that no longer exists.`);
      }
    }
    return errors;
  },
}));

// Re-export the catalogue so components import from one place.
export { KNOWN_LAYERS, GENRE_PRESETS };
