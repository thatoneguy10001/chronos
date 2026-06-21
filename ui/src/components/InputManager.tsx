import { useState, useRef, type KeyboardEvent } from 'react';
import { useGameStore } from '@/store/gameStore';
import { ActionButtons } from './ActionButtons';
import type { InputMode } from '@/types/contracts';

interface Props {
  onCommand: (raw: string) => void;
}

export function InputManager({ onCommand }: Props) {
  const inputMode = useGameStore(s => s.inputMode);
  const setInputMode = useGameStore(s => s.setInputMode);
  const isRewound = useGameStore(s => s.isRewound);
  const [draft, setDraft] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    onCommand(trimmed);
    setHistory(h => [trimmed, ...h].slice(0, 50));
    setHistoryIdx(-1);
    setDraft('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      submit(draft);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(historyIdx + 1, history.length - 1);
      setHistoryIdx(next);
      setDraft(history[next] ?? '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.max(historyIdx - 1, -1);
      setHistoryIdx(next);
      setDraft(next === -1 ? '' : history[next]);
    }
  };

  return (
    <div style={{
      borderTop: `1px solid var(--border-input)`,
      padding: '0.75rem 1.5rem',
      background: 'var(--bg-input)',
    }}>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem', alignItems: 'center' }}>
        <span style={{ color: 'var(--text-ui)', fontSize: '0.8em' }}>INPUT:</span>
        {(['PARSER', 'BUTTONS'] as InputMode[]).map(mode => (
          <button
            key={mode}
            onClick={() => setInputMode(mode)}
            style={{
              background: inputMode === mode ? 'var(--border)' : 'transparent',
              border: `1px solid ${inputMode === mode ? 'var(--text)' : 'var(--text-muted)'}`,
              color: inputMode === mode ? 'var(--text)' : 'var(--text-ui)',
              fontFamily: 'inherit',
              fontSize: '0.75em',
              padding: '0.2rem 0.6rem',
              cursor: 'pointer',
              borderRadius: '2px',
            }}
          >
            {mode}
          </button>
        ))}
        {isRewound && (
          <span style={{ color: 'var(--warn)', fontSize: '0.8em', marginLeft: 'auto' }}>
            ⏪ REWOUND — next command discards future history
          </span>
        )}
      </div>

      {inputMode === 'PARSER' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ color: 'var(--text-label)', userSelect: 'none' }}>&gt;</span>
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="enter command..."
            autoFocus
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-input)',
              fontFamily: 'inherit',
              fontSize: '1em',
              caretColor: 'var(--text)',
            }}
          />
        </div>
      ) : (
        <ActionButtons onCommand={submit} />
      )}
    </div>
  );
}
