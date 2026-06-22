import { useState, useEffect } from 'react';
import { listWorlds } from '@/bridge/engine';
import type { WorldMeta } from '@/bridge/engine';
import { readAllSlots } from '@/store/gameStore';
import type { SaveSlot } from '@/store/gameStore';

const TONE_COLORS: Record<string, { accent: string; dim: string }> = {
  fantasy:    { accent: '#4a9a4a', dim: '#2a5a2a' },
  dieselpunk: { accent: '#9a7a2a', dim: '#5a4a1a' },
};

function formatSavedAt(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function humanizeRoomId(id: string): string {
  return id.replace(/_/g, ' ');
}

function ContinueCard({
  slotIndex,
  slot,
  tone,
  onClick,
}: {
  slotIndex: number;
  slot: SaveSlot;
  tone: string;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const colors = TONE_COLORS[tone] ?? TONE_COLORS['fantasy'];

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: `1px solid ${hovered ? colors.accent : colors.dim}`,
        borderRadius: 4,
        padding: '0.75rem 1.2rem',
        marginBottom: '0.5rem',
        cursor: 'pointer',
        background: hovered ? 'var(--bg-hover)' : 'transparent',
        transition: 'all 0.15s',
        maxWidth: 560,
        width: '100%',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <div>
        <div style={{ color: colors.accent, fontWeight: 'bold', fontSize: '0.9em' }}>
          {slot.characterName}
          <span style={{ color: colors.dim, fontWeight: 'normal', fontSize: '0.85em' }}> · {slot.classId}</span>
        </div>
        <div style={{ color: 'var(--xp-text)', fontSize: '0.72em', marginTop: '0.1rem' }}>
          {slot.worldTitle} · {humanizeRoomId(slot.roomId)} · tick {slot.tick}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '1rem' }}>
        <div style={{ color: hovered ? colors.accent : colors.dim, fontSize: '0.85em' }}>CONTINUE ▸</div>
        <div style={{ color: 'var(--text-faint)', fontSize: '0.65em', marginTop: '0.1rem' }}>
          slot {slotIndex + 1} · {formatSavedAt(slot.savedAt)}
        </div>
      </div>
    </div>
  );
}

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
        background: hovered ? 'var(--bg-hover)' : 'transparent',
        transition: 'all 0.15s',
        maxWidth: 560,
        width: '100%',
      }}
    >
      <div style={{ color: colors.accent, fontWeight: 'bold', fontSize: '1.05em', marginBottom: '0.25rem' }}>
        {world.title}
      </div>
      <div style={{ color: 'var(--xp-text)', fontSize: '0.8em', fontStyle: 'italic', marginBottom: '0.6rem' }}>
        {world.tagline}
      </div>
      <div style={{ color: 'var(--text-body)', fontSize: '0.78em', lineHeight: 1.5 }}>
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
  onContinue: (slotIndex: number, worldId: string, tone: string, title: string) => void;
}

export function WorldSelectionScreen({ onSelect, onContinue }: WorldSelectionScreenProps) {
  const [worlds, setWorlds]   = useState<WorldMeta[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [saves]               = useState(() => readAllSlots());

  useEffect(() => {
    void listWorlds().then(setWorlds);
  }, []);

  const worldToneMap = Object.fromEntries(worlds.map(w => [w.id, w.tone]));
  const populatedSaves = saves
    .map((s, i) => s ? { slot: s, index: i } : null)
    .filter((x): x is { slot: SaveSlot; index: number } => x !== null);

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start',
      fontFamily: 'monospace',
      background: 'var(--bg-panel)',
      padding: '10vh 2rem 2rem',
      overflowY: 'auto',
    }}>
      <div style={{ color: 'var(--text-dim)', fontSize: '0.72em', letterSpacing: '0.15em', marginBottom: '0.5rem' }}>
        ── PROJECT CHRONOS ──
      </div>

      {populatedSaves.length > 0 && (
        <>
          <div style={{ color: 'var(--text-accent)', fontSize: '1.4em', fontWeight: 'bold', marginBottom: '0.4rem' }}>
            Continue
          </div>
          <div style={{ color: 'var(--text-body)', fontSize: '0.8em', marginBottom: '1.2rem' }}>
            Pick up where you left off.
          </div>
          {populatedSaves.map(({ slot, index }) => (
            <ContinueCard
              key={index}
              slotIndex={index}
              slot={slot}
              tone={worldToneMap[slot.worldId] ?? 'fantasy'}
              onClick={() => {
                const w = worlds.find(w => w.id === slot.worldId);
                onContinue(index, slot.worldId, w?.tone ?? 'fantasy', slot.worldTitle);
              }}
            />
          ))}
          <div style={{ color: 'var(--text-dim)', fontSize: '0.72em', letterSpacing: '0.1em', margin: '1.2rem 0 0.8rem', maxWidth: 560, width: '100%' }}>
            ── OR START A NEW GAME ──
          </div>
        </>
      )}

      {!populatedSaves.length && (
        <div style={{ color: 'var(--text-accent)', fontSize: '1.4em', fontWeight: 'bold', marginBottom: '0.4rem' }}>
          Choose Your World
        </div>
      )}

      {!populatedSaves.length && (
        <div style={{ color: 'var(--text-body)', fontSize: '0.8em', marginBottom: '2rem' }}>
          Each world is a complete adventure with its own rules and lore.
        </div>
      )}

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
        <div style={{ color: 'var(--error)', fontSize: '0.85em' }}>
          No worlds found. Check that the worlds/ directory is correctly bundled.
        </div>
      )}
    </div>
  );
}
