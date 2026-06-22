import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for engine-ws.ts that don't require a live WebSocket.
 * We test the pure utility functions and the synchronous getters.
 */

// Provide a minimal WebSocket stub before the module loads.
class FakeWebSocket extends EventTarget {
  static OPEN = 1;
  readyState = FakeWebSocket.OPEN;
  sentMessages: string[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(public url: string) {
    super();
    Promise.resolve().then(() => this.onopen?.());
  }

  send(msg: string) { this.sentMessages.push(msg); }
  close() { this.onclose?.(); }

  /** Helper: simulate a server message arriving. */
  receive(data: object) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

vi.stubGlobal('WebSocket', FakeWebSocket);

// import.meta.env stubs — must be set before the module is first imported.
vi.stubEnv('VITE_WS_URL', 'ws://localhost:3000/ws');
vi.stubEnv('VITE_USE_WS_SERVER', 'false');

// Stub fetch for HTTP endpoints used by initEngine.
globalThis.fetch = vi.fn();

import * as ws from './engine-ws';

beforeEach(() => {
  vi.clearAllMocks();
});

// ── synchronous getters ───────────────────────────────────────────────────────

describe('synchronous getters (before any messages)', () => {
  it('getCurrentWorld returns null initially', () => {
    expect(ws.getCurrentWorld()).toBeNull();
  });

  it('getItemName falls back to the item id', () => {
    expect(ws.getItemName('sword_01')).toBe('sword_01');
  });

  it('getItemDescription returns empty string for unknown id', () => {
    expect(ws.getItemDescription('unknown')).toBe('');
  });

  it('getMaxTick returns 0 initially', () => {
    expect(ws.getMaxTick()).toBe(0);
  });
});

// ── listWorlds (HTTP) ─────────────────────────────────────────────────────────

describe('listWorlds', () => {
  it('fetches from /api/worlds and returns parsed JSON', async () => {
    const worlds = [{ id: 'iron-and-blood', title: 'Iron & Blood' }];
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      json: () => Promise.resolve(worlds),
    });

    const result = await ws.listWorlds();
    expect(result).toEqual(worlds);
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/worlds'));
  });
});

// ── listPlayableClasses (HTTP) ────────────────────────────────────────────────

describe('listPlayableClasses', () => {
  it('fetches from /api/worlds/:id/classes', async () => {
    const classes = [{ id: 'soldier', name: 'Soldier' }];
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      json: () => Promise.resolve(classes),
    });

    const result = await ws.listPlayableClasses('iron-and-blood');
    expect(result).toEqual(classes);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/worlds/iron-and-blood/classes'),
    );
  });
});
