import { useEffect } from 'react';
import { useGameStore } from '@/store/gameStore';
import type { SaveSlot } from '@/store/gameStore';
import { NUM_SLOTS } from '@/store/gameStore';
import { formatGameTime } from '@/components/StatusHeader';

function formatSlotTime(tick: number): string {
  const { timeStr, dayStr } = formatGameTime(tick);
  return `${timeStr} · ${dayStr}`;
}

function formatSavedAt(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function humanizeRoomId(id: string): string {
  return id.replace(/_/g, ' ');
}

function SlotCard({
  index,
  slot,
  mode,
  onClick,
}: {
  index: number;
  slot: SaveSlot | null;
  mode: 'save' | 'load';
  onClick: () => void;
}) {
  const isEmpty = slot === null;
  const disabled = mode === 'load' && isEmpty;

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        display: 'block',
        width: '100%',
        background: disabled ? 'transparent' : 'rgba(46,26,8,0.03)',
        border: `1px solid ${disabled ? 'rgba(46,26,8,0.15)' : 'rgba(46,26,8,0.3)'}`,
        borderRadius: 3,
        padding: '0.75rem 1rem',
        marginBottom: '0.6rem',
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: 'var(--font-dossier)',
        textAlign: 'left',
        transition: 'border-color 0.12s, background 0.12s',
      }}
      onMouseEnter={e => {
        if (!disabled) {
          (e.currentTarget as HTMLElement).style.borderColor = 'rgba(46,26,8,0.6)';
          (e.currentTarget as HTMLElement).style.background = 'rgba(46,26,8,0.08)';
        }
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = disabled ? 'rgba(46,26,8,0.15)' : 'rgba(46,26,8,0.3)';
        (e.currentTarget as HTMLElement).style.background = disabled ? 'transparent' : 'rgba(46,26,8,0.03)';
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: isEmpty ? 0 : '0.3rem' }}>
        <span style={{ color: disabled ? 'var(--ink-faint)' : 'var(--ink-movement)', fontSize: '0.68em', letterSpacing: '0.12em', opacity: disabled ? 0.4 : 0.7 }}>
          SLOT {index + 1}
        </span>
        {slot && (
          <span style={{ color: 'var(--ink-faint)', fontSize: '0.68em' }}>
            {formatSavedAt(slot.savedAt)}
          </span>
        )}
      </div>

      {isEmpty ? (
        <div style={{ color: 'var(--ink-faint)', fontSize: '0.8em', fontStyle: 'italic', opacity: 0.5 }}>— empty —</div>
      ) : (
        <>
          <div style={{ color: 'var(--ink-narrative)', fontSize: '0.9em', fontWeight: '600', fontFamily: 'var(--font-journal)' }}>
            {slot.characterName}
            <span style={{ color: 'var(--ink-movement)', fontWeight: 'normal', fontSize: '0.85em', fontFamily: 'var(--font-dossier)' }}> · {slot.classId}</span>
          </div>
          <div style={{ color: 'var(--ink-faint)', fontSize: '0.72em', marginTop: '0.15rem' }}>
            {slot.worldTitle} · {slot.roomName ?? humanizeRoomId(slot.roomId)} · {formatSlotTime(slot.tick)}
          </div>
        </>
      )}
    </button>
  );
}

export function SaveLoadModal() {
  const mode         = useGameStore(s => s.saveModalMode);
  const saves        = useGameStore(s => s.saves);
  const closeSaveModal = useGameStore(s => s.closeSaveModal);
  const saveToSlot   = useGameStore(s => s.saveToSlot);
  const loadFromSlot = useGameStore(s => s.loadFromSlot);

  useEffect(() => {
    if (!mode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSaveModal();
      if (e.key >= '1' && e.key <= String(NUM_SLOTS)) {
        const idx = parseInt(e.key) - 1;
        if (mode === 'save') saveToSlot(idx);
        else if (saves[idx]) loadFromSlot(idx);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mode, saves, closeSaveModal, saveToSlot, loadFromSlot]);

  if (!mode) return null;

  const title = mode === 'save' ? 'SAVE GAME' : 'LOAD GAME';

  return (
    <div
      onClick={closeSaveModal}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(20,16,8,0.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        fontFamily: 'var(--font-dossier)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "url('/textures/teastain%20102.png') center/cover no-repeat var(--parchment-cream)",
          border: '1px solid rgba(46,26,8,0.35)',
          borderRadius: 3,
          padding: '1.5rem',
          width: 380,
          maxWidth: '90vw',
          transform: 'rotate(-0.4deg)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ color: 'var(--ink-faint)', fontSize: '0.68em', letterSpacing: '0.18em', marginBottom: '1.2rem' }}>
          ── {title} ──
        </div>

        {Array.from({ length: NUM_SLOTS }, (_, i) => (
          <SlotCard
            key={i}
            index={i}
            slot={saves[i]}
            mode={mode}
            onClick={() => mode === 'save' ? saveToSlot(i) : loadFromSlot(i)}
          />
        ))}

        <div style={{ color: 'var(--ink-faint)', fontSize: '0.65em', marginTop: '0.8rem', opacity: 0.6 }}>
          [1–{NUM_SLOTS}] select slot · [Esc] cancel
        </div>
      </div>
    </div>
  );
}
