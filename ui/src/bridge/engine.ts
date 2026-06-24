/**
 * Engine bridge router.
 *
 * VITE_USE_WS_SERVER=true  →  WebSocket bridge (chronos-server, fast Rust iteration)
 * (default)                →  WASM bridge (bundled, production path)
 *
 * Both bridges expose the same async interface so the store is bridge-agnostic.
 * Both modules are imported but Vite tree-shakes the cold path at build time
 * because USE_WS is a compile-time env var constant.
 */

import * as wasm from './engine-wasm';
import * as ws   from './engine-ws';

export type { WorldMeta, ClassMeta, AbilityMeta } from './engine-wasm';
export type { ExtendedResult } from './engine-wasm';
export type { ItemMeta } from './item-meta';

const b = import.meta.env.VITE_USE_WS_SERVER === 'true'
  ? ws as unknown as typeof wasm
  : wasm;

export const listWorlds          = ()                  => b.listWorlds();
export const getCurrentWorld     = ()                  => b.getCurrentWorld();
export const listPlayableClasses = (worldId: string)   => b.listPlayableClasses(worldId);
export const getItemName         = (itemId: string)    => b.getItemName(itemId);
export const getItemDescription  = (itemId: string)    => b.getItemDescription(itemId);
export const getItemMeta         = (itemId: string)    => b.getItemMeta(itemId);
export const getAllItems         = ()                  => b.getAllItems();
export const initEngine          = (worldId: string)   => b.initEngine(worldId);
export const processCommand      = (raw: string)       => b.processCommand(raw);
export const rewindToTick        = (tick: number)      => b.rewindToTick(tick);
export const getSnapshot         = ()                  => b.getSnapshot();
export const loadFromSnapshot    = (json: string)      => b.loadFromSnapshot(json);
export const getCurrentTick      = ()                  => b.getCurrentTick();
export const getMaxTick          = ()                  => b.getMaxTick();
export const peekRoomActions     = ()                  => b.peekRoomActions();
