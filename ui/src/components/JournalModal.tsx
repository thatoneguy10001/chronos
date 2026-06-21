import { useState, useEffect } from 'react';
import { useGameStore } from '@/store/gameStore';
import type { QuestProgressDTO } from '@/types/contracts';

type Tab = 'active' | 'completed';

export function JournalModal() {
  const journalOpen  = useGameStore(s => s.journalOpen);
  const closeJournal = useGameStore(s => s.closeJournal);
  const quests       = useGameStore(s => s.playerCharacter?.active_quests ?? []);

  const active    = quests.filter(q => !q.completed);
  const completed = quests.filter(q => q.completed);

  const [tab, setTab]           = useState<Tab>('active');
  const [selectedIdx, setSelectedIdx] = useState(0);

  const list = tab === 'active' ? active : completed;
  const selected = list[selectedIdx] ?? list[0] ?? null;

  // Reset selection when tab or quests change
  useEffect(() => { setSelectedIdx(0); }, [tab, journalOpen]);

  // Keyboard navigation inside modal
  useEffect(() => {
    if (!journalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx(i => Math.min(i + 1, list.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx(i => Math.max(i - 1, 0));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [journalOpen, list.length]);

  if (!journalOpen) return null;

  return (
    <div
      onClick={closeJournal}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.82)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100,
        fontFamily: 'monospace',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#060c06',
          border: '1px solid #2a4a2a',
          width: 'min(820px, 92vw)',
          height: 'min(600px, 88vh)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* ── Header ── */}
        <div style={{
          borderBottom: '1px solid #1a2a1a',
          padding: '0.6rem 1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{ color: '#3a6a3a', fontSize: '0.7em', letterSpacing: '0.2em' }}>── JOURNAL ──</span>
          <button
            onClick={closeJournal}
            style={{
              background: 'transparent',
              border: '1px solid #2a4a2a',
              color: '#4a7a4a',
              fontFamily: 'monospace',
              fontSize: '0.7em',
              padding: '0.25rem 0.75rem',
              cursor: 'pointer',
              borderRadius: '12px',
              letterSpacing: '0.05em',
            }}
          >[ESC] close</button>
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', borderBottom: '1px solid #1a2a1a' }}>
          {(['active', 'completed'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? '#0a160a' : 'transparent',
                border: 'none',
                borderBottom: tab === t ? '2px solid #4a8a4a' : '2px solid transparent',
                color: tab === t ? '#8aaa8a' : '#3a5a3a',
                fontFamily: 'monospace',
                fontSize: '0.8em',
                padding: '0.5rem 1.2rem',
                cursor: 'pointer',
                letterSpacing: '0.05em',
              }}
            >
              {t === 'active' ? 'Active' : 'Completed'}
              {' '}
              <span style={{ color: tab === t ? '#5a9a5a' : '#2a4a2a', fontSize: '0.9em' }}>
                {t === 'active' ? active.length : completed.length}
              </span>
            </button>
          ))}
        </div>

        {/* ── Body: sidebar + detail ── */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Sidebar */}
          <div style={{
            width: '240px',
            borderRight: '1px solid #1a2a1a',
            overflowY: 'auto',
            flexShrink: 0,
          }}>
            {list.length === 0 ? (
              <div style={{
                padding: '1rem',
                color: '#2a4a2a',
                fontSize: '0.75em',
                fontStyle: 'italic',
              }}>
                {tab === 'active'
                  ? 'No active quests.'
                  : 'No completed quests yet.'}
              </div>
            ) : list.map((q, i) => (
              <div
                key={q.quest_id}
                onClick={() => setSelectedIdx(i)}
                style={{
                  padding: '0.6rem 0.75rem',
                  borderLeft: i === selectedIdx ? '3px solid #4a8a4a' : '3px solid transparent',
                  background: i === selectedIdx ? '#0a160a' : 'transparent',
                  cursor: 'pointer',
                  borderBottom: '1px solid #111811',
                }}
              >
                <div style={{
                  color: i === selectedIdx ? '#8aaa8a' : '#4a6a4a',
                  fontSize: '0.78em',
                  fontWeight: i === selectedIdx ? 'bold' : 'normal',
                  marginBottom: '0.2rem',
                }}>
                  {q.name}
                </div>
                <div style={{ color: '#2a4a2a', fontSize: '0.62em', letterSpacing: '0.08em' }}>
                  ▸ {q.ready_to_turn_in ? 'READY TO TURN IN' : q.completed ? 'COMPLETED' : 'ACTIVE'}
                </div>
              </div>
            ))}
          </div>

          {/* Detail panel */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.1rem 1.3rem' }}>
            {selected ? (
              <Detail quest={selected} />
            ) : (
              <div style={{ color: '#2a4a2a', fontSize: '0.8em', fontStyle: 'italic' }}>
                Select a quest.
              </div>
            )}
          </div>
        </div>

        {/* ── Footer hints ── */}
        <div style={{
          borderTop: '1px solid #1a2a1a',
          padding: '0.35rem 1rem',
          display: 'flex',
          gap: '1.5rem',
          color: '#2a4a2a',
          fontSize: '0.62em',
          letterSpacing: '0.08em',
        }}>
          <span><span style={{ color: '#3a6a3a' }}>[J]</span> open / close</span>
          <span><span style={{ color: '#3a6a3a' }}>[↑↓]</span> navigate</span>
          <span><span style={{ color: '#3a6a3a' }}>[ESC]</span> close</span>
        </div>
      </div>
    </div>
  );
}

function Detail({ quest }: { quest: QuestProgressDTO }) {
  return (
    <div>
      <div style={{ color: '#8aaa8a', fontSize: '0.9em', marginBottom: '0.6rem' }}>
        {quest.name}
      </div>
      <div style={{ borderBottom: '1px solid #1a2a1a', marginBottom: '0.9rem' }} />

      <div style={{ marginBottom: '1.1rem' }}>
        <div style={{ color: '#3a6a3a', fontSize: '0.62em', letterSpacing: '0.15em', marginBottom: '0.4rem' }}>
          DESCRIPTION
        </div>
        <div style={{ color: '#5a7a5a', fontSize: '0.78em', lineHeight: '1.7' }}>
          {quest.description || 'No description.'}
        </div>
      </div>

      <div>
        <div style={{ color: '#3a6a3a', fontSize: '0.62em', letterSpacing: '0.15em', marginBottom: '0.4rem' }}>
          {quest.completed ? 'COMPLETED' : quest.ready_to_turn_in ? 'RETURN TO QUEST GIVER' : 'CURRENT OBJECTIVE'}
        </div>
        <div style={{
          borderLeft: '3px solid #2a5a2a',
          background: '#080e08',
          padding: '0.6rem 0.85rem',
          color: '#6a9a6a',
          fontSize: '0.78em',
          lineHeight: '1.6',
        }}>
          {quest.objective_hint || (quest.completed ? 'Quest complete.' : 'See quest giver for details.')}
        </div>
      </div>
    </div>
  );
}
