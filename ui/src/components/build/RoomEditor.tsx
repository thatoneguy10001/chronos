import { EXIT_DIRECTIONS, useBuildStore } from '@/store/buildStore';
import type { DraftRoom } from '@/store/buildStore';

/**
 * Room & Map editor — the `space` layer's content.
 *
 * Author the world's locations and the exits that connect them. Each room has a
 * name + description; exits are (direction → target room) pairs chosen from the
 * rooms that exist, so an exit can't point at nothing. One room is the spawn
 * point. This is the graph the player walks through.
 */
export function RoomEditor({ onBack }: { onBack: () => void }) {
  const rooms = useBuildStore(s => s.draft.rooms);
  const startRoomId = useBuildStore(s => s.draft.startRoomId);
  const addRoom = useBuildStore(s => s.addRoom);
  const validateRooms = useBuildStore(s => s.validateRooms);
  const errors = validateRooms();

  const labelStyle = {
    color: 'var(--ink-faint)',
    fontSize: '0.7em',
    letterSpacing: '0.15em',
    fontFamily: 'var(--font-dossier)' as const,
  };

  return (
    <div style={{ width: 'min(640px, 100%)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={labelStyle}>{rooms.length} ROOM{rooms.length === 1 ? '' : 'S'}</span>
        <button
          onClick={() => addRoom()}
          style={{
            background: 'transparent',
            border: '1px solid var(--ink-narrative)',
            color: 'var(--ink-narrative)',
            fontFamily: 'var(--font-dossier)',
            fontSize: '0.8em',
            padding: '0.4rem 1rem',
            cursor: 'pointer',
          }}
        >
          + ADD ROOM
        </button>
      </div>

      {rooms.length === 0 && (
        <div style={{ color: 'var(--ink-movement)', fontSize: '0.85em', fontStyle: 'italic' }}>
          No rooms yet — add one to start laying out your world.
        </div>
      )}

      {rooms.map(room => (
        <RoomCard key={room.id} room={room} rooms={rooms} isStart={startRoomId === room.id} />
      ))}

      <div style={{ marginTop: '0.5rem', color: errors.length ? 'var(--error)' : 'var(--ink-movement)', fontSize: '0.78em', fontFamily: 'var(--font-dossier)' }}>
        {errors.length === 0 ? '✓ Map is valid — the engine will accept this.' : errors.join('  ')}
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

function RoomCard({ room, rooms, isStart }: { room: DraftRoom; rooms: DraftRoom[]; isStart: boolean }) {
  const updateRoom = useBuildStore(s => s.updateRoom);
  const removeRoom = useBuildStore(s => s.removeRoom);
  const setStartRoom = useBuildStore(s => s.setStartRoom);
  const addExit = useBuildStore(s => s.addExit);
  const updateExit = useBuildStore(s => s.updateExit);
  const removeExit = useBuildStore(s => s.removeExit);

  const inputStyle = {
    background: 'rgba(255,255,255,0.4)',
    border: '1px solid var(--ink-faint)',
    borderRadius: 2,
    color: 'var(--ink-narrative)',
    fontFamily: 'var(--font-journal)',
    padding: '0.35rem 0.5rem',
    fontSize: '0.9em',
  } as const;

  const otherRooms = rooms.filter(r => r.id !== room.id);

  return (
    <div style={{ border: '1px solid var(--ink-faint)', borderRadius: 2, padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
        <input
          value={room.name}
          onChange={e => updateRoom(room.id, { name: e.target.value })}
          placeholder="Room name"
          style={{ ...inputStyle, flex: 1, fontWeight: 600 }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--ink-movement)', fontSize: '0.72em', fontFamily: 'var(--font-dossier)', cursor: 'pointer' }}>
          <input type="radio" checked={isStart} onChange={() => setStartRoom(room.id)} style={{ accentColor: 'var(--ink-narrative)' }} />
          START
        </label>
        <button
          onClick={() => removeRoom(room.id)}
          title="Delete room"
          style={{ background: 'transparent', border: 'none', color: 'var(--ink-faint)', cursor: 'pointer', fontSize: '1.1em', padding: '0 0.3rem' }}
        >
          ✕
        </button>
      </div>

      <textarea
        value={room.description}
        onChange={e => updateRoom(room.id, { description: e.target.value })}
        placeholder="Describe this room — what the player sees when they arrive."
        rows={2}
        style={{ ...inputStyle, resize: 'vertical', fontSize: '0.82em' }}
      />

      {/* Exits */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {room.exits.map((exit, i) => (
          <div key={i} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <span style={{ color: 'var(--ink-faint)', fontSize: '0.75em', fontFamily: 'var(--font-dossier)' }}>go</span>
            <select value={exit.direction} onChange={e => updateExit(room.id, i, { direction: e.target.value })} style={{ ...inputStyle, fontSize: '0.8em' }}>
              {EXIT_DIRECTIONS.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <span style={{ color: 'var(--ink-faint)', fontSize: '0.75em', fontFamily: 'var(--font-dossier)' }}>→</span>
            <select value={exit.target} onChange={e => updateExit(room.id, i, { target: e.target.value })} style={{ ...inputStyle, fontSize: '0.8em', flex: 1 }}>
              <option value="">— choose room —</option>
              {otherRooms.map(r => (
                <option key={r.id} value={r.id}>{r.name || r.id}</option>
              ))}
            </select>
            <button onClick={() => removeExit(room.id, i)} title="Remove exit" style={{ background: 'transparent', border: 'none', color: 'var(--ink-faint)', cursor: 'pointer', padding: '0 0.3rem' }}>✕</button>
          </div>
        ))}
        <button
          onClick={() => addExit(room.id, { direction: firstUnusedDirection(room), target: '' })}
          disabled={otherRooms.length === 0}
          style={{
            alignSelf: 'flex-start',
            background: 'transparent',
            border: 'none',
            color: otherRooms.length === 0 ? 'var(--ink-faint)' : 'var(--ink-movement)',
            fontFamily: 'var(--font-dossier)',
            fontSize: '0.72em',
            cursor: otherRooms.length === 0 ? 'default' : 'pointer',
            textDecoration: 'underline',
            padding: 0,
            opacity: otherRooms.length === 0 ? 0.5 : 1,
          }}
        >
          + add exit{otherRooms.length === 0 ? ' (need another room)' : ''}
        </button>
      </div>
    </div>
  );
}

// Pick a direction the room isn't already using, so new exits don't all stack on
// "north". Falls back to the first direction if all are taken.
function firstUnusedDirection(room: DraftRoom): string {
  const used = new Set(room.exits.map(e => e.direction));
  return EXIT_DIRECTIONS.find(d => !used.has(d)) ?? EXIT_DIRECTIONS[0];
}
