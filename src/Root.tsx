import { useEffect, useState } from 'react';
import { App } from './App';
import { ConnectionBanner } from './components/ConnectionBanner';
import { Toasts } from './components/Toast';
import { api } from './lib/client';
import type { CharacterDto, CharacterSummary } from './shared/types';

type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; character: CharacterDto };

export function Root() {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    (async () => {
      const list = await api<CharacterSummary[]>('GET', '/characters');
      if (!live) return;
      if (!list.data) return setLoad({ state: 'error', message: list.error });
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

  return (
    <>
      <ConnectionBanner />
      {load.state === 'ready' ? (
        <App character={load.character} />
      ) : load.state === 'loading' ? (
        <div className="loading">Loading…</div>
      ) : (
        <div className="loading">
          <p>Could not load characters: {load.message}</p>
          <button className="btn" onClick={() => setAttempt((n) => n + 1)}>Retry</button>
        </div>
      )}
      <Toasts />
    </>
  );
}
