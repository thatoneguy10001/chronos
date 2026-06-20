import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';

export function TimelineDebugPanel() {
  const currentTick = useGameStore(s => s.currentTick);
  const maxTick = useGameStore(s => s.maxTick);
  const rewindToTick = useGameStore(s => s.rewindToTick);
  const resumeFromRewind = useGameStore(s => s.resumeFromRewind);
  const isRewound = useGameStore(s => s.isRewound);
  const saveGame = useGameStore(s => s.saveGame);
  const loadGame = useGameStore(s => s.loadGame);
  const hasSave = useGameStore(s => s.hasSave);
  const [open, setOpen] = useState(false);

  return (
    <div style={{
      borderTop: '1px solid #1a2a1a',
      background: '#030303',
      fontSize: '0.8em',
    }}>
      {/* Collapse toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          color: '#555',
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
            <span style={{ color: '#444' }}>No history yet.</span>
          ) : (
            <>
              {/* Timeline slider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                <span style={{ color: '#555', minWidth: '3ch' }}>0</span>
                <input
                  type="range"
                  min={0}
                  max={maxTick}
                  value={currentTick}
                  onChange={e => rewindToTick(Number(e.target.value))}
                  style={{
                    flex: 1,
                    accentColor: '#c8ffb0',
                    cursor: 'pointer',
                  }}
                />
                <span style={{ color: '#555', minWidth: `${String(maxTick).length}ch` }}>{maxTick}</span>
              </div>

              {/* Controls */}
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
                <SliderButton onClick={saveGame} disabled={maxTick === 0}>
                  💾 Save
                </SliderButton>
                <SliderButton onClick={loadGame} disabled={!hasSave}>
                  📂 Load
                </SliderButton>
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
        border: '1px solid #2a4a2a',
        color: disabled ? '#333' : '#888',
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
