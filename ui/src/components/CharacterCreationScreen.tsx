import { useState, useEffect } from 'react';
import { listPlayableClasses } from '@/bridge/engine';
import type { ClassMeta } from '@/bridge/engine';

const TONE_COLORS: Record<string, { accent: string; dim: string; stat: string }> = {
  fantasy:    { accent: '#4a9a4a', dim: '#2a5a2a', stat: '#c8ffb0' },
  dieselpunk: { accent: '#9a7a2a', dim: '#5a4a1a', stat: '#ffd080' },
};

const DEFAULT_COLORS = TONE_COLORS['fantasy'];

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 44 }}>
      <span style={{ color, fontWeight: 'bold', fontSize: '0.9em' }}>{value}</span>
      <span style={{ color: '#4a5a4a', fontSize: '0.65em', letterSpacing: '0.06em' }}>{label}</span>
    </div>
  );
}

function ClassCard({
  cls,
  hovered,
  colors,
  onHover,
  onSelect,
}: {
  cls: ClassMeta;
  hovered: boolean;
  colors: typeof DEFAULT_COLORS;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const { hp, attack, defense, intelligence } = cls.base_stats;

  return (
    <div
      onClick={() => onSelect(cls.id)}
      onMouseEnter={() => onHover(cls.id)}
      onMouseLeave={() => onHover(null)}
      style={{
        border: `1px solid ${hovered ? colors.accent : colors.dim}`,
        borderRadius: 4,
        padding: '1rem 1.2rem',
        cursor: 'pointer',
        background: hovered ? '#0d0d0d' : 'transparent',
        transition: 'all 0.15s',
        width: 240,
        flexShrink: 0,
      }}
    >
      <div style={{ color: colors.accent, fontWeight: 'bold', fontSize: '0.95em', marginBottom: '0.2rem' }}>
        {cls.name}
      </div>
      <div style={{ color: '#6a8a6a', fontSize: '0.72em', lineHeight: 1.45, marginBottom: '0.7rem', minHeight: '3.2em' }}>
        {cls.description}
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', justifyContent: 'space-around', borderTop: `1px solid ${colors.dim}`, borderBottom: `1px solid ${colors.dim}`, padding: '0.5rem 0', marginBottom: '0.7rem' }}>
        <StatPill label="HP"  value={hp}           color={hovered ? '#ff8888' : '#884444'} />
        <StatPill label="ATK" value={attack}        color={hovered ? colors.stat : colors.dim} />
        <StatPill label="DEF" value={defense}       color={hovered ? colors.stat : colors.dim} />
        <StatPill label="INT" value={intelligence}  color={hovered ? colors.stat : colors.dim} />
      </div>

      {/* Abilities */}
      <div style={{ fontSize: '0.68em', color: colors.dim, letterSpacing: '0.06em', marginBottom: '0.3rem' }}>
        ABILITIES
      </div>
      {cls.abilities.map(a => (
        <div key={a.id} style={{ fontSize: '0.72em', color: hovered ? '#8a9a7a' : '#4a5a4a', marginBottom: 2 }}>
          · {a.name}
        </div>
      ))}
    </div>
  );
}

interface CharacterCreationScreenProps {
  worldId: string;
  tone: string;
  worldTitle: string;
  onSelect: (classId: string) => void;
}

export function CharacterCreationScreen({ worldId, tone, worldTitle, onSelect }: CharacterCreationScreenProps) {
  const [classes, setClasses] = useState<ClassMeta[]>([]);
  const colors = TONE_COLORS[tone] ?? DEFAULT_COLORS;
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    void listPlayableClasses(worldId).then(setClasses);
  }, [worldId]);

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
      <div style={{ color: colors.dim, fontSize: '0.72em', letterSpacing: '0.15em', marginBottom: '0.5rem' }}>
        ── {worldTitle.toUpperCase()} ──
      </div>
      <div style={{ color: colors.accent, fontSize: '1.4em', fontWeight: 'bold', marginBottom: '0.4rem' }}>
        Choose Your Class
      </div>
      <div style={{ color: '#4a6a4a', fontSize: '0.8em', marginBottom: '2rem' }}>
        Your class defines your stats and abilities for this run.
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center', maxWidth: 1100 }}>
        {classes.map(cls => (
          <ClassCard
            key={cls.id}
            cls={cls}
            hovered={hovered === cls.id}
            colors={colors}
            onHover={setHovered}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
