import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';

export function TimelineDebugPanel() {
  const currentTick = useGameStore(s => s.currentTick);
  const maxTick = useGameStore(s => s.maxTick);
  const rewindToTick = useGameStore(s => s.rewindToTick);
  const resumeFromRewind = useGameStore(s => s.resumeFromRewind);
  const isRewound = useGameStore(s => s.isRewound);
  const [open, setOpen] = useState(false);

  return (
    <div style={{
      borderTop: '1px solid var(--border)',
      background: 'var(--bg-panel)',
      fontSize: '0.8em',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          color: 'var(--text-ui)',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          padding: '0.4rem 1.5rem',
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>⏱ TIME-TRAVEL DEBUG</span>
        <span>tick {currentTick} / {maxTick}  {open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '0.5rem 1.5rem 0.75rem' }}>
          {maxTick === 0 ? (
            <span style={{ color: 'var(--disabled)' }}>No history yet.</span>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                <span style={{ color: 'var(--text-ui)', minWidth: '3ch' }}>0</span>
                <input
                  type="range"
                  min={0}
                  max={maxTick}
                  value={currentTick}
                  onChange={e => rewindToTick(Number(e.target.value))}
                  style={{
                    flex: 1,
                    accentColor: 'var(--text)',
                    cursor: 'pointer',
                  }}
                />
                <span style={{ color: 'var(--text-ui)', minWidth: `${String(maxTick).length}ch` }}>{maxTick}</span>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <SliderButton onClick={() => rewindToTick(0)} disabled={currentTick === 0}>
                  ⏮ Start
                </SliderButton>
                <SliderButton
                  onClick={() => rewindToTick(Math.max(0, currentTick - 1))}
                  disabled={currentTick === 0}
                >
                  ◀ -1
                </SliderButton>
                <SliderButton
                  onClick={() => rewindToTick(Math.min(maxTick, currentTick + 1))}
                  disabled={currentTick >= maxTick}
                >
                  +1 ▶
                </SliderButton>
                {isRewound && (
                  <SliderButton onClick={resumeFromRewind}>
                    ▶▶ Resume Latest
                  </SliderButton>
                )}
                <div style={{ flex: 1 }} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SliderButton({
  onClick,
  disabled = false,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'transparent',
        border: '1px solid var(--border-input)',
        color: disabled ? 'var(--disabled)' : 'var(--text-muted)',
        fontFamily: 'inherit',
        fontSize: 'inherit',
        padding: '0.25rem 0.6rem',
        cursor: disabled ? 'default' : 'pointer',
        borderRadius: '2px',
      }}
    >
      {children}
    </button>
  );
}
