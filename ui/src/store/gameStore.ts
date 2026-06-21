import { create } from 'zustand';
import type { CharacterStateDTO, ContextAction, EnemyStateDTO, InputMode } from '@/types/contracts';
import * as engine from '@/bridge/engine';

export interface TerminalLine {
  id: number;
  type: 'input' | 'output' | 'error' | 'system';
  text: string;
  tick?: number;
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
  enemies: EnemyStateDTO[];

  // UI state
  inputMode: InputMode;
  contextActions: ContextAction[];
  roomActions: ContextAction[];
  inventoryIds: string[];

  // Terminal history
  lines: TerminalLine[];
  nextLineId: number;

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
const mkLine = (type: TerminalLine['type'], text: string, tick?: number): TerminalLine => ({
  id: lineCounter++,
  type,
  text,
  tick,
});

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
  enemies: [],
  inputMode: 'PARSER',
  contextActions: [],
  roomActions: [],
  inventoryIds: [],
  lines: [],
  nextLineId: 0,
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
        set({
          ...worldBase,
          initialized: true,
          currentTick:    result.tick,
          maxTick:        result.max_tick,
          gameTime:       result.game_time ?? 360,
          playerCharacter: snap.player_character,
          currentRoomId:  snap.player_room_id,
          enemies:        snap.enemies,
          contextActions: result.context_actions,
          roomActions:    result.room_actions,
          inventoryIds:   result.inventory_ids,
          isRewound:      false,
          lines: [
            mkLine('system', `=== ${worldMeta?.title?.toUpperCase() ?? 'PROJECT CHRONOS'} ===`),
            mkLine('system', 'Save loaded.'),
            mkLine('output', result.narrative, result.tick),
          ],
        });
        return;
      }
    }

    const result = await engine.processCommand('look');
    const snap   = await engine.getSnapshot();
    set({
      ...worldBase,
      initialized: true,
      currentTick: result.tick,
      maxTick: result.max_tick,
      gameTime: result.game_time ?? 360,
      playerCharacter: snap.player_character,
      currentRoomId: snap.player_room_id,
      enemies: snap.enemies,
      contextActions: result.context_actions,
      roomActions: result.room_actions,
      inventoryIds: result.inventory_ids,
      lines: [
        mkLine('system', `=== ${worldMeta?.title?.toUpperCase() ?? 'PROJECT CHRONOS'} ===`),
        mkLine('system', "Type 'help' for commands. Type 'save' to save, 'load' to load."),
        mkLine('output', result.narrative, result.tick),
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
      const result = await engine.processCommand(raw);
      const snap   = await engine.getSnapshot();
      set(state => ({
        lines: [
          ...state.lines,
          mkLine('input', `> ${raw}`),
          mkLine(result.success ? 'output' : 'error',
            result.success || !result.narrative ? result.narrative : `⚠ ${result.narrative}`,
            result.tick),
        ],
        currentTick:    result.tick,
        maxTick:        result.max_tick,
        gameTime:       result.game_time ?? 360,
        playerCharacter: snap.player_character,
        currentRoomId:  snap.player_room_id,
        enemies:        snap.enemies,
        contextActions: result.context_actions,
        roomActions:    result.room_actions,
        inventoryIds:   result.inventory_ids,
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
        currentTick:    tick,
        maxTick:        result.max_tick,
        gameTime:       result.game_time ?? 360,
        playerCharacter: snap.player_character,
        currentRoomId:  snap.player_room_id,
        enemies:        snap.enemies,
        contextActions: result.context_actions,
        roomActions:    result.room_actions,
        inventoryIds:   result.inventory_ids,
        isRewound:      tick < result.max_tick,
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
        currentTick:    max,
        maxTick:        result.max_tick,
        gameTime:       result.game_time ?? 360,
        playerCharacter: snap.player_character,
        currentRoomId:  snap.player_room_id,
        enemies:        snap.enemies,
        contextActions: result.context_actions,
        roomActions:    result.room_actions,
        inventoryIds:   result.inventory_ids,
        isRewound:      false,
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
        set(state => ({
          saveModalMode: null,
          lines: [
            ...state.lines,
            mkLine('system', `Loaded slot ${slot + 1} — ${saved.characterName}.`),
            mkLine('output', result.narrative, result.tick),
          ],
          currentTick:    result.tick,
          maxTick:        result.max_tick,
          gameTime:       snap.game_time ?? 360,
          playerCharacter: snap.player_character,
          currentRoomId:  snap.player_room_id,
          enemies:        snap.enemies,
          contextActions: result.context_actions,
          roomActions:    result.room_actions,
          inventoryIds:   result.inventory_ids,
          isRewound:      false,
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
