import type { CommandResult, ContextAction, GameStateDTO } from '@/types/contracts';

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

// All world data — eagerly bundled at build time across every world directory.
const allRoomModules    = import.meta.glob('../../../worlds/*/rooms/*.json',    { as: 'raw', eager: true });
const allItemModules    = import.meta.glob('../../../worlds/*/items/*.json',    { as: 'raw', eager: true });
const allClassModules   = import.meta.glob('../../../worlds/*/classes/*.json',  { as: 'raw', eager: true });
const allNpcModules     = import.meta.glob('../../../worlds/*/npcs/*.json',     { as: 'raw', eager: true });
const allQuestModules   = import.meta.glob('../../../worlds/*/quests/*.json',   { as: 'raw', eager: true });
const allManifestModules = import.meta.glob('../../../worlds/*/manifest.json',  { as: 'raw', eager: true });
const allWorldMetaModules = import.meta.glob('../../../worlds/*/world.json',   { as: 'raw', eager: true });

function filterByWorld(modules: Record<string, unknown>, worldId: string) {
  return Object.entries(modules)
    .filter(([path]) => path.includes(`/worlds/${worldId}/`))
    .map(([path, content]) => ({
      filename: path.split('/').pop() ?? path,
      content: content as string,
    }));
}

/** Returns metadata for all available worlds, sorted by id. */
export async function listWorlds(): Promise<WorldMeta[]> {
  return Object.entries(allWorldMetaModules)
    .map(([, content]) => JSON.parse(content as string) as WorldMeta)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Returns the metadata for the currently loaded world, or null if not yet initialized. */
export function getCurrentWorld(): WorldMeta | null {
  return currentWorldMeta;
}

/** Returns playable (non-enemy) classes for a world, sorted by name. */
export async function listPlayableClasses(worldId: string): Promise<ClassMeta[]> {
  return filterByWorld(allClassModules, worldId)
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

  const rooms    = filterByWorld(allRoomModules,    worldId);
  const items    = filterByWorld(allItemModules,    worldId);
  const classes  = filterByWorld(allClassModules,   worldId);
  const npcs     = filterByWorld(allNpcModules,     worldId);
  const quests   = filterByWorld(allQuestModules,   worldId);

  const manifestEntry = Object.entries(allManifestModules)
    .find(([path]) => path.includes(`/worlds/${worldId}/`));
  const manifest = manifestEntry ? (manifestEntry[1] as string) : undefined;

  const metaEntry = Object.entries(allWorldMetaModules)
    .find(([path]) => path.includes(`/worlds/${worldId}/`));
  currentWorldMeta = metaEntry ? JSON.parse(metaEntry[1] as string) as WorldMeta : null;

  currentItemNames = Object.fromEntries(
    items.map(({ content }) => {
      const item = JSON.parse(content) as { id: string; name: string };
      return [item.id, item.name];
    })
  );

  const payload = JSON.stringify({ rooms, items, classes, npcs, quests, manifest });
  engineInstance = new wasmModule.WasmEngine(payload);
  return { worldMeta: currentWorldMeta };
}

export function getItemName(itemId: string): string {
  return currentItemNames[itemId] ?? itemId;
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
