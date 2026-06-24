import type { CommandResult, ContextAction, GameStateDTO } from '@/types/contracts';
import { buildItemMeta } from '@/bridge/item-meta';
import type { ItemMeta } from '@/bridge/item-meta';

// Shape of one WASM engine instance (mirrors the wasm-bindgen-generated class).
interface WasmEngineInstance {
  process_command(raw: string): string;
  rewind_to_tick(tick: number): string;
  snapshot(): string;
  load_from_snapshot(snapshot_json: string): string;
  peek_room_actions(): string;
  readonly current_tick: number;
  readonly max_tick: number;
}

// The constructor exported by the generated module.
interface WasmEngineCtor {
  new (worldPayload: string): WasmEngineInstance;
}

export interface WorldMeta {
  id: string;
  title: string;
  tagline: string;
  description: string;
  tone: string;
  currency: string;
  currency_symbol: string;
  secondary_currency?: string;
  secondary_currency_symbol?: string;
}

export interface AbilityMeta {
  id: string;
  name: string;
  description: string;
}

export interface ClassMeta {
  id: string;
  name: string;
  description: string;
  base_stats: { hp: number; attack: number; defense: number; intelligence: number };
  abilities: AbilityMeta[];
}

let engineInstance: WasmEngineInstance | null = null;
let currentWorldMeta: WorldMeta | null = null;
let currentItemNames: Record<string, string> = {};
let currentItemDescriptions: Record<string, string> = {};
let currentItemMeta: Record<string, ItemMeta> = {};

// world.json metadata is loaded eagerly — it's tiny and needed immediately for
// the world-selection screen before any world is chosen.
const allWorldMetaModules = import.meta.glob<{ default: WorldMeta }>('../../../worlds/*/world.json', { eager: true });

// All other world content is lazy — only the selected world's files are fetched
// at initEngine() time, so players who never enter a world don't pay for its data.
type LazyMod = () => Promise<{ default: unknown }>;
const allRoomModules     = import.meta.glob<{ default: unknown }>('../../../worlds/*/rooms/*.json');
const allItemModules     = import.meta.glob<{ default: unknown }>('../../../worlds/*/items/*.json');
const allClassModules    = import.meta.glob<{ default: unknown }>('../../../worlds/*/classes/*.json');
const allNpcModules      = import.meta.glob<{ default: unknown }>('../../../worlds/*/npcs/*.json');
const allQuestModules    = import.meta.glob<{ default: unknown }>('../../../worlds/*/quests/*.json');
const allManifestModules = import.meta.glob<{ default: unknown }>('../../../worlds/*/manifest.json');

async function filterByWorld(modules: Record<string, LazyMod>, worldId: string) {
  const entries = Object.entries(modules).filter(([path]) => path.includes(`/worlds/${worldId}/`));
  return Promise.all(entries.map(async ([path, load]) => ({
    filename: path.split('/').pop() ?? path,
    content: JSON.stringify((await load()).default),
  })));
}

/** Returns metadata for all available worlds, sorted by id. */
export async function listWorlds(): Promise<WorldMeta[]> {
  return Object.entries(allWorldMetaModules)
    .map(([, module]) => module.default)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Returns the metadata for the currently loaded world, or null if not yet initialized. */
export function getCurrentWorld(): WorldMeta | null {
  return currentWorldMeta;
}

/** Returns playable (non-enemy) classes for a world, sorted by name. */
export async function listPlayableClasses(worldId: string): Promise<ClassMeta[]> {
  return (await filterByWorld(allClassModules, worldId))
    .map(({ content }) => JSON.parse(content) as Record<string, unknown>)
    .filter(c => !c.xp_reward && !c.gold_reward)
    .map(c => ({
      id: c.id as string,
      name: c.name as string,
      description: c.description as string,
      base_stats: c.base_stats as ClassMeta['base_stats'],
      abilities: (c.abilities as AbilityMeta[] | undefined) ?? [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

type WasmMod = { default?: (input?: URL | string | Request) => Promise<unknown>; WasmEngine: WasmEngineCtor };

/** Initialize the WASM engine for the given world ID. Safe to call multiple times. */
export async function initEngine(worldId: string): Promise<{ worldMeta: WorldMeta | null }> {
  let wasmModule: WasmMod;
  if (import.meta.env.DEV) {
    // The browser module cache persists across reloads even for locally-served files.
    // A unique ?t= suffix forces a fresh module instance so post-rebuild reloads pick
    // up the new WASM binary rather than the old singleton with wasm !== undefined.
    wasmModule = await import(/* @vite-ignore */ `/src/wasm/chronos_wasm.js?t=${Date.now()}`) as unknown as WasmMod;
    const wasmUrl = new URL('/src/wasm/chronos_wasm_bg.wasm', location.origin);
    wasmUrl.searchParams.set('t', String(Date.now()));
    await wasmModule.default?.(wasmUrl);
  } else {
    wasmModule = await import('../wasm/chronos_wasm.js') as unknown as WasmMod;
    await wasmModule.default?.();
  }

  const [rooms, items, classes, npcs, quests] = await Promise.all([
    filterByWorld(allRoomModules,  worldId),
    filterByWorld(allItemModules,  worldId),
    filterByWorld(allClassModules, worldId),
    filterByWorld(allNpcModules,   worldId),
    filterByWorld(allQuestModules, worldId),
  ]);

  const manifestEntries = Object.entries(allManifestModules)
    .filter(([path]) => path.includes(`/worlds/${worldId}/`));
  const manifestLoaded = manifestEntries.length > 0 ? (await manifestEntries[0][1]()).default : undefined;
  const manifest = manifestLoaded ? JSON.stringify(manifestLoaded) : undefined;

  const metaEntry = Object.entries(allWorldMetaModules)
    .find(([path]) => path.includes(`/worlds/${worldId}/`));
  currentWorldMeta = metaEntry ? (metaEntry[1].default as WorldMeta) : null;

  const parsedItems = items.map(({ content }) => JSON.parse(content) as { id: string; name: string; description: string; tags?: string[]; consumable?: boolean; attributes?: Record<string, unknown> });
  currentItemNames        = Object.fromEntries(parsedItems.map(i => [i.id, i.name]));
  currentItemDescriptions = Object.fromEntries(parsedItems.map(i => [i.id, i.description ?? '']));
  currentItemMeta         = Object.fromEntries(parsedItems.map(i => [i.id, buildItemMeta(i)]));

  const payload = JSON.stringify({ rooms, items, classes, npcs, quests, manifest });
  engineInstance = new wasmModule.WasmEngine(payload);
  return { worldMeta: currentWorldMeta };
}

export function getItemName(itemId: string): string {
  return currentItemNames[itemId] ?? itemId;
}

export function getItemDescription(itemId: string): string {
  return currentItemDescriptions[itemId] ?? '';
}

export function getItemMeta(itemId: string): ItemMeta {
  return currentItemMeta[itemId] ?? { tags: [], effectHint: '', canEquip: false, equipSlot: null, equipStat: null, equipBonus: null, canLoad: false, canUse: true, consumable: true };
}

export function getAllItems(): Array<{ id: string; name: string; meta: ItemMeta }> {
  return Object.entries(currentItemMeta).map(([id, meta]) => ({
    id,
    name: currentItemNames[id] ?? id,
    meta,
  }));
}

// Sync helpers used internally and by the router.
function getEngine(): WasmEngineInstance {
  if (!engineInstance) throw new Error('Engine not initialized — call initEngine(worldId) first');
  return engineInstance;
}

export type ExtendedResult = CommandResult & { room_actions: ContextAction[]; max_tick: number };

function withRoomActions(result: CommandResult): ExtendedResult {
  return {
    ...result,
    room_actions: JSON.parse(getEngine().peek_room_actions()) as ContextAction[],
    max_tick: getEngine().max_tick,
  };
}

// Async interface — matches engine-ws.ts exactly so engine.ts can re-export either.

export async function processCommand(raw: string): Promise<ExtendedResult> {
  return withRoomActions(JSON.parse(getEngine().process_command(raw)) as CommandResult);
}

export async function rewindToTick(tick: number): Promise<ExtendedResult> {
  return withRoomActions(JSON.parse(getEngine().rewind_to_tick(tick)) as CommandResult);
}

export async function getSnapshot(): Promise<GameStateDTO> {
  return JSON.parse(getEngine().snapshot()) as GameStateDTO;
}

export async function loadFromSnapshot(snapshotJson: string): Promise<ExtendedResult> {
  return withRoomActions(JSON.parse(getEngine().load_from_snapshot(snapshotJson)) as CommandResult);
}

export function getCurrentTick(): number {
  return getEngine().current_tick;
}

export function getMaxTick(): number {
  return getEngine().max_tick;
}

export function peekRoomActions(): ContextAction[] {
  return JSON.parse(getEngine().peek_room_actions()) as ContextAction[];
}
