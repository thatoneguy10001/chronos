import { useGameStore } from '@/store/gameStore';

export function RoomHeader() {
  const roomName = useGameStore(s => s.currentRoomName);

  if (!roomName) return null;

  return (
    <div style={{
      padding: '0.4rem 1.5rem',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-panel)',
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
    }}>
      <span style={{ color: 'var(--ent-place)', fontSize: '0.75em', letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.7 }}>
        Location
      </span>
      <span style={{ color: 'var(--ent-place)', fontWeight: 'bold', fontSize: '0.9em' }}>
        {roomName}
      </span>
    </div>
  );
}
