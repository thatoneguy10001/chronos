import type { BuildDraft } from '@/store/buildStore';

/**
 * World file format — the portable, shareable artifact of Build Mode.
 *
 * A `.chronos-world.json` file wraps the **draft** (Build Mode's source of truth),
 * not the engine JSON. That's deliberate: the draft re-imports losslessly so a
 * shared world can be edited again, and the runnable world is derived from it on
 * demand by `serializeWorld` (the same path Test Play uses). One source of truth,
 * no inverse-serializer to keep in sync.
 *
 * The `format`/`version` envelope is the contract for sharing: a reader can tell a
 * Chronos world from any other JSON, and refuse a file newer than it understands.
 */

export const WORLD_FILE_FORMAT = 'chronos-world';
export const WORLD_FILE_VERSION = 1;

export interface WorldFile {
  format: string;
  version: number;
  title: string;
  draft: BuildDraft;
}

/** Serialize a draft into a pretty-printed world file string, ready to download. */
export function serializeWorldFile(draft: BuildDraft, title = 'Your World'): string {
  const file: WorldFile = {
    format: WORLD_FILE_FORMAT,
    version: WORLD_FILE_VERSION,
    title: title.trim() || 'Your World',
    draft,
  };
  return JSON.stringify(file, null, 2);
}

/** A filesystem-safe filename for a world title, e.g. "Iron & Blood" → iron-blood. */
export function worldFileName(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'world'}.chronos-world.json`;
}

export type ParseResult =
  | { ok: true; draft: BuildDraft; title: string }
  | { ok: false; error: string };

/**
 * Parse and validate a world file's text back into a draft.
 *
 * Defends the importer against the three things that actually go wrong with a
 * pasted/uploaded file: it isn't JSON, it isn't a Chronos world, or it's a newer
 * format than this build understands. Missing arrays are filled with empty
 * defaults so a sparse or older export still loads instead of crashing an editor.
 */
export function parseWorldFile(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "That doesn't look like a world file — it isn't valid JSON." };
  }

  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'That file is empty or not a world file.' };
  }
  const obj = raw as Record<string, unknown>;

  if (obj.format !== WORLD_FILE_FORMAT) {
    return { ok: false, error: 'That JSON is not a Chronos world file.' };
  }
  if (typeof obj.version === 'number' && obj.version > WORLD_FILE_VERSION) {
    return {
      ok: false,
      error: `This world was made with a newer version (v${obj.version}). Update to open it.`,
    };
  }
  if (typeof obj.draft !== 'object' || obj.draft === null) {
    return { ok: false, error: 'That world file is missing its contents.' };
  }

  const d = obj.draft as Record<string, unknown>;
  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const draft: BuildDraft = {
    layers: arr<string>(d.layers),
    rooms: arr<BuildDraft['rooms'][number]>(d.rooms),
    startRoomId: typeof d.startRoomId === 'string' ? d.startRoomId : null,
    npcs: arr<BuildDraft['npcs'][number]>(d.npcs),
    items: arr<BuildDraft['items'][number]>(d.items),
    classes: arr<BuildDraft['classes'][number]>(d.classes),
    quests: arr<BuildDraft['quests'][number]>(d.quests),
  };

  const title = typeof obj.title === 'string' && obj.title.trim() ? obj.title : 'Imported World';
  return { ok: true, draft, title };
}
