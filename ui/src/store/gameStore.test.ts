import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the engine bridge before importing the store.
vi.mock('@/bridge/engine', () => ({
  initEngine:       vi.fn(),
  processCommand:   vi.fn(),
  rewindToTick:     vi.fn(),
  getSnapshot:      vi.fn(),
  loadFromSnapshot: vi.fn(),
  getMaxTick:       vi.fn(),
  peekRoomActions:  vi.fn(),
  listWorlds:       vi.fn(),
  listPlayableClasses: vi.fn(),
  getItemName:      vi.fn(),
  getItemDescription: vi.fn(),
  getCurrentWorld:  vi.fn(),
  getCurrentTick:   vi.fn(),
}));

import { useGameStore, readAllSlots, NUM_SLOTS } from './gameStore';

function resetStore() {
  useGameStore.setState({
    initialized: false,
    journalOpen: false,
    saveModalMode: null,
    inputMode: 'PARSER',
    lines: [],
    isRewound: false,
  });
}

beforeEach(() => {
  resetStore();
  localStorage.clear();
});

// ── pure UI state actions ─────────────────────────────────────────────────────

describe('journal actions', () => {
  it('openJournal sets journalOpen true', () => {
    useGameStore.getState().openJournal();
    expect(useGameStore.getState().journalOpen).toBe(true);
  });

  it('closeJournal sets journalOpen false', () => {
    useGameStore.setState({ journalOpen: true });
    useGameStore.getState().closeJournal();
    expect(useGameStore.getState().journalOpen).toBe(false);
  });
});

describe('save modal actions', () => {
  it('openSaveModal sets saveModalMode to save', () => {
    useGameStore.getState().openSaveModal();
    expect(useGameStore.getState().saveModalMode).toBe('save');
  });

  it('openLoadModal sets saveModalMode to load', () => {
    useGameStore.getState().openLoadModal();
    expect(useGameStore.getState().saveModalMode).toBe('load');
  });

  it('closeSaveModal clears saveModalMode', () => {
    useGameStore.setState({ saveModalMode: 'save' });
    useGameStore.getState().closeSaveModal();
    expect(useGameStore.getState().saveModalMode).toBeNull();
  });
});

describe('setInputMode', () => {
  it('updates inputMode', () => {
    useGameStore.getState().setInputMode('BUTTONS');
    expect(useGameStore.getState().inputMode).toBe('BUTTONS');
    useGameStore.getState().setInputMode('PARSER');
    expect(useGameStore.getState().inputMode).toBe('PARSER');
  });
});

// ── submitCommand short-circuit paths ─────────────────────────────────────────

describe('submitCommand short-circuits', () => {
  it('"save" opens save modal and logs a line without calling the engine', async () => {
    const { processCommand } = await import('@/bridge/engine');
    useGameStore.setState({ initialized: true });

    useGameStore.getState().submitCommand('save');

    expect(useGameStore.getState().saveModalMode).toBe('save');
    expect(processCommand).not.toHaveBeenCalled();
    const lines = useGameStore.getState().lines;
    expect(lines.some(l => l.text === '> save')).toBe(true);
  });

  it('"load" opens load modal and logs a line without calling the engine', async () => {
    const { processCommand } = await import('@/bridge/engine');
    useGameStore.setState({ initialized: true });

    useGameStore.getState().submitCommand('load');

    expect(useGameStore.getState().saveModalMode).toBe('load');
    expect(processCommand).not.toHaveBeenCalled();
  });

  it('"journal" opens the journal without calling the engine', async () => {
    const { processCommand } = await import('@/bridge/engine');
    useGameStore.setState({ initialized: true });

    useGameStore.getState().submitCommand('journal');

    expect(useGameStore.getState().journalOpen).toBe(true);
    expect(processCommand).not.toHaveBeenCalled();
  });

  it('"j" also opens the journal', async () => {
    useGameStore.setState({ initialized: true });
    useGameStore.getState().submitCommand('j');
    expect(useGameStore.getState().journalOpen).toBe(true);
  });
});

// ── save slots (localStorage) ─────────────────────────────────────────────────

describe('readAllSlots', () => {
  it('returns nulls when localStorage is empty', () => {
    const slots = readAllSlots();
    expect(slots).toHaveLength(NUM_SLOTS);
    expect(slots.every(s => s === null)).toBe(true);
  });

  it('reads a slot written directly to localStorage', () => {
    const slot = {
      version: 1 as const,
      worldId: 'iron-and-blood',
      worldTitle: 'Iron & Blood',
      characterName: 'Corvus',
      classId: 'soldier',
      roomId: 'gate',
      tick: 5,
      savedAt: '2026-01-01T00:00:00Z',
      snapshot: '{}',
    };
    localStorage.setItem('chronos_slot_0', JSON.stringify(slot));
    const slots = readAllSlots();
    expect(slots[0]).toMatchObject({ characterName: 'Corvus', tick: 5 });
    expect(slots[1]).toBeNull();
  });

  it('returns null for a corrupt slot entry', () => {
    localStorage.setItem('chronos_slot_1', 'not-json{{{');
    const slots = readAllSlots();
    expect(slots[1]).toBeNull();
  });
});
