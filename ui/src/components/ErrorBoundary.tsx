import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'var(--ui-bg)', color: 'var(--ui-cream)',
          fontFamily: 'Georgia, serif', gap: 12, padding: 24,
        }}>
          <div style={{ fontSize: 18, color: 'var(--ui-red-hi)' }}>Something went wrong.</div>
          <div style={{
            fontSize: 11, color: 'var(--ui-dim)', maxWidth: 400,
            textAlign: 'center', lineHeight: 1.6, fontFamily: 'var(--font-dossier)',
          }}>
            {this.state.error.message}
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: 8, background: 'transparent',
              border: '1px solid var(--ui-gold-border)',
              color: 'var(--ui-gold-dim)', fontFamily: 'var(--font-dossier)',
              fontSize: 9, padding: '4px 12px', cursor: 'pointer',
              borderRadius: 2, letterSpacing: '0.1em',
            }}
          >
            DISMISS
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
