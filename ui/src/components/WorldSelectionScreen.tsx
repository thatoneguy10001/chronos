import { useState, useEffect } from 'react';
import { listWorlds } from '@/bridge/engine';
import type { WorldMeta } from '@/bridge/engine';

const TONE_COLORS: Record<string, { accent: string; dim: string }> = {
  fantasy:    { accent: '#4a9a4a', dim: '#2a5a2a' },
  dieselpunk: { accent: '#9a7a2a', dim: '#5a4a1a' },
};

function WorldCard({
  world,
  hovered,
  onHover,
  onSelect,
}: {
  world: WorldMeta;
  hovered: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const colors = TONE_COLORS[world.tone] ?? TONE_COLORS['fantasy'];

  return (
    <div
      onClick={() => onSelect(world.id)}
      onMouseEnter={() => onHover(world.id)}
      onMouseLeave={() => onHover(null)}
      style={{
        border: `1px solid ${hovered ? colors.accent : colors.dim}`,
        borderRadius: 4,
        padding: '1.2rem 1.4rem',
        marginBottom: '1rem',
        cursor: 'pointer',
        background: hovered ? '#0d0d0d' : 'transparent',
        transition: 'all 0.15s',
        maxWidth: 560,
        width: '100%',
      }}
    >
      <div style={{ color: colors.accent, fontWeight: 'bold', fontSize: '1.05em', marginBottom: '0.25rem' }}>
        {world.title}
      </div>
      <div style={{ color: '#8a8a6a', fontSize: '0.8em', fontStyle: 'italic', marginBottom: '0.6rem' }}>
        {world.tagline}
      </div>
      <div style={{ color: '#6a8a6a', fontSize: '0.78em', lineHeight: 1.5 }}>
        {world.description}
      </div>
      <div style={{ marginTop: '0.6rem', fontSize: '0.72em', color: colors.dim }}>
        {world.currency_symbol} currency: {world.currency}
      </div>
    </div>
  );
}

interface WorldSelectionScreenProps {
  onSelect: (worldId: string, tone: string, title: string) => void;
}

export function WorldSelectionScreen({ onSelect }: WorldSelectionScreenProps) {
  const [worlds, setWorlds] = useState<WorldMeta[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    void listWorlds().then(setWorlds);
  }, []);

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'monospace',
      background: '#030303',
      padding: '2rem',
    }}>
      <div style={{ color: '#2a5a2a', fontSize: '0.72em', letterSpacing: '0.15em', marginBottom: '0.5rem' }}>
        ── PROJECT CHRONOS ──
      </div>
      <div style={{ color: '#4a9a4a', fontSize: '1.4em', fontWeight: 'bold', marginBottom: '0.4rem' }}>
        Choose Your World
      </div>
      <div style={{ color: '#4a6a4a', fontSize: '0.8em', marginBottom: '2rem' }}>
        Each world is a complete adventure with its own rules and lore.
      </div>

      {worlds.map(w => (
        <WorldCard
          key={w.id}
          world={w}
          hovered={hovered === w.id}
          onHover={setHovered}
          onSelect={id => onSelect(id, w.tone, w.title)}
        />
      ))}

      {worlds.length === 0 && (
        <div style={{ color: '#cc4444', fontSize: '0.85em' }}>
          No worlds found. Check that the worlds/ directory is correctly bundled.
        </div>
      )}
    </div>
  );
}
