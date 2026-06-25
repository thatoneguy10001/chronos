import { describe, it, expect, beforeEach } from 'vitest';
import { useBuildStore } from './buildStore';

// Reset the whole draft before each test so they don't bleed into each other.
beforeEach(() => {
  useBuildStore.setState({ draft: { layers: [], rooms: [], startRoomId: null } });
});

describe('buildStore layer stack', () => {
  it('toggling a layer on pulls in its dependencies', () => {
    useBuildStore.getState().toggleLayer('combat');
    // combat requires space + entity.
    expect(useBuildStore.getState().draft.layers).toEqual(['space', 'entity', 'combat']);
  });

  it('keeps the stack in canonical pipeline order', () => {
    useBuildStore.getState().toggleLayer('quests'); // late in order
    useBuildStore.getState().toggleLayer('space');  // early in order
    expect(useBuildStore.getState().draft.layers).toEqual(['space', 'quests']);
  });

  it('toggling a dependency off removes everything that needed it', () => {
    useBuildStore.getState().toggleLayer('combat'); // → space, entity, combat
    useBuildStore.getState().toggleLayer('space');  // removing space must drop combat too
    // entity stays (it didn't depend on space); combat is gone.
    expect(useBuildStore.getState().draft.layers).toEqual(['entity']);
  });

  it('toggling a layer off when nothing depends on it removes only that layer', () => {
    useBuildStore.getState().toggleLayer('combat'); // space, entity, combat
    useBuildStore.getState().toggleLayer('combat'); // remove just combat
    expect(useBuildStore.getState().draft.layers).toEqual(['space', 'entity']);
  });

  it('applying a preset sets a valid, ordered stack', () => {
    useBuildStore.getState().applyPreset('story_explorer');
    expect(useBuildStore.getState().draft.layers).toEqual(['space', 'dialogue', 'quests']);
    expect(useBuildStore.getState().validate()).toEqual([]);
  });

  it('every preset validates cleanly', () => {
    for (const id of ['text_adventure', 'dungeon_crawl', 'story_explorer']) {
      useBuildStore.getState().applyPreset(id);
      expect(useBuildStore.getState().validate()).toEqual([]);
    }
  });

  it('an empty stack is valid', () => {
    expect(useBuildStore.getState().validate()).toEqual([]);
  });
});

describe('buildStore rooms', () => {
  const s = () => useBuildStore.getState();

  it('the first room added becomes the start room', () => {
    const id = s().addRoom();
    expect(s().draft.rooms).toHaveLength(1);
    expect(s().draft.startRoomId).toBe(id);
  });

  it('generates stable, non-colliding ids even after deletes', () => {
    const a = s().addRoom(); // room_1
    const b = s().addRoom(); // room_2
    s().removeRoom(a);
    const c = s().addRoom(); // must be room_3, not reuse room_1
    expect([a, b, c]).toEqual(['room_1', 'room_2', 'room_3']);
  });

  it('deleting a room drops exits that pointed at it', () => {
    const a = s().addRoom();
    const b = s().addRoom();
    s().addExit(a, { direction: 'north', target: b });
    expect(s().draft.rooms.find(r => r.id === a)!.exits).toHaveLength(1);
    s().removeRoom(b);
    expect(s().draft.rooms.find(r => r.id === a)!.exits).toHaveLength(0);
  });

  it('deleting the start room reassigns start to a remaining room', () => {
    const a = s().addRoom();
    const b = s().addRoom();
    expect(s().draft.startRoomId).toBe(a);
    s().removeRoom(a);
    expect(s().draft.startRoomId).toBe(b);
  });

  it('validates: needs a room, a start, and exits that go somewhere', () => {
    expect(s().validateRooms()).toContain('Add at least one room.');

    const a = s().addRoom();
    const b = s().addRoom();
    expect(s().validateRooms()).toEqual([]); // start auto-set, no exits yet

    // An exit with no target is invalid.
    s().addExit(a, { direction: 'north', target: '' });
    expect(s().validateRooms().some(e => e.includes('exit going nowhere'))).toBe(true);

    // Pointing it at a real room clears the error.
    s().updateExit(a, 0, { target: b });
    expect(s().validateRooms()).toEqual([]);
  });
});
