/**
 * StatusHeader — the framed window's top chrome. Replaces RoomHeader + VitalsBar.
 *
 * Two rows:
 *   • Utility line — world title (left) · time + DEV badge · SAVE/LOAD pills (right)
 *   • Status line  — current room (left) · HP bar + numbers + effect chips (right)
 */
import { useGameStore } from '@/store/gameStore';
import { pillButton } from '@/components/Panel';
import { formatGameTime } from '@/utils/time';

export function TimeBadge({ gameTime }: { gameTime: number }) {
  const { timeStr, dayStr, isNight } = formatGameTime(gameTime);
  return (
    <div style={{ fontSize: 'var(--fs-small)', color: isNight ? 'var(--time-night)' : 'var(--time-day)', textAlign: 'right', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
      <span>{isNight ? '☾' : '☀'}</span>
      <span style={{ marginLeft: 4 }}>{timeStr}</span>
      <span style={{ color: 'var(--text-faint)', marginLeft: 6 }}>{dayStr}</span>
    </div>
  );
}

export function StatusHeader({ devMode = false }: { devMode?: boolean }) {
  const worldTitle    = useGameStore(s => s.worldTitle);
  const roomName      = useGameStore(s => s.currentRoomName);
  const ch            = useGameStore(s => s.playerCharacter);
  const gameTime      = useGameStore(s => s.gameTime);
  const openSaveModal = useGameStore(s => s.openSaveModal);
  const openLoadModal = useGameStore(s => s.openLoadModal);
  const saves         = useGameStore(s => s.saves);
  const hasSave       = saves.some(Boolean);

  const hpPct  = ch && ch.max_hp > 0 ? Math.max(0, Math.min(1, ch.hp / ch.max_hp)) : 0;
  const hpLow  = ch ? ch.hp <= ch.max_hp * 0.3 : false;
  const hpMed  = ch ? ch.hp <= ch.max_hp * 0.6 : false;
  const hpColor = hpLow ? 'var(--bar-hp-low)' : hpMed ? '#c8a040' : 'var(--bar-hp)';

  return (
    <div style={{ borderBottom: '1px solid var(--ink-divider)', background: 'var(--parchment-mid)', flexShrink: 0 }}>
      {/* ── Utility line ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
        padding: '0.4rem var(--sp-4)',
        borderBottom: '1px solid var(--ink-divider)',
        fontFamily: 'var(--font-dossier)',
      }}>
        <span style={{ fontSize: '0.65em', letterSpacing: '0.15em', color: 'var(--ink-movement)', textTransform: 'uppercase' }}>
          {worldTitle || 'Project Chronos'}
        </span>
        <div style={{ flex: 1 }} />
        <TimeBadge gameTime={gameTime} />
        {devMode && (
          <span title="Dev mode active (Ctrl+D to toggle)" style={{
            fontSize: '0.6em', padding: '0.15rem 0.45rem',
            border: '1px solid var(--ink-movement)', color: 'var(--ink-movement)',
            borderRadius: 12, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'default',
          }}>DEV</span>
        )}
        <button onClick={openSaveModal} style={pillButton}>SAVE</button>
        <button onClick={openLoadModal} disabled={!hasSave} style={{ ...pillButton, opacity: hasSave ? 1 : 0.4 }}>LOAD</button>
      </div>

      {/* ── Status line ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
        padding: '0.45rem var(--sp-4)',
      }}>
        {roomName && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', flexShrink: 0 }}>
            <span style={{ color: 'var(--ink-movement)', opacity: 0.5 }}>▸</span>
            <span style={{ color: 'var(--ink-narrative)', fontWeight: 'bold', fontSize: '1.05em', fontFamily: 'var(--font-journal)' }}>
              {roomName}
            </span>
          </div>
        )}

        <div style={{ flex: 1 }} />

        {ch && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', fontFamily: 'var(--font-dossier)' }}>
            {ch.active_effects.length > 0 && (
              <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                {ch.active_effects.map(fx => (
                  <span key={fx} style={{
                    fontSize: '0.6em', padding: '0.1rem 0.4rem',
                    border: '1px solid var(--ink-combat)', color: 'var(--ink-combat)',
                    borderRadius: 12, letterSpacing: '0.05em', textTransform: 'uppercase',
                  }}>{fx}</span>
                ))}
              </div>
            )}
            <span style={{ color: 'var(--ink-faint)', fontSize: '0.65em', letterSpacing: '0.08em' }}>HP</span>
            <div style={{ width: 160, height: 7, background: 'rgba(46,26,8,0.15)', borderRadius: 1, overflow: 'hidden' }}>
              <div style={{ width: `${hpPct * 100}%`, height: '100%', background: hpColor, transition: 'width 0.3s, background 0.3s' }} />
            </div>
            <span style={{ fontSize: '0.75em', color: hpLow ? 'var(--danger-low)' : 'var(--ink-narrative)', fontVariantNumeric: 'tabular-nums', minWidth: 56 }}>
              {ch.hp}<span style={{ color: 'var(--ink-faint)' }}>/{ch.max_hp}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
