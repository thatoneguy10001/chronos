import { useState, useRef, type KeyboardEvent } from 'react';
import { useGameStore } from '@/store/gameStore';
import { ActionButtons } from './ActionButtons';
import { pillButton } from '@/components/Panel';
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
      borderTop: `1px solid var(--ink-divider)`,
      padding: '0.65rem 2rem',
      background: 'var(--parchment-mid)',
      fontFamily: 'var(--font-dossier)',
    }}>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
        <span style={{ color: 'var(--ink-faint)', fontSize: '0.6em', letterSpacing: '0.15em' }}>INPUT</span>
        {(['PARSER', 'BUTTONS'] as InputMode[]).map(mode => (
          <button
            key={mode}
            onClick={() => setInputMode(mode)}
            style={{
              ...pillButton,
              background: inputMode === mode ? 'var(--j-bg-active)' : 'transparent',
              borderColor: inputMode === mode ? 'var(--j-accent)' : 'var(--j-border)',
              color: inputMode === mode ? 'var(--j-text)' : 'var(--j-text-dim)',
              fontSize: '0.7em',
            }}
          >
            {mode}
          </button>
        ))}
        <button
          onClick={() => onCommand('journal')}
          style={{ ...pillButton, fontSize: '0.7em' }}
        >
          JOURNAL
        </button>
        {isRewound && (
          <span style={{ color: 'var(--warn)', fontSize: '0.8em', marginLeft: 'auto' }}>
            ⏪ REWOUND — next command discards future history
          </span>
        )}
      </div>

      {inputMode === 'PARSER' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ color: 'var(--ink-faint)', userSelect: 'none', fontFamily: 'var(--font-journal)' }}>›</span>
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="write your next move..."
            autoFocus
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--ink-narrative)',
              fontFamily: 'var(--font-journal)',
              fontSize: '1.15em',
              caretColor: 'var(--ink-narrative)',
            }}
          />
        </div>
      ) : (
        <ActionButtons onCommand={submit} />
      )}
    </div>
  );
}
