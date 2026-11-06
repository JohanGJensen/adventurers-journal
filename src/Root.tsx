import { useEffect, useState, type ReactNode } from 'react';
import { App } from './App';
import { CharacterList } from './components/CharacterList';
import { ConnectionBanner } from './components/ConnectionBanner';
import { ImportConflictDialog } from './components/ImportConflictDialog';
import { Toasts } from './components/Toast';
import { autoImport } from './lib/autoImport';
import { api } from './lib/client';
import { linkTo, useRoute } from './lib/router';
import { toast } from './lib/toast';
import type { CharacterDto, CharacterSummary, LocalExport } from './shared/types';

type Boot =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'conflict'; characterId: number; payload: LocalExport }
  | { state: 'ready' };

const Centered = ({ children }: { children: ReactNode }) => <div className="loading">{children}</div>;

/** Loads one character, then renders the sheet. */
function CharacterPage({ id }: { id: number }) {
  const [c, setC] = useState<CharacterDto | null | { error: string }>(null);
  useEffect(() => {
    let live = true;
    setC(null);
    api<CharacterDto>('GET', `/characters/${id}`).then((r) => live && setC(r.data ?? { error: r.error }));
    return () => {
      live = false;
    };
  }, [id]);
  if (!c) return <Centered>Loading…</Centered>;
  if ('error' in c)
    return (
      <Centered>
        <p>{c.error}</p>
        <a {...linkTo('/')}>All characters</a>
      </Centered>
    );
  return <App key={c.id} character={c} />;
}

function Routes() {
  const route = useRoute();
  switch (route.name) {
    case 'list':
      return <CharacterList />;
    case 'sheet':
      return <CharacterPage id={route.id} />;
    default:
      return (
        <Centered>
          <p>Page not found.</p>
          <a {...linkTo('/')}>All characters</a>
        </Centered>
      );
  }
}

export function Root() {
  const [boot, setBoot] = useState<Boot>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);

  // Before any page reads play state, move old localStorage saves to the server (once).
  useEffect(() => {
    let live = true;
    (async () => {
      const list = await api<CharacterSummary[]>('GET', '/characters');
      if (!live) return;
      if (!list.data) return setBoot({ state: 'error', message: list.error });
      const imp = await autoImport(list.data);
      if (!live) return;
      if (imp.status === 'conflict') return setBoot({ state: 'conflict', characterId: imp.characterId, payload: imp.payload });
      if (imp.status === 'error') toast(`Could not import local data: ${imp.message}`, 'error');
      setBoot({ state: 'ready' });
    })();
    return () => {
      live = false;
    };
  }, [attempt]);

  const retry = () => setAttempt((n) => n + 1);

  return (
    <>
      <ConnectionBanner />
      {boot.state === 'ready' ? (
        <Routes />
      ) : boot.state === 'conflict' ? (
        <ImportConflictDialog characterId={boot.characterId} payload={boot.payload} onDone={retry} />
      ) : boot.state === 'loading' ? (
        <Centered>Loading…</Centered>
      ) : (
        <Centered>
          <p>Could not reach the server: {boot.message}</p>
          <button className="btn" onClick={retry}>Retry</button>
        </Centered>
      )}
      <Toasts />
    </>
  );
}
