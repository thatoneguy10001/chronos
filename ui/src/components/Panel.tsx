/**
 * Shared panel primitives — the journal's visual language, reusable.
 *
 * `Panel`        — bordered surface with an optional header strip (caps label +
 *                  optional right-aligned action) matching the journal modal.
 * `SectionLabel` — standalone caps section label (left-aligned, letter-spaced).
 * `pillButton`   — the rounded `[ESC] close`-style button style, as a base you
 *                  can spread and override.
 *
 * All draw from the `--j-*` tokens in theme.css so the whole UI stays in sync.
 */
import type { CSSProperties, ReactNode } from 'react';

export function SectionLabel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span style={{
      color: 'var(--j-label)',
      fontSize: '0.62em',
      letterSpacing: '0.15em',
      textTransform: 'uppercase',
      ...style,
    }}>
      {children}
    </span>
  );
}

export function Panel({
  label,
  action,
  children,
  style,
  bodyStyle,
}: {
  label?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
  bodyStyle?: CSSProperties;
}) {
  return (
    <div style={{
      border: '1px solid var(--j-border)',
      background: 'var(--j-bg)',
      marginBottom: '0.6rem',
      ...style,
    }}>
      {label && (
        <div style={{
          borderBottom: '1px solid var(--j-divider)',
          padding: '0.4rem 0.6rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <SectionLabel>{label}</SectionLabel>
          {action}
        </div>
      )}
      <div style={{ padding: '0.6rem', ...bodyStyle }}>
        {children}
      </div>
    </div>
  );
}

/** Base style for the rounded pill button (`[ESC] close` look). Spread + override. */
export const pillButton: CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--j-border)',
  color: 'var(--j-text-dim)',
  fontFamily: 'monospace',
  fontSize: '0.65em',
  padding: '0.22rem 0.7rem',
  cursor: 'pointer',
  borderRadius: '12px',
  letterSpacing: '0.06em',
};
