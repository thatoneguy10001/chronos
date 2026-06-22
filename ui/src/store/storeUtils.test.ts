import { describe, it, expect } from 'vitest';
import {
  extractDirection,
  isMovementCmd,
  isNpcCmd,
  classifyLine,
  extractSpeaker,
  DIR_VECTORS,
} from './storeUtils';

// ── extractDirection ──────────────────────────────────────────────────────────

describe('extractDirection', () => {
  it('returns a bare direction word', () => {
    expect(extractDirection('north')).toBe('north');
    expect(extractDirection('sw')).toBe('sw');
    expect(extractDirection('northeast')).toBe('northeast');
  });

  it('strips "go " prefix', () => {
    expect(extractDirection('go north')).toBe('north');
    expect(extractDirection('go southwest')).toBe('southwest');
  });

  it('is case-insensitive', () => {
    expect(extractDirection('NORTH')).toBe('north');
    expect(extractDirection('Go South')).toBe('south');
  });

  it('returns null for non-direction commands', () => {
    expect(extractDirection('look')).toBeNull();
    expect(extractDirection('attack goblin')).toBeNull();
    expect(extractDirection('go')).toBeNull();        // "go" alone has no direction
    expect(extractDirection('')).toBeNull();
  });

  it('covers all DIR_VECTORS keys', () => {
    for (const dir of Object.keys(DIR_VECTORS)) {
      expect(extractDirection(dir)).toBe(dir);
    }
  });
});

// ── isMovementCmd ─────────────────────────────────────────────────────────────

describe('isMovementCmd', () => {
  it('returns true for direction words', () => {
    expect(isMovementCmd('north')).toBe(true);
    expect(isMovementCmd('go east')).toBe(true);
  });

  it('returns false for non-movement commands', () => {
    expect(isMovementCmd('look')).toBe(false);
    expect(isMovementCmd('attack')).toBe(false);
    expect(isMovementCmd('go')).toBe(false);
  });
});

// ── isNpcCmd ─────────────────────────────────────────────────────────────────

describe('isNpcCmd', () => {
  it('recognises talk and ask prefixes', () => {
    expect(isNpcCmd('talk guard')).toBe(true);
    expect(isNpcCmd('ask merchant about prices')).toBe(true);
  });

  it('rejects bare verbs and other commands', () => {
    expect(isNpcCmd('talk')).toBe(false);   // no space after
    expect(isNpcCmd('look')).toBe(false);
    expect(isNpcCmd('attack guard')).toBe(false);
  });
});

// ── classifyLine ─────────────────────────────────────────────────────────────

describe('classifyLine', () => {
  it('returns error when success is false', () => {
    expect(classifyLine('north', false)).toBe('error');
    expect(classifyLine('look', false)).toBe('error');
    expect(classifyLine('attack goblin', false)).toBe('error');
  });

  it('classifies movement commands', () => {
    expect(classifyLine('north', true)).toBe('movement');
    expect(classifyLine('go south', true)).toBe('movement');
    expect(classifyLine('southwest', true)).toBe('movement');
    // "go" alone is treated as movement (engine would reject it, making success=false → error)
    expect(classifyLine('go', true)).toBe('movement');
  });

  it('classifies npc commands', () => {
    expect(classifyLine('talk guard', true)).toBe('npc');
    expect(classifyLine('ask merchant prices', true)).toBe('npc');
  });

  it('classifies attack/fight as combat', () => {
    expect(classifyLine('attack goblin', true)).toBe('combat');
    expect(classifyLine('fight', true)).toBe('combat');
  });

  it('classifies unknown verbs (ability commands) as combat', () => {
    expect(classifyLine('fireball', true)).toBe('combat');
    expect(classifyLine('shadowstep target', true)).toBe('combat');
  });

  it('classifies known narrative verbs as output', () => {
    const narrativeVerbs = ['look', 'examine', 'inventory', 'inv', 'i', 'wait',
      'help', 'stats', 'take', 'drop', 'use', 'equip', 'save', 'load', 'shop'];
    for (const v of narrativeVerbs) {
      expect(classifyLine(v, true)).toBe('output');
    }
  });
});

// ── extractSpeaker ────────────────────────────────────────────────────────────

describe('extractSpeaker', () => {
  it('extracts bold speaker name at line start', () => {
    expect(extractSpeaker('**Guard**: Stop right there!')).toBe('Guard');
    expect(extractSpeaker('**Old Merchant**: What can I do for you?')).toBe('Old Merchant');
  });

  it('returns undefined when no bold prefix', () => {
    expect(extractSpeaker('You look around.')).toBeUndefined();
    expect(extractSpeaker('')).toBeUndefined();
  });
});
