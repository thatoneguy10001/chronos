import { useGameStore } from '@/store/gameStore';
import type { ActiveScreen } from '@/store/gameStore';

export function NavBar() {
  const activeScreen  = useGameStore(s => s.activeScreen);
  const setScreen     = useGameStore(s => s.setScreen);
  const enemies       = useGameStore(s => s.enemies);
  const currentRoomId = useGameStore(s => s.currentRoomId);

  const inCombat = enemies.some(e => e.hp > 0 && e.room_id === currentRoomId);

  type Tab = { id: ActiveScreen; label: string; icon: string };

  const tabs: Tab[] = [
    { id: inCombat ? 'combat' : 'explore', label: inCombat ? 'Combat' : 'Explore', icon: inCombat ? 'ti-sword' : 'ti-map-pin' },
    { id: 'inventory', label: 'Inventory', icon: 'ti-backpack' },
    { id: 'character', label: 'Character', icon: 'ti-user' },
  ];

  const isFirstTabActive = activeScreen === 'explore' || activeScreen === 'combat';

  return (
    <div style={{
      borderTop: '1px solid var(--ui-gold-border)',
      display: 'flex',
      fontFamily: 'var(--font-dossier)',
      background: 'var(--ui-bg-2)',
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
              background: isActive ? 'rgba(200,168,74,0.05)' : 'transparent',
              border: 'none',
              borderRight: i < tabs.length - 1 ? '1px solid var(--ui-gold-border)' : 'none',
              borderTop: isActive ? '2px solid var(--ui-gold)' : '2px solid transparent',
              color: isActive ? 'var(--ui-gold)' : 'var(--ui-dim)',
              fontFamily: 'var(--font-dossier)',
              fontSize: 9,
              padding: '9px 12px',
              cursor: 'pointer',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              transition: 'color 0.1s, background 0.1s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
            onMouseEnter={e => {
              if (!isActive) {
                (e.currentTarget as HTMLElement).style.color = 'var(--ui-cream)';
                (e.currentTarget as HTMLElement).style.background = 'rgba(200,168,74,0.03)';
              }
            }}
            onMouseLeave={e => {
              if (!isActive) {
                (e.currentTarget as HTMLElement).style.color = 'var(--ui-dim)';
                (e.currentTarget as HTMLElement).style.background = 'transparent';
              }
            }}
          >
            <i className={`ti ${tab.icon}`} aria-hidden="true" style={{ fontSize: 12 }} />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
