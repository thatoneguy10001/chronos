import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@/components/Terminal';
import { InputManager } from '@/components/InputManager';
import { TimelineDebugPanel } from '@/components/TimelineDebugPanel';
import { CharacterPanel } from '@/components/CharacterPanel';
import { WorldSelectionScreen } from '@/components/WorldSelectionScreen';
import { CharacterCreationScreen } from '@/components/CharacterCreationScreen';
import { SaveLoadModal } from '@/components/SaveLoadModal';
import { JournalModal } from '@/components/JournalModal';
import { StatusHeader } from '@/components/StatusHeader';
import { FooterHints } from '@/components/FooterHints';
import { CombatScreen } from '@/components/CombatScreen';
import { InventoryScreen } from '@/components/InventoryScreen';
import { CharacterScreen } from '@/components/CharacterScreen';
import { NavBar } from '@/components/NavBar';
import { useGameStore } from '@/store/gameStore';
import { useDevMode } from '@/hooks/useDevMode';

function GameOverScreen({ worldTitle, onRestart }: { worldTitle: string; onRestart: () => void }) {
  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-journal)',
      background: "url('/textures/teastain%20102.png') center/cover no-repeat var(--parchment)",
      gap: '1.5rem',
    }}>
      <div style={{ color: 'var(--ink-faint)', fontSize: '0.75em', letterSpacing: '0.2em', fontFamily: 'var(--font-dossier)' }}>── {worldTitle.toUpperCase()} ──</div>
      <div style={{ color: 'var(--ink-combat)', fontSize: '2.4em', fontWeight: '600' }}>You are dead.</div>
      <div style={{ color: 'var(--ink-movement)', fontSize: '1em', fontStyle: 'italic', opacity: 0.7 }}>Your story ends here.</div>
      <button
        onClick={onRestart}
        style={{
          marginTop: '1rem',
          background: 'transparent',
          border: '1px solid var(--ink-combat)',
          color: 'var(--ink-combat)',
          fontFamily: 'var(--font-dossier)',
          fontSize: '0.85em',
          padding: '0.5rem 2rem',
          cursor: 'pointer',
          letterSpacing: '0.12em',
          opacity: 0.75,
        }}
        onMouseEnter={e => { (e.target as HTMLElement).style.opacity = '1'; }}
        onMouseLeave={e => { (e.target as HTMLElement).style.opacity = '0.75'; }}
      >
        BEGIN AGAIN
      </button>
    </div>
  );
}

export function App() {
  const init            = useGameStore(s => s.init);
  const initialized     = useGameStore(s => s.initialized);
  const submitCommand   = useGameStore(s => s.submitCommand);
  const playerCharacter = useGameStore(s => s.playerCharacter);
  const activeScreen    = useGameStore(s => s.activeScreen);

  const closeJournal  = useGameStore(s => s.closeJournal);
  const openJournal   = useGameStore(s => s.openJournal);
  const journalOpen   = useGameStore(s => s.journalOpen);
  const devMode = useDevMode();
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(null);
  const [worldTone,  setWorldTone]  = useState('fantasy');
  const [worldTitle, setWorldTitle] = useState('');
  const [initError,  setInitError]  = useState<string | null>(null);

  const pendingSlotRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!selectedWorldId) return;
    const slot = pendingSlotRef.current;
    pendingSlotRef.current = undefined;
    init(selectedWorldId, slot).catch(err => setInitError(String(err)));
  }, [selectedWorldId, init]);

  useEffect(() => {
    const rewindToTick = useGameStore.getState().rewindToTick;
    const getSnapshot = () => useGameStore.getState();
    (window as any).__gameCmd = submitCommand;
    (window as any).__rewindToTick = rewindToTick;
    (window as any).__getState = getSnapshot;
  }, [submitCommand]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeJournal();
      if (e.key === 'j' || e.key === 'J') {
        const active = document.activeElement;
        const isTyping = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
        if (!isTyping) journalOpen ? closeJournal() : openJournal();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeJournal, openJournal, journalOpen]);

  if (!selectedWorldId) {
    return (
      <WorldSelectionScreen
        onSelect={(id, tone, title) => {
          setSelectedWorldId(id);
          setWorldTone(tone);
          setWorldTitle(title);
        }}
        onContinue={(slotIndex, worldId, tone, title) => {
          pendingSlotRef.current = slotIndex;
          setSelectedWorldId(worldId);
          setWorldTone(tone);
          setWorldTitle(title);
        }}
      />
    );
  }

  if (initError) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--error)',
        fontFamily: 'monospace',
        padding: '2rem',
        whiteSpace: 'pre-wrap',
      }}>
        {`Engine failed to load:\n\n${initError}`}
      </div>
    );
  }

  if (!initialized) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-label)',
        fontFamily: 'monospace',
      }}>
        Loading engine...
      </div>
    );
  }

  if (!playerCharacter) {
    return (
      <CharacterCreationScreen
        worldId={selectedWorldId}
        tone={worldTone}
        worldTitle={worldTitle}
        onSelect={classId => submitCommand(`become ${classId}`)}
      />
    );
  }

  if (playerCharacter.hp <= 0) {
    return (
      <GameOverScreen
        worldTitle={worldTitle}
        onRestart={() => init(selectedWorldId).catch(err => setInitError(String(err)))}
      />
    );
  }

  return (
    <div style={{
      height: '100vh',
      background: 'var(--leather)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '0.75rem',
    }}>
      {/* Parchment journal — the main frame */}
      <div style={{
        width: 'min(1180px, 100%)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid var(--leather-border)',
        background: "url('/textures/teastain%20102.png') center/cover no-repeat var(--parchment)",
        overflow: 'hidden',
        fontFamily: 'var(--font-journal)',
        boxShadow: '0 0 40px rgba(0,0,0,0.6), inset 0 0 60px rgba(0,0,0,0.08)',
      }}>
        <StatusHeader devMode={devMode} />

        {/* Body: routed by activeScreen */}
        {activeScreen === 'explore' && (
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <Terminal />
              <InputManager onCommand={submitCommand} />
              {devMode && <TimelineDebugPanel />}
            </div>
            <CharacterPanel />
          </div>
        )}

        {activeScreen === 'combat' && <CombatScreen />}
        {activeScreen === 'inventory' && <InventoryScreen />}
        {activeScreen === 'character' && <CharacterScreen />}

        <NavBar />
        <FooterHints />
      </div>

      <SaveLoadModal />
      <JournalModal />
    </div>
  );
}
