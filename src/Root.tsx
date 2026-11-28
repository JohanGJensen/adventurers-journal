import { useEffect, useState, type ReactNode } from 'react';
import { App } from './App';
import { CharacterList } from './components/CharacterList';
import { CreateCharacter } from './components/create/CreateCharacter';
import { HistoryLog } from './components/HistoryLog';
import { MapPage } from './components/JourneyMap';
import { LorePage } from './components/Lore';
import { LegacyNotesRedirect, Notes } from './components/notes/NotesPage';
import { HomebrewLibrary } from './components/HomebrewLibrary';
import { HomebrewEditor } from './components/HomebrewEditor';
import { Toasts } from './components/Toast';
import { api } from './lib/client';
import { linkTo, useRoute } from './lib/router';
import type { CharacterDto, CharacterSummary } from './shared/types';
import { Loader } from './components/Loader';
import { KitPage } from './components/kit/KitPage';

type Boot =
  | { state: 'loading' }
  | { state: 'error'; message: string }
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
  if (!c) return <Loader size="page" label="Opening the journal" />;
  if ('error' in c)
    return (
      <Centered>
        <p>{c.error}</p>
        <a {...linkTo('/')}>All characters</a>
      </Centered>
    );
  return <App key={c.id} character={c} onCharacterChange={setC} />;
}

function Routes() {
  const route = useRoute();
  switch (route.name) {
    case 'list':
      return <CharacterList />;
    case 'create':
      return <CreateCharacter />;
    case 'sheet':
      return <CharacterPage id={route.id} />;
    case 'log':
      return <HistoryLog key={route.id} characterId={route.id} />;
    case 'map':
      return <MapPage key={route.id} characterId={route.id} />;
    case 'lore':
      return <LorePage key={route.id} characterId={route.id} />;
    case 'notes':
      return <Notes key={route.id} characterId={route.id} query={route.query} />;
    case 'legacyNotes':
      return <LegacyNotesRedirect query={route.query} />;
    case 'homebrew':
      return <HomebrewLibrary />;
    case 'homebrewEdit':
      return <HomebrewEditor key={String(route.id)} id={route.id} query={route.query} />;
    case 'kit':
      if (import.meta.env.DEV) return <KitPage />;
    // falls through: no kit page in a built app
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

  // Checks the API answers before rendering pages.
  useEffect(() => {
    let live = true;
    api<CharacterSummary[]>('GET', '/characters').then((list) => {
      if (!live) return;
      setBoot(list.data ? { state: 'ready' } : { state: 'error', message: list.error });
    });
    return () => {
      live = false;
    };
  }, [attempt]);

  const retry = () => setAttempt((n) => n + 1);

  return (
    <>
      {boot.state === 'ready' ? (
        <Routes />
      ) : boot.state === 'loading' ? (
        <Loader size="page" label="Unsealing the journal" />
      ) : (
        <Centered>
          <p>Could not load data: {boot.message}</p>
          <button className="btn" onClick={retry}>Retry</button>
        </Centered>
      )}
      <Toasts />
    </>
  );
}
