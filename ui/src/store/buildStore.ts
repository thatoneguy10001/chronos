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

export interface BuildDraft {
  /** Active layer ids, always in canonical order. */
  layers: string[];
}

interface BuildStore {
  draft: BuildDraft;
  /** Toggle a layer on/off, cascading dependencies both ways. */
  toggleLayer: (id: string) => void;
  /** Replace the stack with a genre preset. */
  applyPreset: (presetId: string) => void;
  /** Clear the stack. */
  clearLayers: () => void;
  /** Dependency-validate the current stack; empty array means valid. */
  validate: () => string[];
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
  draft: { layers: [] },

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
}));

// Re-export the catalogue so components import from one place.
export { KNOWN_LAYERS, GENRE_PRESETS };
