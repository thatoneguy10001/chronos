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
        background: 'rgba(20,16,8,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100,
        fontFamily: 'var(--font-journal)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "url('/textures/teastain%20102.png') center/cover no-repeat var(--parchment)",
          border: '1px solid rgba(46,26,8,0.4)',
          boxShadow: '0 12px 48px rgba(0,0,0,0.55)',
          width: 'min(820px, 92vw)',
          height: 'min(600px, 88vh)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* ── Header ── */}
        <div style={{
          borderBottom: '1px solid var(--ink-divider)',
          padding: '0.6rem 1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(184,149,90,0.45)',
        }}>
          <span style={{ color: 'var(--ink-faint)', fontSize: '0.68em', letterSpacing: '0.2em', fontFamily: 'var(--font-dossier)' }}>── JOURNAL ──</span>
          <button
            onClick={closeJournal}
            style={{
              background: 'transparent',
              border: '1px solid rgba(46,26,8,0.3)',
              color: 'var(--ink-faint)',
              fontFamily: 'var(--font-dossier)',
              fontSize: '0.68em',
              padding: '0.25rem 0.75rem',
              cursor: 'pointer',
              borderRadius: '12px',
              letterSpacing: '0.05em',
            }}
          >[ESC] close</button>
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--ink-divider)', background: 'rgba(184,149,90,0.35)' }}>
          {(['active', 'completed'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: tab === t ? '2px solid var(--ink-narrative)' : '2px solid transparent',
                color: tab === t ? 'var(--ink-narrative)' : 'var(--ink-faint)',
                fontFamily: 'var(--font-dossier)',
                fontSize: '0.78em',
                padding: '0.5rem 1.2rem',
                cursor: 'pointer',
                letterSpacing: '0.06em',
              }}
            >
              {t === 'active' ? 'Active' : 'Completed'}
              {' '}
              <span style={{ opacity: 0.6, fontSize: '0.9em' }}>
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
            borderRight: '1px solid var(--ink-divider)',
            overflowY: 'auto',
            flexShrink: 0,
            background: 'rgba(184,149,90,0.2)',
          }}>
            {list.length === 0 ? (
              <div style={{
                padding: '1rem',
                color: 'var(--ink-faint)',
                fontSize: '0.8em',
                fontStyle: 'italic',
                opacity: 0.6,
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
                  borderLeft: i === selectedIdx ? '3px solid var(--ink-narrative)' : '3px solid transparent',
                  background: i === selectedIdx ? 'rgba(46,26,8,0.08)' : 'transparent',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--ink-divider)',
                }}
              >
                <div style={{
                  color: i === selectedIdx ? 'var(--ink-narrative)' : 'var(--ink-movement)',
                  fontSize: '0.85em',
                  fontWeight: i === selectedIdx ? '600' : 'normal',
                  marginBottom: '0.2rem',
                }}>
                  {q.name}
                </div>
                <div style={{ color: 'var(--ink-faint)', fontSize: '0.62em', letterSpacing: '0.08em', fontFamily: 'var(--font-dossier)', opacity: 0.7 }}>
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
              <div style={{ color: 'var(--ink-faint)', fontSize: '0.85em', fontStyle: 'italic', opacity: 0.6 }}>
                Select a quest.
              </div>
            )}
          </div>
        </div>

        {/* ── Footer hints ── */}
        <div style={{
          borderTop: '1px solid var(--ink-divider)',
          padding: '0.35rem 1rem',
          display: 'flex',
          gap: '1.5rem',
          color: 'var(--ink-faint)',
          fontSize: '0.62em',
          letterSpacing: '0.08em',
          fontFamily: 'var(--font-dossier)',
          background: 'rgba(184,149,90,0.35)',
          opacity: 0.7,
        }}>
          <span>[J] open / close</span>
          <span>[↑↓] navigate</span>
          <span>[ESC] close</span>
        </div>
      </div>
    </div>
  );
}

function Detail({ quest }: { quest: QuestProgressDTO }) {
  return (
    <div>
      <div style={{ color: 'var(--ink-narrative)', fontSize: '1.1em', fontWeight: '600', marginBottom: '0.6rem' }}>
        {quest.name}
      </div>
      <div style={{ borderBottom: '1px solid var(--ink-divider)', marginBottom: '0.9rem' }} />

      <div style={{ marginBottom: '1.1rem' }}>
        <div style={{ color: 'var(--ink-faint)', fontSize: '0.62em', letterSpacing: '0.15em', marginBottom: '0.5rem', fontFamily: 'var(--font-dossier)' }}>
          DESCRIPTION
        </div>
        <div style={{ color: 'var(--ink-narrative)', fontSize: '0.9em', lineHeight: '1.75', opacity: 0.85 }}>
          {quest.description || 'No description.'}
        </div>
      </div>

      <div>
        <div style={{ color: 'var(--ink-faint)', fontSize: '0.62em', letterSpacing: '0.15em', marginBottom: '0.5rem', fontFamily: 'var(--font-dossier)' }}>
          {quest.completed ? 'COMPLETED' : quest.ready_to_turn_in ? 'RETURN TO QUEST GIVER' : 'CURRENT OBJECTIVE'}
        </div>
        <div style={{
          borderLeft: '3px solid var(--ink-movement)',
          background: 'rgba(46,26,8,0.06)',
          padding: '0.6rem 0.85rem',
          color: 'var(--ink-movement)',
          fontSize: '0.88em',
          lineHeight: '1.65',
          fontStyle: 'italic',
        }}>
          {quest.objective_hint || (quest.completed ? 'Quest complete.' : 'See quest giver for details.')}
        </div>
      </div>
    </div>
  );
}
