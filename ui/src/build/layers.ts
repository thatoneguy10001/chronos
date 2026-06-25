/**
 * Build Mode mirror of the engine's layer catalogue.
 *
 * The canonical source of truth is Rust — `engine/chronos-core/src/layers/mod.rs`
 * (`KNOWN_LAYERS`). This is the UI's copy, used to render the genre picker and to
 * pre-validate a stack before the engine ever sees it. Keep the two in sync: if a
 * layer is added/removed there, mirror it here.
 *
 * A world's *layer stack* is the ordered list of these ids that lands in the
 * manifest's `layers[]`. The combination is the genre.
 */

export interface LayerSpec {
  id: string;
  label: string;
  description: string;
  /** Layer ids that must appear before this one in the stack. */
  requires: string[];
}

// Order here is the canonical pipeline order. The editor always emits active
// layers in this order, which guarantees the "dependencies come first" rule.
export const KNOWN_LAYERS: LayerSpec[] = [
  { id: 'space',       label: 'Space',        description: 'Rooms and the exits that connect them — the world you move through.', requires: [] },
  { id: 'entity',      label: 'Entities',     description: 'Stats and bodies — the things that exist and can be fought.',         requires: [] },
  { id: 'combat',      label: 'Combat',       description: 'Turn-based fighting against the things in your rooms.',               requires: ['space', 'entity'] },
  { id: 'effects',     label: 'Status Effects', description: 'Poison, stun, buffs — conditions applied to entities.',            requires: ['entity'] },
  { id: 'economy',     label: 'Economy',      description: 'Currency, shops, and buying things.',                                requires: ['entity'] },
  { id: 'progression', label: 'Progression',  description: 'XP, levels, and growing stronger.',                                  requires: ['entity'] },
  { id: 'dialogue',    label: 'Dialogue',     description: 'NPCs you can talk to, with topics and dispositions.',                requires: ['space'] },
  { id: 'quests',      label: 'Quests',       description: 'Objectives that chain into a story.',                                requires: [] },
  { id: 'time',        label: 'Time',         description: 'Day/night cycle and time-gated content.',                            requires: [] },
];

export const LAYER_ORDER: string[] = KNOWN_LAYERS.map(l => l.id);

export function layerSpec(id: string): LayerSpec | undefined {
  return KNOWN_LAYERS.find(l => l.id === id);
}

/** Sort an arbitrary set of layer ids into canonical pipeline order. */
export function inCanonicalOrder(ids: string[]): string[] {
  return [...new Set(ids)].sort((a, b) => LAYER_ORDER.indexOf(a) - LAYER_ORDER.indexOf(b));
}

export interface GenrePreset {
  id: string;
  label: string;
  blurb: string;
  layers: string[];
}

// Ready-made stacks so a builder can start from a genre instead of toggling
// nine switches. Each is a valid, dependency-complete stack.
export const GENRE_PRESETS: GenrePreset[] = [
  {
    id: 'text_adventure',
    label: 'Text Adventure',
    blurb: 'The full Iron & Blood recipe — explore, fight, talk, quest.',
    layers: ['space', 'entity', 'combat', 'effects', 'economy', 'progression', 'dialogue', 'quests', 'time'],
  },
  {
    id: 'dungeon_crawl',
    label: 'Dungeon Crawl',
    blurb: 'Fight and grow, light on story. Combat, effects, progression.',
    layers: ['space', 'entity', 'combat', 'effects', 'progression'],
  },
  {
    id: 'story_explorer',
    label: 'Story & Exploration',
    blurb: 'No combat — wander, talk, and follow a quest line.',
    layers: ['space', 'dialogue', 'quests'],
  },
];
