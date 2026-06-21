import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import type { ContextAction } from '@/types/contracts';

const DIRECTIONS = new Set(['north', 'south', 'east', 'west', 'up', 'down', 'northeast', 'northwest', 'southeast', 'southwest', 'ne', 'nw', 'se', 'sw']);

function isMovement(cmd: string): boolean {
  const tokens = cmd.trim().toLowerCase().split(/\s+/);
  if (tokens[0] === 'go' && tokens[1] && DIRECTIONS.has(tokens[1])) return true;
  if (DIRECTIONS.has(tokens[0])) return true;
  return false;
}

type TabId = 'MOVE' | 'COMBAT' | 'ITEMS' | 'TALK' | 'OTHER';

interface Tab {
  id: TabId;
  label: string;
  actions: ContextAction[];
}

function categorize(
  roomActions: ContextAction[],
  contextActions: ContextAction[],
): Record<TabId, ContextAction[]> {
  const move: ContextAction[] = [];
  const combat: ContextAction[] = [];
  const items: ContextAction[] = [];
  const talk: ContextAction[] = [];
  const other: ContextAction[] = [];

  const seen = new Set<string>();

  for (const action of roomActions) {
    if (seen.has(action.command)) continue;
    seen.add(action.command);

    const first = action.command.trim().split(/\s+/)[0].toLowerCase();

    if (isMovement(action.command)) {
      move.push(action);
    } else if (first === 'attack') {
      combat.push(action);
    } else if (first === 'take' || first === 'drop' || first === 'use' || first === 'buy' || first === 'accept') {
      items.push(action);
    } else if (first === 'talk' || first === 'ask' || first === 'shop') {
      talk.push(action);
    } else {
      combat.push(action);
    }
  }

  for (const action of contextActions) {
    if (seen.has(action.command)) continue;
    seen.add(action.command);
    const first = action.command.trim().split(/\s+/)[0].toLowerCase();
    if (first === 'ask' || first === 'shop' || first === 'rest' || first === 'accept') {
      talk.push(action);
    }
  }

  return { MOVE: move, COMBAT: combat, ITEMS: items, TALK: talk, OTHER: other };
}

interface Props {
  onCommand: (cmd: string) => void;
}

export function ActionButtons({ onCommand }: Props) {
  const roomActions = useGameStore(s => s.roomActions);
  const contextActions = useGameStore(s => s.contextActions);
  const [activeTab, setActiveTab] = useState<TabId>('MOVE');

  const grouped = categorize(roomActions, contextActions);

  const tabs: Tab[] = (
    [
      { id: 'MOVE'   as TabId, label: 'Move',   actions: grouped.MOVE },
      { id: 'COMBAT' as TabId, label: 'Combat', actions: grouped.COMBAT },
      { id: 'ITEMS'  as TabId, label: 'Items',  actions: grouped.ITEMS },
      { id: 'TALK'   as TabId, label: 'Talk',   actions: grouped.TALK },
    ] satisfies Tab[]
  ).filter(t => t.actions.length > 0);

  if (tabs.length === 0) {
    return (
      <div style={{ color: 'var(--text-ui)', fontStyle: 'italic', fontSize: '0.85em', padding: '0.5rem 0' }}>
        No actions available — try typing a command.
      </div>
    );
  }

  const visibleTab = tabs.find(t => t.id === activeTab) ?? tabs[0];
  const currentActions = visibleTab.actions;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--border-input)' }}>
        {tabs.map(tab => {
          const isActive = tab.id === visibleTab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: isActive ? 'var(--border)' : 'transparent',
                border: '1px solid var(--border-input)',
                borderBottom: isActive ? '1px solid var(--border)' : '1px solid var(--border-input)',
                color: isActive ? 'var(--text)' : 'var(--text-label)',
                fontFamily: 'inherit',
                fontSize: '0.8em',
                padding: '0.3rem 0.75rem',
                cursor: 'pointer',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                marginBottom: '-1px',
              }}
            >
              {tab.label}
              <span style={{ marginLeft: '0.35em', opacity: 0.6, fontSize: '0.85em' }}>
                {tab.actions.length}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', paddingTop: '0.25rem' }}>
        {currentActions.map(action => (
          <ActionButton key={action.command} action={action} onCommand={onCommand} tabId={visibleTab.id} />
        ))}
      </div>
    </div>
  );
}

const TAB_ACCENT: Record<TabId, string> = {
  MOVE:   '#4a7a8a',
  COMBAT: '#8a4a4a',
  ITEMS:  '#7a7a4a',
  TALK:   '#4a6a8a',
  OTHER:  '#4a7a4a',
};

function ActionButton({ action, onCommand, tabId }: { action: ContextAction; onCommand: (cmd: string) => void; tabId: TabId }) {
  const accent = TAB_ACCENT[tabId];

  return (
    <button
      onClick={() => onCommand(action.command)}
      style={{
        background: 'transparent',
        border: `1px solid ${accent}`,
        color: 'var(--text)',
        fontFamily: 'inherit',
        fontSize: '0.88em',
        padding: '0.3rem 0.7rem',
        cursor: 'pointer',
        borderRadius: '2px',
        transition: 'all 0.1s',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={e => {
        const el = e.target as HTMLElement;
        el.style.background = accent + '33';
        el.style.borderColor = 'var(--text)';
      }}
      onMouseLeave={e => {
        const el = e.target as HTMLElement;
        el.style.background = 'transparent';
        el.style.borderColor = accent;
      }}
    >
      {action.label}
    </button>
  );
}
