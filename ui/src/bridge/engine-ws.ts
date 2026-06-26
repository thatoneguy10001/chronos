/**
 * WebSocket bridge — talks to chronos-server instead of WASM.
 * Used in dev when VITE_USE_WS_SERVER=true.
 *
 * Each call returns a Promise resolved when the server responds with
 * the matching seq number. Room actions are piggybacked on every result
 * so the store never needs a separate round-trip.
 */

import type { CommandResult, GameStateDTO } from '@/types/contracts';
import type { WorldMeta, ClassMeta, AbilityMeta } from './engine-wasm';
import { buildItemMeta } from '@/bridge/item-meta';
import type { ItemMeta } from '@/bridge/item-meta';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:3000/ws';
const API_URL = import.meta.env.VITE_WS_URL
  ? import.meta.env.VITE_WS_URL.replace('ws://', 'http://').replace('/ws', '')
  : 'http://localhost:3000';

// ── connection management ─────────────────────────────────────────────────────

let socket: WebSocket | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

// cached state kept in sync with last server response
let cachedRoomActions: import('@/types/contracts').ContextAction[] = [];
let cachedMaxTick = 0;
let currentWorldMeta: WorldMeta | null = null;
let currentItemNames: Record<string, string> = {};
let currentItemDescriptions: Record<string, string> = {};
let currentItemMeta: Record<string, ItemMeta> = {};
// Build Mode Test Play sends its world inline, so its playable classes can't be
// fetched from /api/worlds/:id/classes (nothing is on disk). initEngineFromWorld
// stashes them here, keyed by the draft's world id, so listPlayableClasses can
// serve character creation from memory — mirrors the WASM bridge.
let draftWorldId: string | null = null;
let draftPlayableClasses: ClassMeta[] = [];

function getSocket(): Promise<WebSocket> {
  if (socket && socket.readyState === WebSocket.OPEN) return Promise.resolve(socket);

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.onopen = () => { socket = ws; resolve(ws); };
    ws.onerror = () => reject(new Error(`Cannot connect to chronos-server at ${WS_URL}. Is it running?`));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string) as Record<string, unknown>;
      const s = msg['seq'] as number;
      const handler = pending.get(s);
      if (!handler) return;
      pending.delete(s);
      if (msg['type'] === 'error') {
        handler.reject(new Error(msg['message'] as string));
      } else {
        // Cache room_actions and max_tick from every result
        if (msg['room_actions']) cachedRoomActions = msg['room_actions'] as import('@/types/contracts').ContextAction[];
        if (msg['max_tick'] !== undefined) cachedMaxTick = msg['max_tick'] as number;
        handler.resolve(msg);
      }
    };
    ws.onclose = () => { socket = null; };
  });
}

async function send<T>(payload: Record<string, unknown>): Promise<T> {
  const ws = await getSocket();
  const s = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.set(s, { resolve: resolve as (v: unknown) => void, reject });
    ws.send(JSON.stringify({ seq: s, ...payload }));
  });
}

// ── public API ────────────────────────────────────────────────────────────────

export async function listWorlds(): Promise<WorldMeta[]> {
  const res = await fetch(`${API_URL}/api/worlds`);
  return res.json() as Promise<WorldMeta[]>;
}

export function getCurrentWorld(): WorldMeta | null {
  return currentWorldMeta;
}

export async function listPlayableClasses(worldId: string): Promise<ClassMeta[]> {
  // A draft world (Test Play) has nothing on disk — serve its classes from memory.
  if (worldId === draftWorldId) return draftPlayableClasses;
  const res = await fetch(`${API_URL}/api/worlds/${worldId}/classes`);
  return res.json() as Promise<ClassMeta[]>;
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

export async function initEngine(worldId: string): Promise<{ worldMeta: WorldMeta | null }> {
  const worlds = await listWorlds();
  currentWorldMeta = worlds.find(w => w.id === worldId) ?? null;

  // Load item metadata so getItemName/getItemDescription/getItemMeta work without round-trips.
  const itemsRes = await fetch(`${API_URL}/api/worlds/${worldId}/items`);
  const itemList = await itemsRes.json() as { id: string; name: string; description: string; tags?: string[]; consumable?: boolean; attributes?: Record<string, unknown> }[];
  currentItemNames        = Object.fromEntries(itemList.map(i => [i.id, i.name]));
  currentItemDescriptions = Object.fromEntries(itemList.map(i => [i.id, i.description ?? '']));
  currentItemMeta         = Object.fromEntries(itemList.map(i => [i.id, buildItemMeta(i)]));

  await send({ type: 'init', world_id: worldId });
  return { worldMeta: currentWorldMeta };
}

/**
 * Initialize from an in-memory world (Build Mode Test Play) by shipping it to the
 * server's `init_inline` handler, instead of asking it to load files by id. The
 * payload is the same shape the WASM bridge uses, so a draft plays identically over
 * either bridge. Item metadata and playable classes are stashed locally (as in the
 * WASM bridge) so the item helpers and character creation work with nothing on disk.
 */
export async function initEngineFromWorld(world: {
  meta: WorldMeta;
  rooms: { filename: string; content: string }[];
  items: { filename: string; content: string }[];
  classes: { filename: string; content: string }[];
  npcs: { filename: string; content: string }[];
  quests: { filename: string; content: string }[];
  passives: { filename: string; content: string }[];
  manifest: string;
}): Promise<{ worldMeta: WorldMeta | null }> {
  currentWorldMeta = world.meta;

  const parsedItems = world.items.map(({ content }) => JSON.parse(content) as { id: string; name: string; description: string; tags?: string[]; consumable?: boolean; attributes?: Record<string, unknown> });
  currentItemNames        = Object.fromEntries(parsedItems.map(i => [i.id, i.name]));
  currentItemDescriptions = Object.fromEntries(parsedItems.map(i => [i.id, i.description ?? '']));
  currentItemMeta         = Object.fromEntries(parsedItems.map(i => [i.id, buildItemMeta(i)]));

  // Stash playable classes (those without enemy rewards), keyed by the draft id.
  draftWorldId = world.meta.id;
  draftPlayableClasses = world.classes
    .map(({ content }) => JSON.parse(content) as Record<string, unknown>)
    .filter(c => !c.xp_reward && !c.gold_reward)
    .map(c => ({
      id: c.id as string,
      name: c.name as string,
      description: c.description as string,
      base_stats: { ...(c.base_stats as Record<string, number>), intelligence: 0 } as ClassMeta['base_stats'],
      abilities: (c.abilities as AbilityMeta[] | undefined) ?? [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const { rooms, items, classes, npcs, quests, passives, manifest } = world;
  await send({ type: 'init_inline', world: { rooms, items, classes, npcs, quests, passives, manifest } });
  return { worldMeta: currentWorldMeta };
}

export async function processCommand(raw: string): Promise<CommandResult & { room_actions: import('@/types/contracts').ContextAction[]; max_tick: number }> {
  return send({ type: 'command', input: raw });
}

export async function rewindToTick(tick: number): Promise<CommandResult & { room_actions: import('@/types/contracts').ContextAction[]; max_tick: number }> {
  return send({ type: 'rewind', tick });
}

export async function getSnapshot(): Promise<GameStateDTO> {
  return send({ type: 'snapshot' });
}

export async function loadFromSnapshot(snapshotJson: string): Promise<CommandResult & { room_actions: import('@/types/contracts').ContextAction[]; max_tick: number }> {
  return send({ type: 'load_snapshot', snapshot_json: snapshotJson });
}

export function getCurrentTick(): number {
  // Tracked from last result
  return seq > 0 ? cachedMaxTick : 0;
}

export function getMaxTick(): number {
  return cachedMaxTick;
}

export function peekRoomActions(): import('@/types/contracts').ContextAction[] {
  return cachedRoomActions;
}
