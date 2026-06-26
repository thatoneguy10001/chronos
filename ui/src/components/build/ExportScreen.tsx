import { useRef, useState } from 'react';
import { useBuildStore } from '@/store/buildStore';
import { parseWorldFile, serializeWorldFile, worldFileName } from '@/build/worldFile';

/**
 * Export & Share — save your world to a file, or load one someone shared.
 *
 * The file is the draft itself (the editable source of truth), wrapped in a small
 * format/version envelope. Export downloads it or copies it to the clipboard;
 * Import reads it back into Build Mode, where it can be edited or Test Played. A
 * round trip is lossless because it's the same draft on both ends.
 */
export function ExportScreen({ onBack }: { onBack: () => void }) {
  const draft = useBuildStore(s => s.draft);
  const loadDraft = useBuildStore(s => s.loadDraft);
  const isDraftEmpty = useBuildStore(s => s.isDraftEmpty);

  const [title, setTitle] = useState('Your World');
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const summary = [
    { label: 'Layers', n: draft.layers.length },
    { label: 'Rooms', n: draft.rooms.length },
    { label: 'NPCs', n: draft.npcs.length },
    { label: 'Items', n: draft.items.length },
    { label: 'Classes', n: draft.classes.filter(c => c.role === 'playable').length },
    { label: 'Enemies', n: draft.classes.filter(c => c.role === 'enemy').length },
    { label: 'Quests', n: draft.quests.length },
  ];

  const download = () => {
    const text = serializeWorldFile(draft, title);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = worldFileName(title);
    a.click();
    URL.revokeObjectURL(url);
    setStatus({ kind: 'ok', text: `Saved ${worldFileName(title)}.` });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(serializeWorldFile(draft, title));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setStatus({ kind: 'err', text: 'Could not copy — your browser blocked clipboard access.' });
    }
  };

  // Parse a world file's text and load it, guarding against clobbering unsaved work.
  const importText = (text: string) => {
    const result = parseWorldFile(text);
    if (!result.ok) {
      setStatus({ kind: 'err', text: result.error });
      return;
    }
    if (!isDraftEmpty() && !window.confirm('Importing replaces everything you have now. Continue?')) {
      return;
    }
    loadDraft(result.draft);
    setTitle(result.title);
    setStatus({ kind: 'ok', text: `Loaded "${result.title}". Edit it, or head to Test Play.` });
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then(importText);
    e.target.value = ''; // allow re-importing the same file
  };

  const inputStyle = {
    background: 'rgba(255,255,255,0.4)',
    border: '1px solid var(--ink-faint)',
    borderRadius: 2,
    color: 'var(--ink-narrative)',
    fontFamily: 'var(--font-journal)',
    padding: '0.35rem 0.5rem',
    fontSize: '0.9em',
  } as const;

  const buttonStyle = {
    background: 'transparent',
    border: '1px solid var(--ink-narrative)',
    color: 'var(--ink-narrative)',
    fontFamily: 'var(--font-dossier)' as const,
    fontSize: '0.8em',
    padding: '0.45rem 1.1rem',
    cursor: 'pointer',
    letterSpacing: '0.08em',
  };

  const labelStyle = {
    color: 'var(--ink-faint)',
    fontSize: '0.7em',
    letterSpacing: '0.15em',
    fontFamily: 'var(--font-dossier)' as const,
  };

  return (
    <div style={{ width: 'min(560px, 100%)', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Export */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
        <span style={labelStyle}>EXPORT</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--ink-movement)', fontSize: '0.8em', fontFamily: 'var(--font-dossier)' }}>
          World name
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Your World" style={{ ...inputStyle, flex: 1 }} />
        </label>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem', color: 'var(--ink-movement)', fontSize: '0.8em', fontFamily: 'var(--font-dossier)' }}>
          {summary.map(s => (
            <span key={s.label}>{s.label}: <strong style={{ color: 'var(--ink-narrative)' }}>{s.n}</strong></span>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button onClick={download} style={buttonStyle}>⬇ DOWNLOAD WORLD FILE</button>
          <button onClick={copy} style={buttonStyle}>{copied ? '✓ COPIED' : '⧉ COPY JSON'}</button>
        </div>
      </section>

      {/* Import */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', borderTop: '1px solid var(--ink-faint)', paddingTop: '1.1rem' }}>
        <span style={labelStyle}>IMPORT</span>
        <div style={{ color: 'var(--ink-movement)', fontSize: '0.82em', lineHeight: 1.5 }}>
          Load a world someone shared. It opens here in Build Mode — edit it or jump to Test Play.
        </div>
        <div>
          <button onClick={() => fileInputRef.current?.click()} style={buttonStyle}>⬆ CHOOSE WORLD FILE…</button>
          <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={onFile} style={{ display: 'none' }} />
        </div>
        <details>
          <summary style={{ cursor: 'pointer', color: 'var(--ink-movement)', fontSize: '0.76em', fontFamily: 'var(--font-dossier)' }}>
            …or paste world JSON
          </summary>
          <PasteImport onImport={importText} inputStyle={inputStyle} buttonStyle={buttonStyle} />
        </details>
      </section>

      {status && (
        <div style={{ color: status.kind === 'err' ? 'var(--error)' : 'var(--ink-movement)', fontSize: '0.8em', fontFamily: 'var(--font-dossier)' }}>
          {status.text}
        </div>
      )}

      <button
        onClick={onBack}
        style={{
          alignSelf: 'flex-start',
          background: 'transparent',
          border: '1px solid var(--ink-faint)',
          color: 'var(--ink-narrative)',
          fontFamily: 'var(--font-dossier)',
          fontSize: '0.8em',
          padding: '0.5rem 1.5rem',
          cursor: 'pointer',
          letterSpacing: '0.12em',
        }}
      >
        ← BUILD SECTIONS
      </button>
    </div>
  );
}

function PasteImport({
  onImport,
  inputStyle,
  buttonStyle,
}: {
  onImport: (text: string) => void;
  inputStyle: React.CSSProperties;
  buttonStyle: React.CSSProperties;
}) {
  const [text, setText] = useState('');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Paste the contents of a .chronos-world.json file here."
        rows={4}
        style={{ ...inputStyle, resize: 'vertical', fontSize: '0.78em', fontFamily: 'monospace' }}
      />
      <button onClick={() => onImport(text)} disabled={!text.trim()} style={{ ...buttonStyle, alignSelf: 'flex-start', opacity: text.trim() ? 1 : 0.5 }}>
        LOAD PASTED WORLD
      </button>
    </div>
  );
}
