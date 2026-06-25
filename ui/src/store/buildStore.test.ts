import { describe, it, expect, beforeEach } from 'vitest';
import { useBuildStore } from './buildStore';

// Reset the draft before each test so they don't bleed into each other.
beforeEach(() => {
  useBuildStore.getState().clearLayers();
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
