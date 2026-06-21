import { create } from 'zustand';
import type { CharacterStateDTO, ContextAction, EnemyStateDTO, InputMode } from '@/types/contracts';
import * as engine from '@/bridge/engine';

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

const DIR_VECTORS: Record<string, [number, number]> = {
  north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0],
  up: [0, -2],    down: [0, 2],
  northeast: [1, -1], northwest: [-1, -1], southeast: [1, 1], southwest: [-1, 1],
  ne: [1, -1],    nw: [-1, -1], se: [1, 1],  sw: [-1, 1],
};

const DIRS = new Set(Object.keys(DIR_VECTORS));

function extractDirection(cmd: string): string | null {
  const parts = cmd.trim().toLowerCase().split(/\s+/);
  if (parts[0] === 'go' && DIRS.has(parts[1])) return parts[1];
  if (DIRS.has(parts[0])) return parts[0];
  return null;
}

function isMovementCmd(cmd: string): boolean {
  return extractDirection(cmd) !== null;
}

const NARRATIVE_VERBS = new Set([
  'look', 'examine', 'x', 'l', 'inventory', 'inv', 'i', 'wait', 'help', 'stats',
  'take', 'drop', 'use', 'equip', 'unload', 'accept', 'rest', 'become',
  'save', 'load', 'buy', 'sell', 'talk', 'ask', 'shop',
]);

function classifyLine(cmd: string, success: boolean): TerminalLine['type'] {
  if (!success) return 'error';
  if (isNpcCmd(cmd)) return 'npc';
  const verb = cmd.trim().toLowerCase().split(/\s+/)[0];
  if (DIRS.has(verb) || verb === 'go') return 'movement';
  if (verb === 'attack' || verb === 'fight') return 'combat';
  if (!NARRATIVE_VERBS.has(verb)) return 'combat'; // ability command
  return 'output';
}

export interface TerminalLine {
  id: number;
  type: 'input' | 'output' | 'error' | 'system' | 'npc' | 'combat' | 'movement';
  text: string;
  tick?: number;
  speaker?: string;
  label?: string;
}

export interface SaveSlot {
  version: 1;
  worldId: string;
  worldTitle: string;
  characterName: string;
  classId: string;
  roomId: string;
  tick: number;
  savedAt: string;  // ISO
  snapshot: string; // engine JSON
}

const SLOT_KEY = (n: number) => `chronos_slot_${n}`;
export const NUM_SLOTS = 3;

function readSaveSlot(n: number): SaveSlot | null {
  try {
    const raw = localStorage.getItem(SLOT_KEY(n));
    return raw ? (JSON.parse(raw) as SaveSlot) : null;
  } catch { return null; }
}

function writeSaveSlot(n: number, slot: SaveSlot): void {
  localStorage.setItem(SLOT_KEY(n), JSON.stringify(slot));
}

export function readAllSlots(): (SaveSlot | null)[] {
  return Array.from({ length: NUM_SLOTS }, (_, i) => readSaveSlot(i));
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

  // Save slots
  saves: (SaveSlot | null)[];
  saveModalMode: 'save' | 'load' | null;

  // Actions
  init: (worldId: string, loadSlot?: number) => Promise<void>;
  submitCommand: (raw: string) => void;
  rewindToTick: (tick: number) => void;
  resumeFromRewind: () => void;
  setInputMode: (mode: InputMode) => void;
  openSaveModal: () => void;
  openLoadModal: () => void;
  closeSaveModal: () => void;
  saveToSlot: (slot: number) => void;
  loadFromSlot: (slot: number) => void;
}

let lineCounter = 0;
const mkLine = (type: TerminalLine['type'], text: string, tick?: number, label?: string): TerminalLine => ({
  id: lineCounter++,
  type,
  text,
  tick,
  label,
});

function extractSpeaker(text: string): string | undefined {
  const m = text.match(/^\*\*([^*]+)\*\*/);
  return m ? m[1] : undefined;
}

const isNpcCmd = (cmd: string) =>
  cmd.startsWith('talk ') || cmd.startsWith('ask ');

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
  saves: readAllSlots(),
  saveModalMode: null,

  init: async (worldId: string, loadSlot?: number) => {
    const { worldMeta } = await engine.initEngine(worldId);
    const worldBase = {
      worldId,
      worldTitle: worldMeta?.title ?? '',
      currencyName: worldMeta?.currency ?? 'gold',
      currencySymbol: worldMeta?.currency_symbol ?? '⬡',
      secondaryCurrencyName: worldMeta?.secondary_currency ?? '',
      secondaryCurrencySymbol: worldMeta?.secondary_currency_symbol ?? '',
    };

    if (loadSlot !== undefined) {
      const saved = readSaveSlot(loadSlot);
      if (saved) {
        const result = await engine.loadFromSnapshot(saved.snapshot);
        const snap   = await engine.getSnapshot();
        const startRoomId   = snap.player_room_id;
        const startRoomName = snap.current_room_name ?? '';
        set({
          ...worldBase,
          initialized: true,
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
      lines: [
        mkLine('system', `=== ${worldMeta?.title?.toUpperCase() ?? 'PROJECT CHRONOS'} ===`),
        mkLine('system', "Type 'help' for commands. Type 'save' to save, 'load' to load."),
        mkLine('output', result.narrative, result.tick, startRoomName),
      ],
    });
  },

  submitCommand: (raw: string) => {
    const cmd = raw.trim().toLowerCase();

    if (cmd === 'save') {
      set(state => ({
        saveModalMode: 'save',
        lines: [...state.lines, mkLine('input', '> save')],
      }));
      return;
    }
    if (cmd === 'load') {
      set(state => ({
        saveModalMode: 'load',
        lines: [...state.lines, mkLine('input', '> load')],
      }));
      return;
    }

    if (get().isRewound) set({ isRewound: false });

    void (async () => {
      const oldRoomId  = get().currentRoomId;
      const oldX       = get().mapCurrentX;
      const oldY       = get().mapCurrentY;

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
        ? { id: lineCounter++, type: 'npc', text: narrative, tick: result.tick, speaker: extractSpeaker(narrative) }
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

      set(state => ({
        lines: [...state.lines, mkLine('input', `> ${raw}`), responseLine],
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
      }));
    })();
  },

  rewindToTick: (tick: number) => {
    void (async () => {
      const result = await engine.rewindToTick(tick);
      const snap   = await engine.getSnapshot();
      set(state => ({
        lines: [
          ...state.lines,
          mkLine('system', `⏪ Rewound to tick ${tick}`),
          mkLine('output', result.narrative, tick),
        ],
        currentTick:     tick,
        maxTick:         result.max_tick,
        gameTime:        result.game_time ?? 360,
        playerCharacter: snap.player_character,
        currentRoomId:   snap.player_room_id,
        currentRoomName: snap.current_room_name ?? '',
        enemies:         snap.enemies,
        contextActions:  result.context_actions,
        roomActions:     result.room_actions,
        inventoryIds:    result.inventory_ids,
        isRewound:       tick < result.max_tick,
      }));
    })();
  },

  resumeFromRewind: () => {
    void (async () => {
      const max    = await engine.getMaxTick();
      const result = await engine.rewindToTick(max);
      const snap   = await engine.getSnapshot();
      set(state => ({
        lines: [...state.lines, mkLine('system', '▶ Resumed at latest tick')],
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
      }));
    })();
  },

  setInputMode: (mode: InputMode) => set({ inputMode: mode }),

  openSaveModal: () => set({ saveModalMode: 'save' }),
  openLoadModal: () => set({ saveModalMode: 'load' }),
  closeSaveModal: () => set({ saveModalMode: null }),

  saveToSlot: (slot: number) => {
    void (async () => {
      const { worldId, worldTitle, playerCharacter, currentRoomId, currentTick } = get();
      const snap = await engine.getSnapshot();
      const entry: SaveSlot = {
        version: 1,
        worldId,
        worldTitle,
        characterName: playerCharacter?.name ?? 'Unknown',
        classId: playerCharacter?.class_id ?? '',
        roomId: currentRoomId,
        tick: currentTick,
        savedAt: new Date().toISOString(),
        snapshot: JSON.stringify(snap),
      };
      writeSaveSlot(slot, entry);
      const saves = readAllSlots();
      set(state => ({
        saves,
        saveModalMode: null,
        lines: [...state.lines, mkLine('system', `Game saved to slot ${slot + 1}.`)],
      }));
    })();
  },

  loadFromSlot: (slot: number) => {
    const saved = readSaveSlot(slot);
    if (!saved) return;
    void (async () => {
      try {
        const result = await engine.loadFromSnapshot(saved.snapshot);
        const snap   = await engine.getSnapshot();
        const loadedRoomId   = snap.player_room_id;
        const loadedRoomName = snap.current_room_name ?? '';
        set(state => ({
          saveModalMode: null,
          lines: [
            ...state.lines,
            mkLine('system', `Loaded slot ${slot + 1} — ${saved.characterName}.`),
            mkLine('output', result.narrative, result.tick),
          ],
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
        }));
      } catch (e) {
        set(state => ({
          saveModalMode: null,
          lines: [...state.lines, mkLine('error', `Load failed: ${e}`)],
        }));
      }
    })();
  },
}));
