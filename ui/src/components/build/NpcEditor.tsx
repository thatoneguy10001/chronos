import { useBuildStore } from '@/store/buildStore';
import type { DraftNpc, DraftRoom } from '@/store/buildStore';

/**
 * NPC & Dialogue editor — the people in your world and what they say.
 *
 * Each NPC stands in one of the rooms from the map, opens with a greeting, and
 * answers a set of topics: the player types a keyword, the NPC gives the matching
 * response. Placement is chosen from the rooms that exist, so an NPC can't be
 * stranded in a room that was deleted.
 */
export function NpcEditor({ onBack }: { onBack: () => void }) {
  const npcs = useBuildStore(s => s.draft.npcs);
  const rooms = useBuildStore(s => s.draft.rooms);
  const addNpc = useBuildStore(s => s.addNpc);
  const validateNpcs = useBuildStore(s => s.validateNpcs);
  const errors = validateNpcs();

  const labelStyle = {
    color: 'var(--ink-faint)',
    fontSize: '0.7em',
    letterSpacing: '0.15em',
    fontFamily: 'var(--font-dossier)' as const,
  };

  return (
    <div style={{ width: 'min(640px, 100%)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={labelStyle}>{npcs.length} NPC{npcs.length === 1 ? '' : 'S'}</span>
        <button
          onClick={() => addNpc()}
          disabled={rooms.length === 0}
          title={rooms.length === 0 ? 'Add a room first' : undefined}
          style={{
            background: 'transparent',
            border: '1px solid var(--ink-narrative)',
            color: 'var(--ink-narrative)',
            fontFamily: 'var(--font-dossier)',
            fontSize: '0.8em',
            padding: '0.4rem 1rem',
            cursor: rooms.length === 0 ? 'default' : 'pointer',
            opacity: rooms.length === 0 ? 0.5 : 1,
          }}
        >
          + ADD NPC
        </button>
      </div>

      {rooms.length === 0 && (
        <div style={{ color: 'var(--ink-movement)', fontSize: '0.85em', fontStyle: 'italic' }}>
          Add a room first — NPCs need somewhere to stand.
        </div>
      )}
      {rooms.length > 0 && npcs.length === 0 && (
        <div style={{ color: 'var(--ink-movement)', fontSize: '0.85em', fontStyle: 'italic' }}>
          No NPCs yet — add someone for the player to meet.
        </div>
      )}

      {npcs.map(npc => (
        <NpcCard key={npc.id} npc={npc} rooms={rooms} />
      ))}

      <div style={{ marginTop: '0.5rem', color: errors.length ? 'var(--error)' : 'var(--ink-movement)', fontSize: '0.78em', fontFamily: 'var(--font-dossier)' }}>
        {errors.length === 0 ? '✓ Cast is valid — the engine will accept this.' : errors.join('  ')}
      </div>

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

function NpcCard({ npc, rooms }: { npc: DraftNpc; rooms: DraftRoom[] }) {
  const updateNpc = useBuildStore(s => s.updateNpc);
  const removeNpc = useBuildStore(s => s.removeNpc);
  const addDialogue = useBuildStore(s => s.addDialogue);
  const updateDialogue = useBuildStore(s => s.updateDialogue);
  const removeDialogue = useBuildStore(s => s.removeDialogue);

  const inputStyle = {
    background: 'rgba(255,255,255,0.4)',
    border: '1px solid var(--ink-faint)',
    borderRadius: 2,
    color: 'var(--ink-narrative)',
    fontFamily: 'var(--font-journal)',
    padding: '0.35rem 0.5rem',
    fontSize: '0.9em',
  } as const;

  return (
    <div style={{ border: '1px solid var(--ink-faint)', borderRadius: 2, padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
        <input
          value={npc.name}
          onChange={e => updateNpc(npc.id, { name: e.target.value })}
          placeholder="NPC name"
          style={{ ...inputStyle, flex: 1, fontWeight: 600 }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--ink-movement)', fontSize: '0.72em', fontFamily: 'var(--font-dossier)' }}>
          in
          <select
            value={npc.roomId ?? ''}
            onChange={e => updateNpc(npc.id, { roomId: e.target.value || null })}
            style={{ ...inputStyle, fontSize: '0.8em' }}
          >
            <option value="">— nowhere —</option>
            {rooms.map(r => (
              <option key={r.id} value={r.id}>{r.name || r.id}</option>
            ))}
          </select>
        </label>
        <button onClick={() => removeNpc(npc.id)} title="Delete NPC" style={{ background: 'transparent', border: 'none', color: 'var(--ink-faint)', cursor: 'pointer', fontSize: '1.1em', padding: '0 0.3rem' }}>✕</button>
      </div>

      <textarea
        value={npc.greeting}
        onChange={e => updateNpc(npc.id, { greeting: e.target.value })}
        placeholder="Greeting — the first thing they say when the player talks to them."
        rows={2}
        style={{ ...inputStyle, resize: 'vertical', fontSize: '0.82em' }}
      />

      {/* Dialogue topics */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {npc.dialogue.map((line, i) => (
          <div key={i} style={{ display: 'flex', gap: '0.4rem', alignItems: 'flex-start' }}>
            <input
              value={line.keyword}
              onChange={e => updateDialogue(npc.id, i, { keyword: e.target.value })}
              placeholder="topic (e.g. war)"
              style={{ ...inputStyle, fontSize: '0.8em', width: 140 }}
            />
            <textarea
              value={line.response}
              onChange={e => updateDialogue(npc.id, i, { response: e.target.value })}
              placeholder="What they say about it."
              rows={2}
              style={{ ...inputStyle, fontSize: '0.8em', flex: 1, resize: 'vertical' }}
            />
            <button onClick={() => removeDialogue(npc.id, i)} title="Remove topic" style={{ background: 'transparent', border: 'none', color: 'var(--ink-faint)', cursor: 'pointer', padding: '0.3rem' }}>✕</button>
          </div>
        ))}
        <button
          onClick={() => addDialogue(npc.id, { keyword: '', response: '' })}
          style={{ alignSelf: 'flex-start', background: 'transparent', border: 'none', color: 'var(--ink-movement)', fontFamily: 'var(--font-dossier)', fontSize: '0.72em', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
        >
          + add topic
        </button>
      </div>
    </div>
  );
}
