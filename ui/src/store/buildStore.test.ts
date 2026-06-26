import { describe, it, expect, beforeEach } from 'vitest';
import { useBuildStore } from './buildStore';

// Reset the whole draft before each test so they don't bleed into each other.
beforeEach(() => {
  useBuildStore.setState({
    draft: { layers: [], rooms: [], startRoomId: null, npcs: [], items: [], classes: [] },
  });
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

describe('buildStore npcs', () => {
  const s = () => useBuildStore.getState();

  it('a new NPC defaults to standing in the start room', () => {
    const room = s().addRoom(); // becomes start
    const npc = s().addNpc();
    expect(s().draft.npcs.find(n => n.id === npc)!.roomId).toBe(room);
  });

  it('generates stable npc ids even after deletes', () => {
    s().addRoom();
    const a = s().addNpc(); // npc_1
    const b = s().addNpc(); // npc_2
    s().removeNpc(a);
    const c = s().addNpc(); // npc_3
    expect([a, b, c]).toEqual(['npc_1', 'npc_2', 'npc_3']);
  });

  it('validates: greeting required, placement must exist, topics complete', () => {
    const room = s().addRoom();
    const npc = s().addNpc();
    // No greeting yet → invalid.
    expect(s().validateNpcs().some(e => e.includes('no greeting'))).toBe(true);

    s().updateNpc(npc, { greeting: 'Hello, soldier.' });
    expect(s().validateNpcs()).toEqual([]);

    // An incomplete topic is flagged.
    s().addDialogue(npc, { keyword: '', response: '' });
    expect(s().validateNpcs().some(e => e.includes('incomplete topic'))).toBe(true);
    s().updateDialogue(npc, 0, { keyword: 'war', response: 'It never ends.' });
    expect(s().validateNpcs()).toEqual([]);

    // Deleting the room the NPC stands in is caught.
    s().removeRoom(room);
    expect(s().validateNpcs().some(e => e.includes('no longer exists'))).toBe(true);
  });
});

describe('buildStore content (items + classes)', () => {
  const s = () => useBuildStore.getState();

  it('generates stable item and class ids even after deletes', () => {
    const a = s().addItem(); // item_1
    const b = s().addItem(); // item_2
    s().removeItem(a);
    const c = s().addItem(); // must be item_3, not reuse item_1
    expect([a, b, c]).toEqual(['item_1', 'item_2', 'item_3']);

    // Classes and enemies share one id namespace (they're one engine type).
    const hero = s().addClass('playable'); // class_1
    const foe = s().addClass('enemy'); // class_2
    expect([hero, foe]).toEqual(['class_1', 'class_2']);
  });

  it('deleting an item scrubs it from equipment and loot', () => {
    const sword = s().addItem();
    const hero = s().addClass('playable');
    const foe = s().addClass('enemy');
    s().toggleStartingEquipment(hero, sword);
    s().addLoot(foe, { itemId: sword, chance: 1 });
    expect(s().draft.classes.find(c => c.id === hero)!.startingEquipment).toEqual([sword]);
    expect(s().draft.classes.find(c => c.id === foe)!.loot).toHaveLength(1);

    s().removeItem(sword);
    // No dangling references survive the delete.
    expect(s().draft.classes.find(c => c.id === hero)!.startingEquipment).toEqual([]);
    expect(s().draft.classes.find(c => c.id === foe)!.loot).toEqual([]);
  });

  it('toggling starting equipment adds then removes it', () => {
    const item = s().addItem();
    const hero = s().addClass('playable');
    s().toggleStartingEquipment(hero, item);
    expect(s().draft.classes.find(c => c.id === hero)!.startingEquipment).toEqual([item]);
    s().toggleStartingEquipment(hero, item);
    expect(s().draft.classes.find(c => c.id === hero)!.startingEquipment).toEqual([]);
  });

  it('validates: names, positive HP, equipment kind, and references', () => {
    expect(s().validateContent()).toEqual([]); // empty is fine

    const item = s().addItem();
    s().updateItem(item, { name: '', kind: 'equipment', equipStat: '' });
    let errs = s().validateContent();
    expect(errs.some(e => e.includes('missing a name'))).toBe(true);
    expect(errs.some(e => e.includes('boosts no stat'))).toBe(true);

    // A consumable that heals nothing is flagged.
    s().updateItem(item, { name: 'Potion', kind: 'consumable', healAmount: 0 });
    expect(s().validateContent().some(e => e.includes('heals nothing'))).toBe(true);
    s().updateItem(item, { healAmount: 25 });
    expect(s().validateContent()).toEqual([]);

    // A class needs at least 1 HP.
    const foe = s().addClass('enemy');
    s().updateClass(foe, { hp: 0 });
    expect(s().validateContent().some(e => e.includes('at least 1 HP'))).toBe(true);
    s().updateClass(foe, { hp: 10 });

    // A loot row with no item chosen is caught.
    s().addLoot(foe, { itemId: '', chance: 1 });
    expect(s().validateContent().some(e => e.includes('no longer exists'))).toBe(true);
    s().updateLoot(foe, 0, { itemId: item });
    expect(s().validateContent()).toEqual([]);
  });
});
