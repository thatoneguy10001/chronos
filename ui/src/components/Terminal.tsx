import { useEffect, useRef } from 'react';
import { useGameStore, type TerminalLine } from '@/store/gameStore';

const LINE_STYLES: Record<TerminalLine['type'], React.CSSProperties> = {
  input:  { color: '#ffffff', opacity: 0.85 },
  output: { color: '#c8ffb0', lineHeight: '1.6' },
  error:  { color: '#ff6b6b', lineHeight: '1.6' },
  system: { color: '#888', fontStyle: 'italic', fontSize: '0.85em' },
};

export function Terminal() {
  const lines = useGameStore(s => s.lines);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      padding: '1rem 1.5rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.35rem',
    }}>
      {lines.map(line => (
        <div key={line.id} style={LINE_STYLES[line.type]}>
          {line.text.split('\n').map((part, i) => (
            <div key={i} dangerouslySetInnerHTML={{ __html: renderMarkdown(part) }} />
          ))}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

/** Minimal inline markdown: **bold** only. No XSS vectors — content is from Rust, not user. */
function renderMarkdown(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}
