import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { WorldSelectionScreen } from '@/components/WorldSelectionScreen';
import { BuildModeScreen } from '@/components/BuildModeScreen';
import { CharacterCreationScreen } from '@/components/CharacterCreationScreen';
import { SaveLoadModal } from '@/components/SaveLoadModal';
import { JournalModal } from '@/components/JournalModal';
import { TopChrome } from '@/components/TopChrome';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { NavBar } from '@/components/NavBar';
import { useGameStore } from '@/store/gameStore';

const ExploreScreen   = lazy(() => import('@/components/ExploreScreen').then(m => ({ default: m.ExploreScreen })));
const CombatScreen    = lazy(() => import('@/components/CombatScreen').then(m => ({ default: m.CombatScreen })));
const InventoryScreen = lazy(() => import('@/components/InventoryScreen').then(m => ({ default: m.InventoryScreen })));
const CharacterScreen = lazy(() => import('@/components/CharacterScreen').then(m => ({ default: m.CharacterScreen })));

function GameOverScreen({ worldTitle, onRestart }: { worldTitle: string; onRestart: () => void }) {
  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-dossier)',
      background: 'var(--ui-bg)',
      gap: '1.5rem',
    }}>
      <div style={{ color: 'var(--ui-gold-dim)', fontSize: 10, letterSpacing: '0.2em' }}>── {worldTitle.toUpperCase()} ──</div>
      <div style={{ color: 'var(--ui-red-hi)', fontSize: '2.2em', fontWeight: '600', fontFamily: 'Georgia, serif' }}>You are dead.</div>
      <div style={{ color: 'var(--ui-dim)', fontSize: '0.9em', fontStyle: 'italic' }}>Your story ends here.</div>
      <button
        onClick={onRestart}
        style={{
          marginTop: '1rem',
          background: 'transparent',
          border: '1px solid var(--ui-red-dim)',
          color: 'var(--ui-red-hi)',
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
  const currentTick   = useGameStore(s => s.currentTick);
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(null);
  const [worldTone,  setWorldTone]  = useState('fantasy');
  const [worldTitle, setWorldTitle] = useState('');
  const [initError,  setInitError]  = useState<string | null>(null);
  // Top-level app mode: 'play' runs a world, 'build' edits one. The master switch
  // for the platform vision — the same engine eventually runs both.
  const [appMode, setAppMode] = useState<'play' | 'build'>('play');

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

  // Build Mode takes over the whole screen, before any world is loaded for play.
  if (appMode === 'build') {
    return <BuildModeScreen onExit={() => setAppMode('play')} />;
  }

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
        onEnterBuildMode={() => setAppMode('build')}
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
      background: 'var(--ui-bg)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
    }}>
      {/* Dark game frame */}
      <div data-tick={currentTick} style={{
        width: 'min(1180px, 100%)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid var(--ui-gold-border)',
        background: 'var(--ui-bg)',
        overflow: 'hidden',
        boxShadow: '0 0 60px rgba(0,0,0,0.8)',
      }}>
        <TopChrome />

        {/* Body: routed by activeScreen */}
        <ErrorBoundary>
          <Suspense fallback={null}>
            {activeScreen === 'explore'   && <ExploreScreen />}
            {activeScreen === 'combat'    && <CombatScreen />}
            {activeScreen === 'inventory' && <InventoryScreen />}
            {activeScreen === 'character' && <CharacterScreen />}
          </Suspense>
        </ErrorBoundary>

        <NavBar />
      </div>

      <SaveLoadModal />
      <JournalModal />
    </div>
  );
}
