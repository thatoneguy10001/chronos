import { create } from 'zustand';
import type { CharacterStateDTO, ContextAction, EnemyStateDTO, InputMode } from '@/types/contracts';
import * as engine from '@/bridge/engine';

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
    const { worldMeta } = await engine.initEngine(worldId);
    const result = await engine.processCommand('look');
    const snap   = await engine.getSnapshot();
    set({
      initialized: true,
      currentTick: result.tick,
      maxTick: result.max_tick,
      currencyName: worldMeta?.currency ?? 'gold',
      currencySymbol: worldMeta?.currency_symbol ?? '⬡',
      secondaryCurrencyName: worldMeta?.secondary_currency ?? '',
      secondaryCurrencySymbol: worldMeta?.secondary_currency_symbol ?? '',
      gameTime: result.game_time ?? 360,
      playerCharacter: snap.player_character,
      currentRoomId: snap.player_room_id,
      enemies: snap.enemies,
      contextActions: result.context_actions,
      roomActions: result.room_actions,
      inventoryIds: result.inventory_ids,
      lines: [
        mkLine('system', `=== ${worldMeta?.title?.toUpperCase() ?? 'PROJECT CHRONOS'} ===`),
        mkLine('system', "Type 'help' for commands"),
        mkLine('output', result.narrative, result.tick),
      ],
    });
  },

  submitCommand: (raw: string) => {
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

  saveGame: () => {
    void (async () => {
      const snap = await engine.getSnapshot();
      localStorage.setItem('chronos_save', JSON.stringify(snap));
      set(state => ({
        hasSave: true,
        lines: [...state.lines, mkLine('system', '💾 Game saved.')],
      }));
    })();
  },

  loadGame: () => {
    const json = localStorage.getItem('chronos_save');
    if (!json) return;
    void (async () => {
      try {
        const result = await engine.loadFromSnapshot(json);
        const snap   = await engine.getSnapshot();
        set(state => ({
          lines: [
            ...state.lines,
            mkLine('system', '📂 Game loaded.'),
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
          lines: [...state.lines, mkLine('error', `Load failed: ${e}`)],
        }));
      }
    })();
  },
}));
