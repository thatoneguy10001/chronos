import { create } from 'zustand';
import type { CharacterStateDTO, ContextAction, EnemyStateDTO, InputMode } from '@/types/contracts';

const MAX_LINES = 500;
const addLines = (existing: TerminalLine[], ...add: TerminalLine[]): TerminalLine[] =>
  [...existing, ...add].slice(-MAX_LINES);

export type ActiveScreen = 'explore' | 'combat' | 'inventory' | 'character';
import * as engine from '@/bridge/engine';
import type { SerializedWorld } from '@/build/serialize';
import {
  DIR_VECTORS,
  extractDirection,
  isMovementCmd,
  classifyLine,
  extractSpeaker,
} from './storeUtils';

// ── Map types ────────────────────────────────────────────────────────────────

export interface MapNode {
  id: string;
  name: string;
  x: number;
  y: number;
}

export interface MapEdge {
  from: string;
  to: string;
  dir: string;
}

export interface NpcSection {
  kind: 'action' | 'speech';
  text: string;
}

export interface TerminalLine {
  id: number;
  type: 'input' | 'output' | 'error' | 'system' | 'npc' | 'combat' | 'movement';
  text: string;
  tick?: number;
  speaker?: string;
  label?: string;
  npcSections?: NpcSection[];
}

export interface SaveSlot {
  version: 1;
  worldId: string;
  worldTitle: string;
  characterName: string;
  classId: string;
  roomId: string;
  roomName?: string;  // display name; absent in pre-migration saves
  tick: number;
  savedAt: string;  // ISO
  snapshot: string; // engine JSON
}

const SLOT_KEY = (worldId: string, n: number) => `chronos_slot_${worldId}_${n}`;
export const NUM_SLOTS = 3;

// One-time migration: move old global-keyed saves to per-world keys.
function migrateGlobalSlots(): void {
  for (let i = 0; i < NUM_SLOTS; i++) {
    const oldKey = `chronos_slot_${i}`;
    const raw = localStorage.getItem(oldKey);
    if (!raw) continue;
    try {
      const slot = JSON.parse(raw) as SaveSlot;
      const newKey = SLOT_KEY(slot.worldId, i);
      if (!localStorage.getItem(newKey)) localStorage.setItem(newKey, raw);
    } catch { /* ignore corrupt saves */ }
    localStorage.removeItem(oldKey);
  }
}
migrateGlobalSlots();

function readSaveSlot(worldId: string, n: number): SaveSlot | null {
  try {
    const raw = localStorage.getItem(SLOT_KEY(worldId, n));
    if (!raw) return null;
    const slot = JSON.parse(raw) as SaveSlot;
    if (!slot.snapshot) return null;
    JSON.parse(slot.snapshot); // validate snapshot is itself parseable before we accept the slot
    return slot;
  } catch { return null; }
}

function writeSaveSlot(worldId: string, n: number, slot: SaveSlot): void {
  try {
    localStorage.setItem(SLOT_KEY(worldId, n), JSON.stringify(slot));
  } catch { /* localStorage unavailable (private browsing, quota exceeded) */ }
}

export function readWorldSlots(worldId: string): (SaveSlot | null)[] {
  return Array.from({ length: NUM_SLOTS }, (_, i) => readSaveSlot(worldId, i));
}

interface GameStore {
  // Engine state
  initialized: boolean;
  currentTick: number;
  maxTick: number;

  // World
  worldId: string;
  worldTitle: string;
  currencyName: string;
  currencySymbol: string;
  secondaryCurrencyName: string;
  secondaryCurrencySymbol: string;
  gameTime: number;

  // Character state
  playerCharacter: CharacterStateDTO | null;
  currentRoomId: string;
  currentRoomName: string;
  enemies: EnemyStateDTO[];

  // UI state
  inputMode: InputMode;
  contextActions: ContextAction[];
  roomActions: ContextAction[];
  inventoryIds: string[];

  // Terminal history
  lines: TerminalLine[];
  nextLineId: number;

  // Fog-of-war map
  mapNodes: Record<string, MapNode>;
  mapEdges: MapEdge[];
  mapCurrentX: number;
  mapCurrentY: number;

  // Time-travel
  isRewound: boolean;

  // Death
  isGameOver: boolean;
  deathCause: string;

  // Screen navigation
  activeScreen: ActiveScreen;

  // Save slots
  saves: (SaveSlot | null)[];
  saveModalMode: 'save' | 'load' | null;

  // Journal
  journalOpen: boolean;

  // Actions
  init: (worldId: string, loadSlot?: number) => Promise<void>;
  /** Boot a Build Mode draft world (Test Play) straight from its serialized form. */
  initDraft: (world: SerializedWorld) => Promise<void>;
  submitCommand: (raw: string) => void;
  rewindToTick: (tick: number) => void;
  resumeFromRewind: () => void;
  setInputMode: (mode: InputMode) => void;
  openSaveModal: () => void;
  openLoadModal: () => void;
  closeSaveModal: () => void;
  saveToSlot: (slot: number) => void;
  loadFromSlot: (slot: number) => void;
  openJournal: () => void;
  closeJournal: () => void;
  setScreen: (screen: ActiveScreen) => void;
}

let lineCounter = 0;
const mkLine = (type: TerminalLine['type'], text: string, tick?: number, label?: string): TerminalLine => ({
  id: lineCounter++,
  type,
  text,
  tick,
  label,
});

// Commands are processed one at a time. Each submitCommand call is chained
// onto this promise so rapid input never causes out-of-order store updates.
let commandQueue: Promise<void> = Promise.resolve();

/**
 * Shared boot path for both `init` (bundled world by id) and `initDraft` (a Build
 * Mode draft). The only thing that differs upstream is *how* the engine got
 * constructed and where save slots come from; everything past that — world chrome,
 * optional save-slot restore, the opening `look` — is identical, so it lives here
 * once. `set` is passed in from the store closure.
 */
async function bootIntoPlay(
  set: (partial: Partial<GameStore>) => void,
  args: { worldId: string; worldMeta: engine.WorldMeta | null; loadSlot?: number; saves: (SaveSlot | null)[] },
) {
  const { worldId, worldMeta, loadSlot, saves } = args;
  lineCounter = 0;
  commandQueue = Promise.resolve();
  const worldBase = {
    worldId,
    worldTitle: worldMeta?.title ?? '',
    currencyName: worldMeta?.currency ?? 'gold',
    currencySymbol: worldMeta?.currency_symbol ?? '⬡',
    secondaryCurrencyName: worldMeta?.secondary_currency ?? '',
    secondaryCurrencySymbol: worldMeta?.secondary_currency_symbol ?? '',
  };

  if (loadSlot !== undefined) {
    const saved = readSaveSlot(worldId, loadSlot);
    if (saved) {
      const result = await engine.loadFromSnapshot(saved.snapshot);
      const snap   = await engine.getSnapshot();
      const startRoomId   = snap.player_room_id;
      const startRoomName = snap.current_room_name ?? '';
      set({
        ...worldBase,
        initialized: true,
        saves,
        currentTick:    result.tick,
        maxTick:        result.max_tick,
        gameTime:       result.game_time ?? 360,
        playerCharacter: snap.player_character,
        currentRoomId:   startRoomId,
        currentRoomName: startRoomName,
        enemies:         snap.enemies,
        contextActions:  result.context_actions,
        roomActions:     result.room_actions,
        inventoryIds:    result.inventory_ids,
        mapNodes: startRoomId ? { [startRoomId]: { id: startRoomId, name: startRoomName, x: 0, y: 0 } } : {},
        mapEdges: [],
        mapCurrentX: 0,
        mapCurrentY: 0,
        isRewound:       false,
        isGameOver:      false,
        deathCause:      '',
        lines: [
          mkLine('system', `=== ${worldMeta?.title?.toUpperCase() ?? 'PROJECT CHRONOS'} ===`),
          mkLine('system', 'Save loaded.'),
          mkLine('output', result.narrative, result.tick, startRoomName),
        ],
      });
      return;
    }
  }

  const result = await engine.processCommand('look');
  const snap   = await engine.getSnapshot();
  const startRoomId = snap.player_room_id;
  const startRoomName = snap.current_room_name ?? '';
  set({
    ...worldBase,
    initialized: true,
    saves,
    currentTick: result.tick,
    maxTick: result.max_tick,
    gameTime: result.game_time ?? 360,
    playerCharacter:  snap.player_character,
    currentRoomId:    startRoomId,
    currentRoomName:  startRoomName,
    enemies:          snap.enemies,
    contextActions:   result.context_actions,
    roomActions:      result.room_actions,
    inventoryIds:     result.inventory_ids,
    mapNodes: startRoomId ? { [startRoomId]: { id: startRoomId, name: startRoomName, x: 0, y: 0 } } : {},
    mapEdges: [],
    mapCurrentX: 0,
    mapCurrentY: 0,
    isRewound: false,
    isGameOver: false,
    deathCause: '',
    lines: [
      mkLine('system', `=== ${worldMeta?.title?.toUpperCase() ?? 'PROJECT CHRONOS'} ===`),
      mkLine('system', "Type 'help' for commands. Type 'save' to save, 'load' to load."),
      mkLine('output', result.narrative, result.tick, startRoomName),
    ],
  });
}

export const useGameStore = create<GameStore>((set, get) => ({
  initialized: false,
  currentTick: 0,
  maxTick: 0,
  worldId: '',
  worldTitle: '',
  currencyName: 'gold',
  currencySymbol: '⬡',
  secondaryCurrencyName: '',
  secondaryCurrencySymbol: '',
  gameTime: 360,
  playerCharacter: null,
  currentRoomId: '',
  currentRoomName: '',
  enemies: [],
  inputMode: 'PARSER',
  contextActions: [],
  roomActions: [],
  inventoryIds: [],
  lines: [],
  nextLineId: 0,
  mapNodes: {},
  mapEdges: [],
  mapCurrentX: 0,
  mapCurrentY: 0,
  isRewound: false,
  isGameOver: false,
  deathCause: '',
  activeScreen: 'explore' as ActiveScreen,
  saves: [],
  saveModalMode: null,
  journalOpen: false,

  init: async (worldId: string, loadSlot?: number) => {
    const { worldMeta } = await engine.initEngine(worldId);
    await bootIntoPlay(set, { worldId, worldMeta, loadSlot, saves: readWorldSlots(worldId) });
  },

  initDraft: async (world: SerializedWorld) => {
    const { worldMeta } = await engine.initEngineFromWorld(world);
    // Draft worlds aren't persisted, so there are no save slots to read.
    await bootIntoPlay(set, { worldId: world.meta.id, worldMeta, saves: [] });
  },

  submitCommand: (raw: string) => {
    const cmd = raw.trim().toLowerCase();

    if (cmd === 'save') {
      set(state => ({
        saveModalMode: 'save',
        lines: addLines(state.lines, mkLine('input', '> save')),
      }));
      return;
    }
    if (cmd === 'load') {
      set(state => ({
        saveModalMode: 'load',
        lines: addLines(state.lines, mkLine('input', '> load')),
      }));
      return;
    }

    if (cmd === 'journal' || cmd === 'j') {
      set(state => ({
        journalOpen: true,
        lines: addLines(state.lines, mkLine('input', '> journal')),
      }));
      return;
    }

    if (get().isRewound) set({ isRewound: false });

    commandQueue = commandQueue.then(async () => {
      const oldRoomId  = get().currentRoomId;
      const oldX       = get().mapCurrentX;
      const oldY       = get().mapCurrentY;
      const curScreen  = get().activeScreen;

      const result = await engine.processCommand(raw);
      const snap   = await engine.getSnapshot();
      const narrative = result.success || !result.narrative
        ? result.narrative
        : `⚠ ${result.narrative}`;

      // Declare room info before using in lineLabel
      const newRoomId   = snap.player_room_id;
      const newRoomName = snap.current_room_name ?? '';

      const lineType = classifyLine(cmd, result.success);
      const lineLabel = lineType === 'movement' ? newRoomName
        : lineType === 'combat' ? 'Combat'
        : undefined;
      const responseLine: TerminalLine = lineType === 'npc'
        ? { id: lineCounter++, type: 'npc', text: narrative, tick: result.tick, speaker: extractSpeaker(narrative), npcSections: result.npc_sections?.length ? result.npc_sections as NpcSection[] : undefined }
        : mkLine(lineType, narrative, result.tick, lineLabel);

      // Map tracking: update position and record visited room
      const mapNodes = { ...get().mapNodes };
      const mapEdges = [...get().mapEdges];
      let newX = oldX, newY = oldY;

      if (result.success && isMovementCmd(cmd) && newRoomId !== oldRoomId) {
        const dir = extractDirection(cmd)!;
        const [dx, dy] = DIR_VECTORS[dir] ?? [0, 0];
        newX = oldX + dx;
        newY = oldY + dy;
        if (!mapEdges.some(e => e.from === oldRoomId && e.dir === dir)) {
          mapEdges.push({ from: oldRoomId, to: newRoomId, dir });
        }
      }
      if (newRoomId && !mapNodes[newRoomId]) {
        mapNodes[newRoomId] = { id: newRoomId, name: newRoomName, x: newX, y: newY };
      }

      const isInternalCmd = cmd.startsWith('become ');

      // Auto-switch between explore and combat based on live enemies in the new room.
      const visibleEnemies = snap.enemies.filter(
        (e: EnemyStateDTO) => e.hp > 0 && e.room_id === newRoomId
      );
      const nextScreen: ActiveScreen =
        visibleEnemies.length > 0 && (curScreen === 'explore' || curScreen === 'combat')
          ? 'combat'
          : visibleEnemies.length === 0 && curScreen === 'combat'
          ? 'explore'
          : curScreen;

      set(state => ({
        lines: addLines(state.lines, ...(isInternalCmd ? [] : [mkLine('input', `> ${raw}`)]), responseLine),
        currentTick:     result.tick,
        maxTick:         result.max_tick,
        gameTime:        result.game_time ?? 360,
        playerCharacter: snap.player_character,
        currentRoomId:   newRoomId,
        currentRoomName: newRoomName,
        enemies:         snap.enemies,
        contextActions:  result.context_actions,
        roomActions:     result.room_actions,
        inventoryIds:    result.inventory_ids,
        mapNodes,
        mapEdges,
        mapCurrentX:     newX,
        mapCurrentY:     newY,
        isGameOver:      result.game_over ?? false,
        deathCause:      result.game_over ? narrative : state.deathCause,
        activeScreen:    nextScreen,
      }));
    }).catch(() => { /* engine errors are surfaced in the narrative; don't propagate */ });
  },

  rewindToTick: (tick: number) => {
    const safeTick = Math.max(0, Math.min(tick, get().maxTick));
    commandQueue = commandQueue.then(async () => {
      const result = await engine.rewindToTick(safeTick);
      const snap   = await engine.getSnapshot();
      set(state => ({
        lines: addLines(
          state.lines,
          mkLine('system', `⏪ Rewound to tick ${safeTick}`),
          mkLine('output', result.narrative, safeTick),
        ),
        currentTick:     safeTick,
        maxTick:         result.max_tick,
        gameTime:        result.game_time ?? 360,
        playerCharacter: snap.player_character,
        currentRoomId:   snap.player_room_id,
        currentRoomName: snap.current_room_name ?? '',
        enemies:         snap.enemies,
        contextActions:  result.context_actions,
        roomActions:     result.room_actions,
        inventoryIds:    result.inventory_ids,
        isRewound:       safeTick < result.max_tick,
        activeScreen:    'explore' as ActiveScreen,
      }));
    }).catch(() => {});
  },

  resumeFromRewind: () => {
    commandQueue = commandQueue.then(async () => {
      const max    = await engine.getMaxTick();
      const result = await engine.rewindToTick(max);
      const snap   = await engine.getSnapshot();
      set(state => ({
        lines: addLines(state.lines, mkLine('system', '▶ Resumed at latest tick')),
        currentTick:     max,
        maxTick:         result.max_tick,
        gameTime:        result.game_time ?? 360,
        playerCharacter: snap.player_character,
        currentRoomId:   snap.player_room_id,
        currentRoomName: snap.current_room_name ?? '',
        enemies:         snap.enemies,
        contextActions:  result.context_actions,
        roomActions:     result.room_actions,
        inventoryIds:    result.inventory_ids,
        isRewound:       false,
        activeScreen:    'explore' as ActiveScreen,
      }));
    }).catch(() => {});
  },

  setInputMode: (mode: InputMode) => set({ inputMode: mode }),
  setScreen: (screen: ActiveScreen) => set({ activeScreen: screen }),

  openSaveModal: () => set({ saveModalMode: 'save' }),
  openLoadModal: () => set({ saveModalMode: 'load' }),
  closeSaveModal: () => set({ saveModalMode: null }),
  openJournal:  () => set({ journalOpen: true }),
  closeJournal: () => set({ journalOpen: false }),

  saveToSlot: (slot: number) => {
    void (async () => {
      const { worldId, worldTitle, playerCharacter, currentRoomId, currentRoomName, currentTick } = get();
      const snap = await engine.getSnapshot();
      const entry: SaveSlot = {
        version: 1,
        worldId,
        worldTitle,
        characterName: playerCharacter?.name ?? 'Unknown',
        classId: playerCharacter?.class_id ?? '',
        roomId: currentRoomId,
        roomName: currentRoomName,
        tick: currentTick,
        savedAt: new Date().toISOString(),
        snapshot: JSON.stringify(snap),
      };
      writeSaveSlot(worldId, slot, entry);
      const saves = readWorldSlots(worldId);
      set(state => ({
        saves,
        saveModalMode: null,
        lines: addLines(state.lines, mkLine('system', `Game saved to slot ${slot + 1}.`)),
      }));
    })();
  },

  loadFromSlot: (slot: number) => {
    const saved = readSaveSlot(get().worldId, slot);
    if (!saved) return;
    void (async () => {
      try {
        const result = await engine.loadFromSnapshot(saved.snapshot);
        const snap   = await engine.getSnapshot();
        const loadedRoomId   = snap.player_room_id;
        const loadedRoomName = snap.current_room_name ?? '';
        set(state => ({
          saveModalMode: null,
          lines: addLines(
            state.lines,
            mkLine('system', `Loaded slot ${slot + 1} — ${saved.characterName}.`),
            mkLine('output', result.narrative, result.tick),
          ),
          currentTick:     result.tick,
          maxTick:         result.max_tick,
          gameTime:        snap.game_time ?? 360,
          playerCharacter: snap.player_character,
          currentRoomId:   loadedRoomId,
          currentRoomName: loadedRoomName,
          enemies:         snap.enemies,
          contextActions:  result.context_actions,
          roomActions:     result.room_actions,
          inventoryIds:    result.inventory_ids,
          mapNodes: loadedRoomId ? { [loadedRoomId]: { id: loadedRoomId, name: loadedRoomName, x: 0, y: 0 } } : {},
          mapEdges: [],
          mapCurrentX: 0,
          mapCurrentY: 0,
          isRewound:       false,
          activeScreen:    'explore' as ActiveScreen,
        }));
      } catch (e) {
        set(state => ({
          saveModalMode: null,
          lines: addLines(state.lines, mkLine('error', `Load failed: ${e}`)),
        }));
      }
    })();
  },
}));
