import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import type { ActiveScreen } from '@/store/gameStore';

const SCREEN_LABEL: Record<ActiveScreen, string> = {
  explore:   '',        // replaced by room name
  combat:    'Combat',
  inventory: 'Inventory',
  character: 'Character',
};

function formatTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

const HELP_SECTIONS: [string, string][] = [
  ['Navigate',            'Click Exit cards in the main grid, or the direction badges in the sidebar.'],
  ['Interact',            'Click any card to perform that action — talk to NPCs, pick up items, accept quests. Topic cards appear mid-conversation.'],
  ['Combat',              'The screen switches automatically when enemies are nearby. Choose Attack, an Ability, or open Inventory to use an item.'],
  ['Inventory & Stats',   'Use the tabs at the bottom to browse gear, items, and your character sheet.'],
  ['Save & Load',         'Top-right buttons save your progress or restore a previous save.'],
  ['Journal',             'Press J at any time to open the journal for lore and quest notes.'],
];

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--ui-bg-2)',
          border: '1px solid var(--ui-gold-border)',
          borderTop: '2px solid var(--ui-gold-dim)',
          borderRadius: 2, padding: '20px 24px',
          maxWidth: 460, width: '90%',
          fontFamily: 'var(--font-dossier)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 11, letterSpacing: '0.2em', color: 'var(--ui-gold)', textTransform: 'uppercase' }}>
            How to Play
          </span>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--ui-dim)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0 }}
          >
            ×
          </button>
        </div>
        {HELP_SECTIONS.map(([title, body]) => (
          <div key={title} style={{ marginBottom: 11 }}>
            <div style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--ui-gold-dim)', textTransform: 'uppercase', marginBottom: 3 }}>
              {title}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ui-dim)', lineHeight: 1.55, fontFamily: 'Georgia, serif' }}>
              {body}
            </div>
          </div>
        ))}
        <div style={{ marginTop: 14, paddingTop: 11, borderTop: '1px solid var(--ui-gold-border)', fontSize: 9.5, color: 'rgba(200,168,74,0.35)', textAlign: 'center', letterSpacing: '0.08em' }}>
          Click anywhere outside to close
        </div>
      </div>
    </div>
  );
}

export function TopChrome() {
  const [helpOpen, setHelpOpen] = useState(false);
  const worldTitle      = useGameStore(s => s.worldTitle);
  const activeScreen    = useGameStore(s => s.activeScreen);
  const playerCharacter = useGameStore(s => s.playerCharacter);
  const currentRoomName = useGameStore(s => s.currentRoomName);
  const gameTime        = useGameStore(s => s.gameTime);
  const openSaveModal   = useGameStore(s => s.openSaveModal);
  const openLoadModal   = useGameStore(s => s.openLoadModal);
  const currencySymbol  = useGameStore(s => s.currencySymbol);

  const screenLabel = activeScreen === 'explore' ? currentRoomName : SCREEN_LABEL[activeScreen];

  const hp    = playerCharacter?.hp    ?? 0;
  const maxHp = playerCharacter?.max_hp ?? 1;
  const gold  = playerCharacter?.gold  ?? 0;
  const hpPct = Math.max(0, Math.min(1, hp / maxHp));
  const hpLow = hp <= maxHp * 0.3;

  return (
    <div style={{
      background: 'var(--ui-bg-2)',
      borderBottom: '1px solid var(--ui-gold-border)',
      padding: '7px 14px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      flexShrink: 0,
      fontFamily: 'var(--font-dossier)',
    }}>
      {/* Left: world title · screen */}
      <span style={{ fontSize: 10, letterSpacing: '0.18em', color: 'var(--ui-gold-dim)', textTransform: 'uppercase' }}>
        {worldTitle || 'Iron & Blood'}
      </span>
      {screenLabel && (
        <>
          <span style={{ color: 'rgba(200,168,74,0.2)', fontSize: 10 }}>·</span>
          <span style={{ fontSize: 10, color: 'var(--ui-gold)', letterSpacing: '0.1em' }}>
            {screenLabel}
          </span>
        </>
      )}

      {/* Right: time · HP · gold · save */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ fontSize: 9.5, color: 'var(--ui-dim)', fontFamily: 'var(--font-dossier)' }}>
          ☀ {formatTime(gameTime)}
        </span>

        {/* HP */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 9.5, color: 'var(--ui-dim)' }}>HP</span>
          <div style={{
            width: 56, height: 4,
            background: 'rgba(212,200,168,0.1)',
            borderRadius: 2, overflow: 'hidden',
          }}>
            <div style={{
              width: `${hpPct * 100}%`, height: '100%',
              background: hpLow ? 'var(--ui-bar-hp-low)' : 'var(--ui-bar-hp)',
              transition: 'width 0.3s',
            }} />
          </div>
          <span style={{
            fontSize: 9.5,
            color: hpLow ? 'var(--ui-red-hi)' : 'var(--ui-cream)',
            fontWeight: 'bold',
          }}>
            {hp}/{maxHp}
          </span>
        </div>

        {/* Gold */}
        <span style={{ fontSize: 10, color: 'var(--ui-gold)', fontWeight: 'bold' }}>
          {currencySymbol} {gold}
        </span>

        {/* Save / Load / Help */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['save', 'load'] as const).map(action => (
            <button
              key={action}
              onClick={action === 'save' ? openSaveModal : openLoadModal}
              style={{
                background: 'transparent',
                border: '1px solid var(--ui-gold-border)',
                color: 'var(--ui-gold-dim)',
                fontFamily: 'var(--font-dossier)',
                fontSize: 8.5,
                padding: '2px 7px',
                cursor: 'pointer',
                borderRadius: 2,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ui-gold)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--ui-gold-border-hi)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ui-gold-dim)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--ui-gold-border)'; }}
            >
              {action}
            </button>
          ))}
          <button
            onClick={() => setHelpOpen(true)}
            title="How to play"
            style={{
              background: 'transparent',
              border: '1px solid var(--ui-gold-border)',
              color: 'var(--ui-gold-dim)',
              fontFamily: 'var(--font-dossier)',
              fontSize: 10, width: 22, height: 22,
              cursor: 'pointer', borderRadius: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ui-gold)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--ui-gold-border-hi)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ui-gold-dim)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--ui-gold-border)'; }}
          >
            ?
          </button>
        </div>
      </div>
    </div>
    {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
  );
}
