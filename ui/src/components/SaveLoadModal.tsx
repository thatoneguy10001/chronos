import { useEffect } from 'react';
import { useGameStore } from '@/store/gameStore';
import type { SaveSlot } from '@/store/gameStore';
import { NUM_SLOTS } from '@/store/gameStore';

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
        background: 'transparent',
        border: `1px solid ${disabled ? 'var(--empty)' : 'var(--save-dim)'}`,
        borderRadius: 4,
        padding: '0.75rem 1rem',
        marginBottom: '0.6rem',
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: 'monospace',
        textAlign: 'left',
        transition: 'border-color 0.12s, background 0.12s',
      }}
      onMouseEnter={e => {
        if (!disabled) {
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--save-accent)';
          (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
        }
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = disabled ? 'var(--empty)' : 'var(--save-dim)';
        (e.currentTarget as HTMLElement).style.background = 'transparent';
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: isEmpty ? 0 : '0.3rem' }}>
        <span style={{ color: disabled ? 'var(--disabled)' : 'var(--save-dim)', fontSize: '0.7em', letterSpacing: '0.1em' }}>
          SLOT {index + 1}
        </span>
        {slot && (
          <span style={{ color: 'var(--text-faint)', fontSize: '0.68em' }}>
            {formatSavedAt(slot.savedAt)}
          </span>
        )}
      </div>

      {isEmpty ? (
        <div style={{ color: 'var(--empty)', fontSize: '0.8em' }}>— empty —</div>
      ) : (
        <>
          <div style={{ color: 'var(--save-text)', fontSize: '0.88em', fontWeight: 'bold' }}>
            {slot.characterName}
            <span style={{ color: 'var(--save-text-dim)', fontWeight: 'normal', fontSize: '0.85em' }}> · {slot.classId}</span>
          </div>
          <div style={{ color: 'var(--save-text-dim)', fontSize: '0.72em', marginTop: '0.15rem' }}>
            {slot.worldTitle} · {humanizeRoomId(slot.roomId)} · tick {slot.tick}
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
        background: 'var(--bg-overlay)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        fontFamily: 'monospace',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg)',
          border: `1px solid var(--save-border)`,
          borderRadius: 4,
          padding: '1.5rem',
          width: 380,
          maxWidth: '90vw',
        }}
      >
        <div style={{ color: 'var(--save-dim)', fontSize: '0.7em', letterSpacing: '0.15em', marginBottom: '1.2rem' }}>
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

        <div style={{ color: 'var(--empty)', fontSize: '0.68em', marginTop: '0.8rem' }}>
          [1–{NUM_SLOTS}] select slot · [Esc] cancel
        </div>
      </div>
    </div>
  );
}
