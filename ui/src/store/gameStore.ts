import { create } from 'zustand';
import type { CharacterStateDTO, ContextAction, EnemyStateDTO, InputMode } from '@/types/contracts';
import * as engine from '@/bridge/engine';

function getRoomActions(): ContextAction[] {
  try { return engine.peekRoomActions(); } catch { return []; }
}

export interface TerminalLine {
  id: number;
  type: 'input' | 'output' | 'error' | 'system';
  text: string;
  tick?: number;
}

interface GameStore {
  // Engine state
  initialized: boolean;
  currentTick: number;
  maxTick: number;

  // World
  currencyName: string;
  currencySymbol: string;
  secondaryCurrencyName: string;
  secondaryCurrencySymbol: string;
  gameTime: number; // in-game minutes since start (360 = 06:00 Day 1)

  // Character state (refreshed from snapshot after every command)
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

  // Save/load
  hasSave: boolean;

  // Actions
  init: (worldId: string) => Promise<void>;
  submitCommand: (raw: string) => void;
  rewindToTick: (tick: number) => void;
  resumeFromRewind: () => void;
  setInputMode: (mode: InputMode) => void;
  saveGame: () => void;
  loadGame: () => void;
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
  hasSave: !!localStorage.getItem('chronos_save'),

  init: async (worldId: string) => {
    await engine.initEngine(worldId);
    const world = engine.getCurrentWorld();
    const result = engine.processCommand('look');
    const snap = engine.getSnapshot();
    set({
      initialized: true,
      currentTick: result.tick,
      maxTick: engine.getMaxTick(),
      currencyName: world?.currency ?? 'gold',
      currencySymbol: world?.currency_symbol ?? '⬡',
      secondaryCurrencyName: world?.secondary_currency ?? '',
      secondaryCurrencySymbol: world?.secondary_currency_symbol ?? '',
      gameTime: result.game_time ?? 360,
      playerCharacter: snap.player_character,
      currentRoomId: snap.player_room_id,
      enemies: snap.enemies,
      contextActions: result.context_actions,
      roomActions: getRoomActions(),
      inventoryIds: result.inventory_ids,
      lines: [
        mkLine('system', `=== ${world?.title?.toUpperCase() ?? 'PROJECT CHRONOS'} ===`),
        mkLine('system', "Type 'help' for commands"),
        mkLine('output', result.narrative, result.tick),
      ],
    });
  },

  submitCommand: (raw: string) => {
    const { isRewound } = get();
    if (isRewound) set({ isRewound: false });

    const result = engine.processCommand(raw);
    const snap = engine.getSnapshot();
    const roomActions = getRoomActions();

    set(state => ({
      lines: [...state.lines, mkLine('input', `> ${raw}`), mkLine(result.success ? 'output' : 'error', result.success || !result.narrative ? result.narrative : `⚠ ${result.narrative}`, result.tick)],
      currentTick: result.tick,
      maxTick: engine.getMaxTick(),
      gameTime: result.game_time ?? 360,
      playerCharacter: snap.player_character,
      currentRoomId: snap.player_room_id,
      enemies: snap.enemies,
      contextActions: result.context_actions,
      roomActions,
      inventoryIds: result.inventory_ids,
    }));
  },

  rewindToTick: (tick: number) => {
    const result = engine.rewindToTick(tick);
    const snap = engine.getSnapshot();

    set(state => ({
      lines: [...state.lines, mkLine('system', `⏪ Rewound to tick ${tick}`), mkLine('output', result.narrative, tick)],
      currentTick: tick,
      gameTime: result.game_time ?? 360,
      playerCharacter: snap.player_character,
      currentRoomId: snap.player_room_id,
      enemies: snap.enemies,
      contextActions: result.context_actions,
      roomActions: getRoomActions(),
      inventoryIds: result.inventory_ids,
      isRewound: tick < engine.getMaxTick(),
    }));
  },

  resumeFromRewind: () => {
    const max = engine.getMaxTick();
    const result = engine.rewindToTick(max);
    const snap = engine.getSnapshot();
    set(state => ({
      lines: [...state.lines, mkLine('system', '▶ Resumed at latest tick')],
      currentTick: max,
      gameTime: result.game_time ?? 360,
      playerCharacter: snap.player_character,
      currentRoomId: snap.player_room_id,
      enemies: snap.enemies,
      contextActions: result.context_actions,
      roomActions: getRoomActions(),
      inventoryIds: result.inventory_ids,
      isRewound: false,
    }));
  },

  setInputMode: (mode: InputMode) => set({ inputMode: mode }),

  saveGame: () => {
    const snap = engine.getSnapshot();
    const json = JSON.stringify(snap);
    localStorage.setItem('chronos_save', json);
    set(state => ({
      hasSave: true,
      lines: [...state.lines, mkLine('system', '💾 Game saved.')],
    }));
  },

  loadGame: () => {
    const json = localStorage.getItem('chronos_save');
    if (!json) return;
    try {
      const result = engine.loadFromSnapshot(json);
      const snap = engine.getSnapshot();
      set(state => ({
        lines: [...state.lines, mkLine('system', '📂 Game loaded.'), mkLine('output', result.narrative, result.tick)],
        currentTick: result.tick,
        maxTick: engine.getMaxTick(),
        gameTime: snap.game_time ?? 360,
        playerCharacter: snap.player_character,
        currentRoomId: snap.player_room_id,
        enemies: snap.enemies,
        contextActions: result.context_actions,
        roomActions: getRoomActions(),
        inventoryIds: result.inventory_ids,
        isRewound: false,
      }));
    } catch (e) {
      set(state => ({
        lines: [...state.lines, mkLine('error', `Load failed: ${e}`)],
      }));
    }
  },
}));
