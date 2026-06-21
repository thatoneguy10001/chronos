import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@/components/Terminal';
import { InputManager } from '@/components/InputManager';
import { TimelineDebugPanel } from '@/components/TimelineDebugPanel';
import { CharacterPanel } from '@/components/CharacterPanel';
import { WorldSelectionScreen } from '@/components/WorldSelectionScreen';
import { CharacterCreationScreen } from '@/components/CharacterCreationScreen';
import { SaveLoadModal } from '@/components/SaveLoadModal';
import { JournalModal } from '@/components/JournalModal';
import { RoomHeader } from '@/components/RoomHeader';
import { VitalsBar } from '@/components/VitalsBar';
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
      fontFamily: 'monospace',
      background: 'var(--bg-panel)',
      gap: '1.5rem',
    }}>
      <div style={{ color: 'var(--text-dim)', fontSize: '0.8em', letterSpacing: '0.2em' }}>── {worldTitle.toUpperCase()} ──</div>
      <div style={{ color: 'var(--danger)', fontSize: '2em', fontWeight: 'bold', letterSpacing: '0.1em' }}>YOU DIED</div>
      <div style={{ color: 'var(--danger-border)', fontSize: '0.85em' }}>Your story ends here.</div>
      <button
        onClick={onRestart}
        style={{
          marginTop: '1rem',
          background: 'transparent',
          border: '1px solid var(--danger)',
          color: 'var(--danger-text)',
          fontFamily: 'monospace',
          fontSize: '0.9em',
          padding: '0.5rem 2rem',
          cursor: 'pointer',
          letterSpacing: '0.1em',
        }}
        onMouseEnter={e => { (e.target as HTMLElement).style.background = '#1a0000'; }}
        onMouseLeave={e => { (e.target as HTMLElement).style.background = 'transparent'; }}
      >
        RESTART
      </button>
    </div>
  );
}

export function App() {
  const init           = useGameStore(s => s.init);
  const initialized    = useGameStore(s => s.initialized);
  const submitCommand  = useGameStore(s => s.submitCommand);
  const playerCharacter = useGameStore(s => s.playerCharacter);

  const closeJournal = useGameStore(s => s.closeJournal);
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
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeJournal]);

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
      display: 'flex',
      flexDirection: 'row',
      maxWidth: '1100px',
      margin: '0 auto',
    }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <RoomHeader />
        <VitalsBar devMode={devMode} />
        <Terminal />
        <InputManager onCommand={submitCommand} />
        {devMode && <TimelineDebugPanel />}
      </div>
      <CharacterPanel />
      <SaveLoadModal />
      <JournalModal />
    </div>
  );
}
