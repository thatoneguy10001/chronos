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
  draft: { layers: [], rooms: [], startRoomId: null },

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
}));

// Re-export the catalogue so components import from one place.
export { KNOWN_LAYERS, GENRE_PRESETS };
