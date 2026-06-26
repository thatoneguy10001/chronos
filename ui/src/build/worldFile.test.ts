import { describe, it, expect, beforeEach } from 'vitest';
import { useBuildStore } from '@/store/buildStore';
import { parseWorldFile, serializeWorldFile, worldFileName, WORLD_FILE_VERSION } from './worldFile';

const s = () => useBuildStore.getState();

beforeEach(() => {
  useBuildStore.setState({
    draft: { layers: [], rooms: [], startRoomId: null, npcs: [], items: [], classes: [], quests: [], party: [] },
  });
});

describe('worldFile', () => {
  it('round-trips a draft losslessly', () => {
    // Author a small world through the real store.
    const room = s().addRoom();
    s().addNpc();
    const hero = s().addClass('playable');
    const foe = s().addClass('enemy');
    s().togglePartyMember(hero); // a starting companion — must survive the round trip
    const quest = s().addQuest();
    s().updateQuest(quest, { objectiveType: 'kill_count', targetId: foe, killCount: 2 });
    const before = s().draft;

    const text = serializeWorldFile(before, 'Trench Wars');
    const result = parseWorldFile(text);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.title).toBe('Trench Wars');
      expect(result.draft).toEqual(before);
      expect(result.draft.startRoomId).toBe(room);
      expect(result.draft.party).toEqual([hero]);
    }
  });

  it('makes a filesystem-safe filename', () => {
    expect(worldFileName('Iron & Blood')).toBe('iron-blood.chronos-world.json');
    expect(worldFileName('   ')).toBe('world.chronos-world.json');
  });

  it('rejects non-JSON', () => {
    const r = parseWorldFile('not json {');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/valid JSON/);
  });

  it('rejects JSON that is not a Chronos world', () => {
    const r = parseWorldFile(JSON.stringify({ hello: 'world' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not a Chronos world/);
  });

  it('refuses a file from a newer format version', () => {
    const r = parseWorldFile(JSON.stringify({ format: 'chronos-world', version: WORLD_FILE_VERSION + 1, draft: {} }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/newer version/);
  });

  it('fills missing draft arrays with empty defaults', () => {
    // A sparse file (only rooms) still imports — other collections default to [].
    const r = parseWorldFile(JSON.stringify({
      format: 'chronos-world',
      version: 1,
      title: 'Sparse',
      draft: { rooms: [{ id: 'room_1', name: 'A', description: '', exits: [] }], startRoomId: 'room_1' },
    }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.draft.rooms).toHaveLength(1);
      expect(r.draft.npcs).toEqual([]);
      expect(r.draft.quests).toEqual([]);
      expect(r.draft.layers).toEqual([]);
    }
  });

  it('loadDraft replaces the draft and isDraftEmpty reflects it', () => {
    expect(s().isDraftEmpty()).toBe(true);
    const text = serializeWorldFile(
      { layers: ['space'], rooms: [{ id: 'room_1', name: 'A', description: '', exits: [] }], startRoomId: 'room_1', npcs: [], items: [], classes: [], quests: [], party: [] },
      'X',
    );
    const r = parseWorldFile(text);
    if (r.ok) s().loadDraft(r.draft);
    expect(s().isDraftEmpty()).toBe(false);
    expect(s().draft.rooms).toHaveLength(1);
  });
});
