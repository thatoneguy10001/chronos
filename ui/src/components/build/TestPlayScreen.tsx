import { useBuildStore } from '@/store/buildStore';
import { serializeWorld } from '@/build/serialize';
import type { SerializedWorld } from '@/build/serialize';

/**
 * Test Play — one click to drop into the world you've been building.
 *
 * This is the moment the whole platform promise pays off: the draft is serialized
 * to the exact JSON the engine loads (via the shared `serializeWorld`), handed to a
 * fresh in-browser engine, and you play it on the same screens Iron & Blood uses.
 *
 * Before launching we run every editor's validator plus the two things the engine
 * strictly needs — a start room and at least one playable class — and only enable
 * the button when the world will actually boot. Whatever passes here is, byte for
 * byte, what Export (#46) writes out.
 */
export function TestPlayScreen({
  onBack,
  onTestPlay,
}: {
  onBack: () => void;
  onTestPlay: (world: SerializedWorld) => void;
}) {
  const draft = useBuildStore(s => s.draft);
  const validate = useBuildStore(s => s.validate);
  const validateRooms = useBuildStore(s => s.validateRooms);
  const validateNpcs = useBuildStore(s => s.validateNpcs);
  const validateContent = useBuildStore(s => s.validateContent);
  const validateQuests = useBuildStore(s => s.validateQuests);

  const playableCount = draft.classes.filter(c => c.role === 'playable').length;

  // Readiness checks. `blocking` ones must pass before the world can boot; the
  // editor validators are folded in so a dangling reference can't crash Test Play.
  const checks: { label: string; ok: boolean; blocking: boolean }[] = [
    { label: 'At least one room', ok: draft.rooms.length > 0, blocking: true },
    { label: 'A start room is set', ok: !!draft.startRoomId, blocking: true },
    { label: 'At least one playable class', ok: playableCount > 0, blocking: true },
    { label: 'Map is valid', ok: validateRooms().length === 0, blocking: true },
    { label: 'Content is valid', ok: validateContent().length === 0, blocking: true },
    { label: 'Quests are valid', ok: validateQuests().length === 0, blocking: true },
    { label: 'NPCs are valid', ok: validateNpcs().length === 0, blocking: true },
    { label: 'Layer stack is valid', ok: validate().length === 0, blocking: true },
  ];

  const blockers = checks.filter(c => c.blocking && !c.ok);
  const canPlay = blockers.length === 0;

  return (
    <div style={{ width: 'min(560px, 100%)', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ color: 'var(--ink-movement)', fontSize: '0.88em', lineHeight: 1.5, fontFamily: 'var(--font-dossier)' }}>
        Drop straight into your world and play it on the real game screens. The same
        engine that runs Iron &amp; Blood will run yours — this is exactly how a player
        will experience it.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {checks.map(c => (
          <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85em', color: c.ok ? 'var(--ink-narrative)' : 'var(--error)' }}>
            <span style={{ width: '1.1em', display: 'inline-block' }}>{c.ok ? '✓' : '✗'}</span>
            {c.label}
          </div>
        ))}
      </div>

      {!canPlay && (
        <div style={{ color: 'var(--error)', fontSize: '0.78em', fontFamily: 'var(--font-dossier)' }}>
          Fix the items marked ✗ in their editors, then come back to play.
        </div>
      )}

      <div style={{ color: 'var(--ink-faint)', fontSize: '0.72em', fontStyle: 'italic', lineHeight: 1.5 }}>
        Note: while a dedicated placement step doesn't exist yet, every enemy you've
        made is dropped into the start room so you can fight them. Test runs aren't
        saved.
      </div>

      <button
        onClick={() => onTestPlay(serializeWorld(draft))}
        disabled={!canPlay}
        style={{
          alignSelf: 'flex-start',
          background: canPlay ? 'var(--ink-narrative)' : 'transparent',
          border: '1px solid var(--ink-narrative)',
          color: canPlay ? 'var(--parchment)' : 'var(--ink-faint)',
          fontFamily: 'var(--font-dossier)',
          fontSize: '0.95em',
          padding: '0.6rem 1.6rem',
          cursor: canPlay ? 'pointer' : 'default',
          letterSpacing: '0.1em',
          opacity: canPlay ? 1 : 0.6,
        }}
      >
        ▶ PLAY THIS WORLD
      </button>

      <button
        onClick={onBack}
        style={{
          alignSelf: 'flex-start',
          background: 'transparent',
          border: '1px solid var(--ink-faint)',
          color: 'var(--ink-narrative)',
          fontFamily: 'var(--font-dossier)',
          fontSize: '0.8em',
          padding: '0.5rem 1.5rem',
          cursor: 'pointer',
          letterSpacing: '0.12em',
        }}
      >
        ← BUILD SECTIONS
      </button>
    </div>
  );
}
