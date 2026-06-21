/**
 * FooterHints — the framed window's bottom keybind strip, mirroring the journal
 * footer. Static content; the bindings themselves live in App.tsx (J, Esc) and
 * InputManager.tsx (history arrows).
 */
const HINTS: [string, string][] = [
  ['J', 'journal'],
  ['↑↓', 'history'],
  ['Tab', 'buttons'],
  ['Esc', 'close'],
];

export function FooterHints() {
  return (
    <div style={{
      borderTop: '1px solid var(--j-divider)',
      background: 'var(--bg-panel)',
      padding: '0.4rem var(--sp-4)',
      display: 'flex',
      gap: 'var(--sp-4)',
      flexShrink: 0,
      fontSize: 'var(--fs-small)',
      letterSpacing: '0.06em',
    }}>
      {HINTS.map(([key, label]) => (
        <span key={key} style={{ color: 'var(--j-text-dim)' }}>
          <span style={{ color: 'var(--j-label)' }}>[{key}]</span> {label}
        </span>
      ))}
    </div>
  );
}
