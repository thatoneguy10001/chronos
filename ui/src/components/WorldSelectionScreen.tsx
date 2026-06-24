import { useState, useEffect } from 'react';
import { listWorlds } from '@/bridge/engine';
import type { WorldMeta } from '@/bridge/engine';
import { readWorldSlots } from '@/store/gameStore';
import type { SaveSlot } from '@/store/gameStore';
import { formatGameTime } from '@/utils/time';

const TONE_COLORS: Record<string, { accent: string; dim: string }> = {
  fantasy:    { accent: '#1a4a1a', dim: 'rgba(26,74,26,0.55)' },
  dieselpunk: { accent: '#2e1a08', dim: 'rgba(46,26,8,0.5)'  },
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

function formatSlotTime(slot: SaveSlot): string {
  const { timeStr, dayStr } = formatGameTime(slot.tick);
  return `${timeStr} · ${dayStr}`;
}

function SaveRow({
  slot,
  index,
  colors,
  onClick,
}: {
  slot: SaveSlot;
  index: number;
  colors: { accent: string; dim: string };
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.4rem 0.7rem',
        borderRadius: 3,
        cursor: 'pointer',
        border: `1px solid ${hovered ? colors.accent : colors.dim}`,
        background: hovered ? 'rgba(46,26,8,0.08)' : 'rgba(46,26,8,0.03)',
        transition: 'all 0.12s',
      }}
    >
      <div>
        <span style={{ color: colors.accent, fontSize: '0.82em', fontWeight: 600, fontFamily: 'var(--font-journal)' }}>
          {slot.characterName}
        </span>
        <span style={{ color: 'var(--ink-faint)', fontSize: '0.75em', fontFamily: 'var(--font-dossier)' }}> · {slot.classId}</span>
        <div style={{ color: 'var(--ink-faint)', fontSize: '0.68em', marginTop: '0.1rem', fontFamily: 'var(--font-dossier)' }}>
          {slot.roomName ?? humanizeRoomId(slot.roomId)} · {formatSlotTime(slot)}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '1rem' }}>
        <div style={{ color: hovered ? colors.accent : colors.dim, fontSize: '0.72em', fontFamily: 'var(--font-dossier)', letterSpacing: '0.06em' }}>
          CONTINUE ▸
        </div>
        <div style={{ color: 'var(--ink-faint)', fontSize: '0.62em', fontFamily: 'var(--font-dossier)', marginTop: '0.1rem' }}>
          slot {index + 1} · {formatSavedAt(slot.savedAt)}
        </div>
      </div>
    </div>
  );
}

function NewGameButton({
  colors,
  worldId,
  onClick,
}: {
  colors: { accent: string; dim: string };
  worldId: string;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      data-testid={`new-game-${worldId}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'rgba(46,26,8,0.07)' : 'transparent',
        border: `1px solid ${hovered ? colors.accent : colors.dim}`,
        color: colors.accent,
        fontFamily: 'var(--font-dossier)',
        fontSize: '0.72em',
        padding: '0.35rem 1rem',
        cursor: 'pointer',
        borderRadius: 3,
        letterSpacing: '0.08em',
        transition: 'all 0.12s',
      }}
    >
      NEW GAME ▸
    </button>
  );
}

function WorldCard({
  world,
  onSelect,
  onContinue,
}: {
  world: WorldMeta;
  onSelect: () => void;
  onContinue: (slotIndex: number) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [saves] = useState(() => readWorldSlots(world.id));
  const colors = TONE_COLORS[world.tone] ?? TONE_COLORS['fantasy'];

  const populatedSaves = saves
    .map((s, i) => s ? { slot: s, index: i } : null)
    .filter((x): x is { slot: SaveSlot; index: number } => x !== null);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: `1px solid ${hovered ? colors.accent : colors.dim}`,
        borderRadius: 4,
        padding: '1.2rem 1.4rem',
        marginBottom: '1rem',
        background: hovered ? 'rgba(46,26,8,0.07)' : 'rgba(46,26,8,0.03)',
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

      {populatedSaves.length > 0 && (
        <div style={{ marginTop: '1rem', borderTop: `1px solid ${colors.dim}`, paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {populatedSaves.map(({ slot, index }) => (
            <SaveRow
              key={index}
              slot={slot}
              index={index}
              colors={colors}
              onClick={() => onContinue(index)}
            />
          ))}
        </div>
      )}

      <div style={{ marginTop: '0.9rem', display: 'flex', justifyContent: 'flex-end' }}>
        <NewGameButton colors={colors} worldId={world.id} onClick={onSelect} />
      </div>
    </div>
  );
}

interface WorldSelectionScreenProps {
  onSelect: (worldId: string, tone: string, title: string) => void;
  onContinue: (slotIndex: number, worldId: string, tone: string, title: string) => void;
}

export function WorldSelectionScreen({ onSelect, onContinue }: WorldSelectionScreenProps) {
  const [worlds, setWorlds] = useState<WorldMeta[]>([]);

  useEffect(() => {
    void listWorlds().then(setWorlds);
  }, []);

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start',
      fontFamily: 'var(--font-journal)',
      background: "url('/textures/teastain%20102.png') center/cover no-repeat var(--parchment)",
      padding: '10vh 2rem 2rem',
      overflowY: 'auto',
    }}>
      <div style={{ color: 'var(--ink-faint)', fontSize: '0.75em', letterSpacing: '0.15em', marginBottom: '0.5rem', fontFamily: 'var(--font-dossier)' }}>
        ── PROJECT CHRONOS ──
      </div>

      <div style={{ color: 'var(--ink-narrative)', fontSize: '1.6em', fontWeight: '600', marginBottom: '0.4rem' }}>
        Choose Your World
      </div>
      <div style={{ color: 'var(--ink-movement)', fontSize: '0.9em', marginBottom: '2rem', fontFamily: 'var(--font-dossier)' }}>
        Each world is a complete adventure with its own rules and lore.
      </div>

      {worlds.map(w => (
        <WorldCard
          key={w.id}
          world={w}
          onSelect={() => onSelect(w.id, w.tone, w.title)}
          onContinue={slotIndex => onContinue(slotIndex, w.id, w.tone, w.title)}
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
