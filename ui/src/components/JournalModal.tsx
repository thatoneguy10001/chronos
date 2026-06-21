import { useGameStore } from '@/store/gameStore';
import type { QuestProgressDTO } from '@/types/contracts';

export function JournalModal() {
  const journalOpen  = useGameStore(s => s.journalOpen);
  const closeJournal = useGameStore(s => s.closeJournal);
  const quests       = useGameStore(s => s.playerCharacter?.active_quests ?? []);

  if (!journalOpen) return null;

  const active    = quests.filter(q => !q.completed);
  const completed = quests.filter(q => q.completed);

  return (
    <div
      onClick={closeJournal}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#080e08',
          border: '1px solid #2a4a2a',
          width: 'min(540px, 90vw)',
          maxHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'monospace',
        }}
      >
        {/* Header */}
        <div style={{
          borderBottom: '1px solid #2a4a2a',
          padding: '0.6rem 1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{ color: '#5a9a5a', fontSize: '0.7em', letterSpacing: '0.15em' }}>JOURNAL</span>
          <button
            onClick={closeJournal}
            style={{
              background: 'transparent', border: 'none',
              color: 'var(--text-muted)', cursor: 'pointer',
              fontSize: '1em', fontFamily: 'monospace', padding: '0',
            }}
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '0.75rem 1rem', flex: 1 }}>
          {active.length === 0 && completed.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.82em', fontStyle: 'italic' }}>
              No active quests. Speak with quest givers to find work.
            </div>
          ) : (
            <>
              {active.length > 0 && (
                <Section title="ACTIVE" quests={active} />
              )}
              {completed.length > 0 && (
                <Section title="COMPLETED" quests={completed} />
              )}
            </>
          )}
        </div>

        <div style={{
          borderTop: '1px solid #1a2a1a',
          padding: '0.4rem 1rem',
          color: 'var(--text-muted)',
          fontSize: '0.65em',
          letterSpacing: '0.08em',
        }}>
          PRESS ESC OR CLICK OUTSIDE TO CLOSE
        </div>
      </div>
    </div>
  );
}

function Section({ title, quests }: { title: string; quests: QuestProgressDTO[] }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{
        color: '#3a5a3a',
        fontSize: '0.65em',
        letterSpacing: '0.15em',
        marginBottom: '0.5rem',
        borderBottom: '1px solid #1a2a1a',
        paddingBottom: '0.2rem',
      }}>
        {title}
      </div>
      {quests.map(q => <QuestRow key={q.quest_id} quest={q} />)}
    </div>
  );
}

function QuestRow({ quest }: { quest: QuestProgressDTO }) {
  const pct = quest.target > 0 ? Math.min(1, quest.progress / quest.target) : 0;

  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <div style={{
        color: quest.completed ? '#3a5a3a' : '#8aaa8a',
        fontSize: '0.82em',
        marginBottom: '0.2rem',
        display: 'flex',
        justifyContent: 'space-between',
      }}>
        <span style={{ textDecoration: quest.completed ? 'line-through' : 'none' }}>
          {quest.name}
        </span>
        {quest.completed
          ? <span style={{ color: '#5a9a5a', fontSize: '0.85em' }}>✓ done</span>
          : quest.target > 1
            ? <span style={{ color: 'var(--text-muted)', fontSize: '0.85em' }}>{quest.progress}/{quest.target}</span>
            : null
        }
      </div>
      {!quest.completed && quest.target > 1 && (
        <div style={{ height: '2px', background: '#1a2a1a', borderRadius: '1px' }}>
          <div style={{
            height: '100%',
            width: `${pct * 100}%`,
            background: '#4a8a4a',
            borderRadius: '1px',
          }} />
        </div>
      )}
    </div>
  );
}
