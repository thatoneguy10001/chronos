import { useState, useEffect } from 'react';
import { listPlayableClasses } from '@/bridge/engine';
import type { ClassMeta } from '@/bridge/engine';

const TONE_COLORS: Record<string, { accent: string; dim: string; stat: string }> = {
  fantasy:    { accent: '#1a4a1a', dim: 'rgba(26,74,26,0.55)',  stat: '#2a6a2a' },
  dieselpunk: { accent: '#2e1a08', dim: 'rgba(46,26,8,0.5)',   stat: '#6b3a10' },
};

const DEFAULT_COLORS = TONE_COLORS['fantasy'];

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 44 }}>
      <span style={{ color, fontWeight: 'bold', fontSize: '0.9em' }}>{value}</span>
      <span style={{ color: 'var(--ink-faint)', fontSize: '0.65em', letterSpacing: '0.06em', fontFamily: 'var(--font-dossier)' }}>{label}</span>
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
        background: hovered ? 'rgba(46,26,8,0.07)' : 'rgba(46,26,8,0.02)',
        transition: 'all 0.15s',
        width: 240,
        flexShrink: 0,
      }}
    >
      <div style={{ color: colors.accent, fontWeight: '600', fontSize: '1.05em', marginBottom: '0.2rem' }}>
        {cls.name}
      </div>
      <div style={{ color: 'var(--ink-narrative)', fontSize: '0.78em', lineHeight: 1.55, marginBottom: '0.7rem', minHeight: '3.2em', opacity: 0.8 }}>
        {cls.description}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-around', borderTop: `1px solid ${colors.dim}`, borderBottom: `1px solid ${colors.dim}`, padding: '0.5rem 0', marginBottom: '0.7rem' }}>
        <StatPill label="HP"  value={hp}           color={hovered ? 'var(--danger-low)' : 'var(--danger)'} />
        <StatPill label="ATK" value={attack}        color={hovered ? colors.stat : colors.dim} />
        <StatPill label="DEF" value={defense}       color={hovered ? colors.stat : colors.dim} />
        <StatPill label="INT" value={intelligence}  color={hovered ? colors.stat : colors.dim} />
      </div>

      <div style={{ fontSize: '0.65em', color: colors.dim, letterSpacing: '0.1em', marginBottom: '0.3rem', fontFamily: 'var(--font-dossier)' }}>
        ABILITIES
      </div>
      {cls.abilities.map(a => (
        <div key={a.id} style={{ fontSize: '0.78em', color: hovered ? 'var(--ink-narrative)' : 'var(--ink-faint)', marginBottom: 2 }}>
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
      fontFamily: 'var(--font-journal)',
      background: "url('/textures/teastain%20102.png') center/cover no-repeat var(--parchment)",
      padding: '2rem',
    }}>
      <div style={{ color: 'var(--ink-faint)', fontSize: '0.75em', letterSpacing: '0.15em', marginBottom: '0.5rem', fontFamily: 'var(--font-dossier)' }}>
        ── {worldTitle.toUpperCase()} ──
      </div>
      <div style={{ color: 'var(--ink-narrative)', fontSize: '1.6em', fontWeight: '600', marginBottom: '0.4rem' }}>
        Choose Your Class
      </div>
      <div style={{ color: 'var(--ink-movement)', fontSize: '0.9em', marginBottom: '2rem', fontFamily: 'var(--font-dossier)' }}>
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
