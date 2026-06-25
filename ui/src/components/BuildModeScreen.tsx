import { useState } from 'react';

/**
 * Build Mode — the in-app world editor shell.
 *
 * This is the master-switch destination: from the main menu the player flips
 * into Build Mode and authors a world that the *same* engine then runs. For now
 * this is the scaffold — a titled shell with the editor sections that later
 * Phase-3 work fills in (layer stack, rooms, NPCs, items, quests, test, export).
 * Each section is shown as a disabled row so the structure is legible before the
 * editors exist.
 *
 * It produces no world data yet; it only proves the routing — you can enter Build
 * Mode and return to the menu — which is the foundation everything else hangs off.
 */

interface BuildSection {
  key: string;
  label: string;
  blurb: string;
}

// The editor sections, in the order a world author would naturally work through
// them. Mirrors the world JSON the engine already consumes.
const SECTIONS: BuildSection[] = [
  { key: 'layers', label: 'Layer Stack', blurb: 'Pick the systems that define your genre (space, combat, dialogue, …).' },
  { key: 'rooms', label: 'Rooms & Map', blurb: 'Lay out locations and the exits that connect them.' },
  { key: 'npcs', label: 'NPCs & Dialogue', blurb: 'Place characters and write what they say.' },
  { key: 'items', label: 'Items, Classes & Enemies', blurb: 'Define gear, playable classes, and the things that fight you.' },
  { key: 'quests', label: 'Quests', blurb: 'Chain objectives into a story.' },
  { key: 'test', label: 'Test Play', blurb: 'Drop into your world and play it instantly.' },
  { key: 'export', label: 'Export & Share', blurb: 'Save the world to a file others can play.' },
];

export function BuildModeScreen({ onExit }: { onExit: () => void }) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        fontFamily: 'var(--font-journal)',
        background: "url('/textures/teastain%20102.png') center/cover no-repeat var(--parchment)",
        padding: '8vh 2rem 2rem',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          color: 'var(--ink-faint)',
          fontSize: '0.75em',
          letterSpacing: '0.15em',
          marginBottom: '0.5rem',
          fontFamily: 'var(--font-dossier)',
        }}
      >
        ── BUILD MODE ──
      </div>

      <div style={{ color: 'var(--ink-narrative)', fontSize: '1.6em', fontWeight: 600, marginBottom: '0.4rem' }}>
        World Builder
      </div>
      <div
        style={{
          color: 'var(--ink-movement)',
          fontSize: '0.9em',
          marginBottom: '2rem',
          fontFamily: 'var(--font-dossier)',
          maxWidth: 560,
          textAlign: 'center',
          lineHeight: 1.5,
        }}
      >
        Build your own world. The same engine that runs Iron &amp; Blood will run yours —
        whatever you make here is a world the game can play.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', width: 'min(560px, 100%)' }}>
        {SECTIONS.map(section => (
          <div
            key={section.key}
            onMouseEnter={() => setHovered(section.key)}
            onMouseLeave={() => setHovered(null)}
            style={{
              border: '1px solid var(--ink-faint)',
              borderRadius: 2,
              padding: '0.85rem 1rem',
              background: hovered === section.key ? 'rgba(0,0,0,0.04)' : 'transparent',
              opacity: 0.6,
              cursor: 'default',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ color: 'var(--ink-narrative)', fontWeight: 600, fontSize: '1em' }}>
                {section.label}
              </span>
              <span
                style={{
                  color: 'var(--ink-faint)',
                  fontSize: '0.65em',
                  letterSpacing: '0.12em',
                  fontFamily: 'var(--font-dossier)',
                }}
              >
                COMING SOON
              </span>
            </div>
            <div style={{ color: 'var(--ink-movement)', fontSize: '0.8em', marginTop: '0.25rem', fontFamily: 'var(--font-dossier)' }}>
              {section.blurb}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onExit}
        style={{
          marginTop: '2rem',
          background: 'transparent',
          border: '1px solid var(--ink-faint)',
          color: 'var(--ink-narrative)',
          fontFamily: 'var(--font-dossier)',
          fontSize: '0.8em',
          padding: '0.5rem 1.75rem',
          cursor: 'pointer',
          letterSpacing: '0.12em',
        }}
      >
        ← BACK TO MENU
      </button>
    </div>
  );
}
