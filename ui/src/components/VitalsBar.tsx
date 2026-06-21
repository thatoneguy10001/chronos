import { useGameStore } from '@/store/gameStore';

const utilBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border-input)',
  color: 'var(--text-muted)',
  fontFamily: 'inherit',
  fontSize: '0.65em',
  padding: '0.15rem 0.5rem',
  cursor: 'pointer',
  borderRadius: 2,
  letterSpacing: '0.06em',
};

export function VitalsBar({ devMode = false }: { devMode?: boolean }) {
  const ch = useGameStore(s => s.playerCharacter);
  const openSaveModal = useGameStore(s => s.openSaveModal);
  const openLoadModal = useGameStore(s => s.openLoadModal);
  const saves = useGameStore(s => s.saves);
  const hasSave = saves.some(Boolean);
  if (!ch) return null;

  const hpPct = ch.max_hp > 0 ? Math.max(0, Math.min(1, ch.hp / ch.max_hp)) : 0;
  const hpLow = ch.hp <= ch.max_hp * 0.3;
  const hpMed = ch.hp <= ch.max_hp * 0.6;
  const hpColor = hpLow ? 'var(--bar-hp-low)' : hpMed ? '#c8a040' : 'var(--bar-hp)';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      padding: '0.35rem 1.5rem',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-panel)',
      flexShrink: 0,
    }}>
      {/* HP label */}
      <span style={{ color: 'var(--text-label)', fontSize: '0.7em', letterSpacing: '0.08em', flexShrink: 0 }}>HP</span>

      {/* HP bar */}
      <div style={{ flex: 1, maxWidth: 240, position: 'relative', height: 10, background: 'var(--bar-bg)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${hpPct * 100}%`,
          background: hpColor,
          transition: 'width 0.3s, background 0.3s',
        }} />
      </div>

      {/* HP numbers */}
      <span style={{
        fontSize: '0.8em',
        color: hpLow ? 'var(--danger-low)' : 'var(--text)',
        fontVariantNumeric: 'tabular-nums',
        flexShrink: 0,
        minWidth: 70,
      }}>
        {ch.hp}<span style={{ color: 'var(--text-label)' }}>/{ch.max_hp}</span>
      </span>

      {/* Active effects */}
      {ch.active_effects.length > 0 && (
        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
          {ch.active_effects.map(fx => (
            <span key={fx} style={{
              fontSize: '0.65em',
              padding: '0.1rem 0.4rem',
              border: '1px solid var(--combat-text)',
              color: 'var(--combat-text)',
              borderRadius: 2,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}>{fx}</span>
          ))}
        </div>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Save / Load */}
      <button onClick={openSaveModal} style={utilBtnStyle}>SAVE</button>
      <button onClick={openLoadModal} disabled={!hasSave} style={{ ...utilBtnStyle, opacity: hasSave ? 1 : 0.4 }}>LOAD</button>

      {/* Dev mode indicator */}
      {devMode && (
        <span title="Dev mode active (Ctrl+D to toggle)" style={{
          fontSize: '0.6em',
          padding: '0.15rem 0.45rem',
          border: '1px solid var(--gold-dim)',
          color: 'var(--gold)',
          borderRadius: 2,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          cursor: 'default',
        }}>DEV</span>
      )}
    </div>
  );
}
