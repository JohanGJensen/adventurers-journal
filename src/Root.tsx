import { useEffect, useState } from 'react';
import { App } from './App';
import { ConnectionBanner } from './components/ConnectionBanner';
import { ImportConflictDialog } from './components/ImportConflictDialog';
import { Toasts } from './components/Toast';
import { autoImport } from './lib/autoImport';
import { api } from './lib/client';
import { toast } from './lib/toast';
import type { CharacterDto, CharacterSummary, LocalExport } from './shared/types';

type Load =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'conflict'; characterId: number; payload: LocalExport }
  | { state: 'ready'; character: CharacterDto };

export function Root() {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    (async () => {
      const list = await api<CharacterSummary[]>('GET', '/characters');
      if (!live) return;
      if (!list.data) return setLoad({ state: 'error', message: list.error });
      // Old localStorage saves go to the server before anything reads play state.
      const imp = await autoImport(list.data);
      if (!live) return;
      if (imp.status === 'conflict') return setLoad({ state: 'conflict', characterId: imp.characterId, payload: imp.payload });
      if (imp.status === 'error') toast(`Could not import local data: ${imp.message}`, 'error');
      const pick = list.data.find((x) => x.seedKey === 'faelan') ?? list.data[0];
      if (!pick) return setLoad({ state: 'error', message: 'No characters in the database' });
      const one = await api<CharacterDto>('GET', `/characters/${pick.id}`);
      if (!live) return;
      setLoad(one.data ? { state: 'ready', character: one.data } : { state: 'error', message: one.error });
    })();
    return () => {
      live = false;
    };
  }, [attempt]);

  const retry = () => setAttempt((n) => n + 1);

  return (
    <>
      <ConnectionBanner />
      {load.state === 'ready' ? (
        <App character={load.character} />
      ) : load.state === 'conflict' ? (
        <ImportConflictDialog characterId={load.characterId} payload={load.payload} onDone={retry} />
      ) : load.state === 'loading' ? (
        <div className="loading">Loading…</div>
      ) : (
        <div className="loading">
          <p>Could not load characters: {load.message}</p>
          <button className="btn" onClick={retry}>Retry</button>
        </div>
      )}
      <Toasts />
    </>
  );
}
