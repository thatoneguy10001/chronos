import { useGameStore } from '@/store/gameStore';
import type { ActiveScreen } from '@/store/gameStore';

export function NavBar() {
  const activeScreen  = useGameStore(s => s.activeScreen);
  const setScreen     = useGameStore(s => s.setScreen);
  const enemies       = useGameStore(s => s.enemies);
  const currentRoomId = useGameStore(s => s.currentRoomId);

  const inCombat = enemies.some(e => e.hp > 0 && e.room_id === currentRoomId);

  type Tab = { id: ActiveScreen; label: string };

  const tabs: Tab[] = [
    { id: inCombat ? 'combat' : 'explore', label: inCombat ? 'Combat' : 'Explore' },
    { id: 'inventory', label: 'Inventory' },
    { id: 'character', label: 'Character' },
  ];

  const isFirstTabActive = activeScreen === 'explore' || activeScreen === 'combat';

  return (
    <div style={{
      borderTop: '1px solid var(--ink-divider)',
      display: 'flex',
      fontFamily: 'var(--font-dossier)',
      background: 'var(--parchment-mid)',
      flexShrink: 0,
    }}>
      {tabs.map((tab, i) => {
        const isActive = i === 0 ? isFirstTabActive : activeScreen === tab.id;
        return (
          <button
            key={tab.label}
            onClick={() => setScreen(tab.id)}
            style={{
              flex: 1,
              background: isActive ? 'rgba(46,26,8,0.12)' : 'transparent',
              border: 'none',
              borderRight: i < tabs.length - 1 ? '1px solid var(--ink-divider)' : 'none',
              borderTop: isActive ? '2px solid var(--ink-movement)' : '2px solid transparent',
              color: isActive ? 'var(--ink-narrative)' : 'var(--ink-faint)',
              fontFamily: 'var(--font-dossier)',
              fontSize: '0.68em',
              padding: '0.5rem 0.75rem',
              cursor: 'pointer',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              transition: 'color 0.1s, background 0.1s',
            }}
            onMouseEnter={e => {
              if (!isActive) {
                (e.currentTarget as HTMLElement).style.color = 'var(--ink-narrative)';
                (e.currentTarget as HTMLElement).style.background = 'rgba(46,26,8,0.06)';
              }
            }}
            onMouseLeave={e => {
              if (!isActive) {
                (e.currentTarget as HTMLElement).style.color = 'var(--ink-faint)';
                (e.currentTarget as HTMLElement).style.background = 'transparent';
              }
            }}
          >
            {inCombat && i === 0 && (
              <span style={{ marginRight: '0.35em', color: 'var(--ink-combat)', fontSize: '0.9em' }}>⚔</span>
            )}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
