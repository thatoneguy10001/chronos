import { describe, it, expect, beforeEach } from 'vitest';
import { useBuildStore } from '@/store/buildStore';
import { serializeWorld } from './serialize';

// Build drafts through the real store actions, then serialize, so the tests
// exercise the same path Build Mode uses.
const s = () => useBuildStore.getState();
const parse = (file: { content: string }) => JSON.parse(file.content);

beforeEach(() => {
  useBuildStore.setState({
    draft: { layers: [], rooms: [], startRoomId: null, npcs: [], items: [], classes: [], quests: [], party: [] },
  });
});

describe('serializeWorld', () => {
  it('points the manifest at the start room and titles the world', () => {
    const room = s().addRoom();
    const world = serializeWorld(s().draft, { title: 'Trench Wars' });
    const manifest = JSON.parse(world.manifest);
    expect(manifest.start_room_id).toBe(room);
    expect(manifest.title).toBe('Trench Wars');
    expect(manifest.schema_version).toBe(1);
    expect(world.meta.title).toBe('Trench Wars');
  });

  it('turns a room exit array into the engine direction-keyed map', () => {
    const a = s().addRoom();
    const b = s().addRoom();
    s().addExit(a, { direction: 'north', target: b });
    const world = serializeWorld(s().draft);
    const roomA = parse(world.rooms.find(f => f.filename === `${a}.json`)!);
    expect(roomA.exits).toEqual({ north: { target_room_id: b } });
  });

  it('writes each item kind into the right attribute bag', () => {
    const eq = s().addItem();
    s().updateItem(eq, { kind: 'equipment', equipStat: 'defense', equipBonus: 4 });
    const potion = s().addItem();
    s().updateItem(potion, { kind: 'consumable', healAmount: 30 });
    const plain = s().addItem();
    s().updateItem(plain, { kind: 'plain' });

    const world = serializeWorld(s().draft);
    const attrs = (id: string) => parse(world.items.find(f => f.filename === `${id}.json`)!).attributes;
    expect(attrs(eq)).toEqual({ equip_stat: 'defense', equip_bonus: 4 });
    expect(attrs(potion)).toEqual({ use_effect: 'heal', heal_amount: 30 });
    expect(attrs(plain)).toEqual({});
  });

  it('serializes a playable class without enemy rewards', () => {
    const hero = s().addClass('playable');
    const world = serializeWorld(s().draft);
    const cls = parse(world.classes.find(f => f.filename === `${hero}.json`)!);
    expect(cls.base_stats).toEqual({ hp: 100, attack: 10, defense: 5, intelligence: 0 });
    expect(cls.starting_equipment).toEqual([]);
    // The absence of xp_reward/gold_reward is exactly how loaders mark it playable.
    expect(cls.xp_reward).toBeUndefined();
    expect(cls.gold_reward).toBeUndefined();
  });

  it('serializes an enemy with loot and drops it into the start room', () => {
    const room = s().addRoom();
    const gem = s().addItem();
    const foe = s().addClass('enemy');
    s().updateClass(foe, { xpReward: 25, goldReward: 7 });
    s().addLoot(foe, { itemId: gem, chance: 0.5 });

    const world = serializeWorld(s().draft);
    const cls = parse(world.classes.find(f => f.filename === `${foe}.json`)!);
    expect(cls.xp_reward).toBe(25);
    expect(cls.gold_reward).toBe(7);
    expect(cls.loot_table).toEqual([{ item_id: gem, chance: 0.5 }]);

    // Every enemy is placed in the start room so the test world is fightable.
    const manifest = JSON.parse(world.manifest);
    expect(manifest.encounters).toEqual([{ class_id: foe, room_id: room }]);
  });

  it('places NPCs and gives each dialogue line a prompt', () => {
    const room = s().addRoom();
    const npc = s().addNpc();
    s().updateNpc(npc, { greeting: 'Hello.' });
    s().addDialogue(npc, { keyword: 'war', response: 'It never ends.' });

    const world = serializeWorld(s().draft);
    const manifest = JSON.parse(world.manifest);
    expect(manifest.npc_placements).toEqual([{ npc_id: npc, room_id: room }]);
    const dto = parse(world.npcs.find(f => f.filename === `${npc}.json`)!);
    expect(dto.dialogue).toEqual([{ keyword: 'war', prompt: 'war', response: 'It never ends.' }]);
  });

  it('maps each quest objective to the engine tagged shape', () => {
    s().addRoom();
    const npc = s().addNpc();
    const foe = s().addClass('enemy');
    const quest = s().addQuest();
    s().updateQuest(quest, { objectiveType: 'kill_count', targetId: foe, killCount: 3 });

    const world = serializeWorld(s().draft);
    const dto = parse(world.quests.find(f => f.filename === `${quest}.json`)!);
    expect(dto.objective).toEqual({ type: 'kill_count', class_id: foe, count: 3 });
    expect(dto.giver_npc_id).toBe(npc);
  });

  it('emits the starting party, dropping ids that are not playable classes', () => {
    const hero = s().addClass('playable');
    const foe = s().addClass('enemy');
    s().togglePartyMember(hero);
    // Force a stale id into the party to prove serialize filters it out.
    useBuildStore.setState({ draft: { ...s().draft, party: [hero, foe, 'ghost'] } });

    const manifest = JSON.parse(serializeWorld(s().draft).manifest);
    expect(manifest.party).toEqual([hero]);
  });

  it('orders the manifest layers canonically', () => {
    s().toggleLayer('quests'); // late in pipeline order
    s().toggleLayer('space');  // early
    const manifest = JSON.parse(serializeWorld(s().draft).manifest);
    const ids = manifest.layers.map((l: { id: string }) => l.id);
    expect(ids.indexOf('space')).toBeLessThan(ids.indexOf('quests'));
  });
});
