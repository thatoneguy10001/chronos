import type { TerminalLine } from './gameStore';

export const DIR_VECTORS: Record<string, [number, number]> = {
  north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0],
  up: [0, -2],    down: [0, 2],
  northeast: [1, -1], northwest: [-1, -1], southeast: [1, 1], southwest: [-1, 1],
  ne: [1, -1],    nw: [-1, -1], se: [1, 1],  sw: [-1, 1],
};

export const DIRS = new Set(Object.keys(DIR_VECTORS));

export function extractDirection(cmd: string): string | null {
  const parts = cmd.trim().toLowerCase().split(/\s+/);
  if (parts[0] === 'go' && DIRS.has(parts[1])) return parts[1];
  if (DIRS.has(parts[0])) return parts[0];
  return null;
}

export function isMovementCmd(cmd: string): boolean {
  return extractDirection(cmd) !== null;
}

const NARRATIVE_VERBS = new Set([
  'look', 'examine', 'x', 'l', 'inventory', 'inv', 'i', 'wait', 'help', 'stats',
  'take', 'drop', 'use', 'equip', 'unload', 'accept', 'rest', 'become',
  'save', 'load', 'buy', 'sell', 'talk', 'ask', 'shop',
]);

export const isNpcCmd = (cmd: string): boolean =>
  cmd.startsWith('talk ') || cmd.startsWith('ask ');

export function classifyLine(cmd: string, success: boolean): TerminalLine['type'] {
  if (!success) return 'error';
  if (isNpcCmd(cmd)) return 'npc';
  const verb = cmd.trim().toLowerCase().split(/\s+/)[0];
  if (DIRS.has(verb) || verb === 'go') return 'movement';
  if (verb === 'attack' || verb === 'fight') return 'combat';
  if (!NARRATIVE_VERBS.has(verb)) return 'combat'; // ability command
  return 'output';
}

export function extractSpeaker(text: string): string | undefined {
  const m = text.match(/^\*\*([^*]+)\*\*/);
  return m ? m[1] : undefined;
}
