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
import type { SerializedWorld } from '@/build/serialize';

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
  const initDraft       = useGameStore(s => s.initDraft);
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
  // A serialized draft being test-played from Build Mode. When set, the play flow
  // boots from it instead of a bundled world id — same engine, same screens.
  const [draftWorld, setDraftWorld] = useState<SerializedWorld | null>(null);

  const pendingSlotRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    // Test Play: boot the in-memory draft world rather than a world loaded by id.
    if (draftWorld) {
      initDraft(draftWorld).catch(err => setInitError(String(err)));
      return;
    }
    if (!selectedWorldId) return;
    const slot = pendingSlotRef.current;
    pendingSlotRef.current = undefined;
    init(selectedWorldId, slot).catch(err => setInitError(String(err)));
  }, [selectedWorldId, draftWorld, init, initDraft]);

  // Leave Test Play and return to the builder, with the draft untouched.
  const exitTestPlay = () => {
    setDraftWorld(null);
    setSelectedWorldId(null);
    setInitError(null);
    setAppMode('build');
  };

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
    return (
      <BuildModeScreen
        onExit={() => setAppMode('play')}
        onTestPlay={world => {
          setWorldTitle(world.meta.title);
          setWorldTone(world.meta.tone);
          setDraftWorld(world);
          setAppMode('play');
        }}
      />
    );
  }

  if (!selectedWorldId && !draftWorld) {
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

  // The world currently in play — a bundled id, or the draft's synthetic id.
  const activeWorldId = selectedWorldId ?? draftWorld?.meta.id ?? '';

  // A small "leave Test Play" affordance, shown only while test-playing a draft so
  // the author can always get back to the builder.
  const testPlayExit = draftWorld ? (
    <button
      onClick={exitTestPlay}
      style={{
        position: 'fixed',
        top: 12,
        right: 12,
        zIndex: 1000,
        background: 'var(--ui-bg, #1a1a1a)',
        border: '1px solid var(--ui-gold-border, #6b5a2e)',
        color: 'var(--ui-gold-hi, #d8c690)',
        fontFamily: 'var(--font-dossier, monospace)',
        fontSize: '0.72em',
        letterSpacing: '0.12em',
        padding: '0.4rem 0.9rem',
        cursor: 'pointer',
        opacity: 0.85,
      }}
    >
      ⚒ EXIT TEST PLAY
    </button>
  ) : null;

  if (initError) {
    return (
      <>
        {testPlayExit}
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
      </>
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
      <>
        {testPlayExit}
        <CharacterCreationScreen
          worldId={activeWorldId}
          tone={worldTone}
          worldTitle={worldTitle}
          onSelect={classId => submitCommand(`become ${classId}`)}
        />
      </>
    );
  }

  if (playerCharacter.hp <= 0) {
    return (
      <>
        {testPlayExit}
        <GameOverScreen
          worldTitle={worldTitle}
          onRestart={() =>
            (draftWorld ? initDraft(draftWorld) : init(activeWorldId)).catch(err => setInitError(String(err)))
          }
        />
      </>
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
      {testPlayExit}
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
