import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/client';
import { linkTo } from '../lib/router';
import { toast } from '../lib/toast';
import type { CharacterDto, EventRow, EventType } from '../shared/types';

const FILTERS: { label: string; types: EventType[] }[] = [
  { label: 'Rolls', types: ['roll'] },
  { label: 'HP', types: ['damage', 'heal', 'temp_hp'] },
  { label: 'Spells & slots', types: ['slot', 'spells'] },
  { label: 'Rests', types: ['rest'] },
  { label: 'Conditions', types: ['condition'] },
  { label: 'Items & coins', types: ['item', 'coins'] },
  { label: 'Levels', types: ['level'] },
  { label: 'Imports', types: ['import'] },
];

const ICON: Record<EventType, string> = {
  roll: '🎲', damage: '💥', heal: '💚', temp_hp: '🛡', slot: '✨', spells: '📜', rest: '🌙',
  condition: '⚠', item: '🎒', coins: '🪙', import: '⇪', level: '⭐',
};

// SQLite datetime('now') lacks a zone; strftime(...'Z') has one. Both are UTC.
const parseAt = (at: string) => new Date(/[zZ]$/.test(at) ? at : `${at.replace(' ', 'T')}Z`);
const dayKey = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

export function HistoryLog({ characterId }: { characterId: number }) {
  const [character, setCharacter] = useState<CharacterDto | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<string[]>([]);

  const types = FILTERS.filter((f) => active.includes(f.label)).flatMap((f) => f.types);
  const typeParam = types.join(',');

  const fetchPage = useCallback(
    async (before: string | null) => {
      setLoading(true);
      const q = new URLSearchParams({ limit: '50' });
      if (typeParam) q.set('type', typeParam);
      if (before) q.set('before', before);
      const r = await api<{ events: EventRow[]; next: string | null }>('GET', `/characters/${characterId}/events?${q}`);
      setLoading(false);
      if (r.error !== undefined) {
        toast(`Could not load history: ${r.error}`, 'error');
        return;
      }
      setEvents((prev) => (before ? [...prev, ...r.data.events] : r.data.events));
      setNext(r.data.next);
    },
    [characterId, typeParam],
  );

  useEffect(() => {
    void fetchPage(null);
  }, [fetchPage]);

  useEffect(() => {
    api<CharacterDto>('GET', `/characters/${characterId}`).then((r) => {
      if (r.data) {
        setCharacter(r.data);
        document.title = `History · ${r.data.name}`;
      }
    });
  }, [characterId]);

  const groups: { day: string; items: EventRow[] }[] = [];
  for (const e of events) {
    const day = dayKey(parseAt(e.at));
    if (groups.at(-1)?.day !== day) groups.push({ day, items: [] });
    groups.at(-1)!.items.push(e);
  }

  const toggle = (label: string) => setActive((a) => (a.includes(label) ? a.filter((x) => x !== label) : [...a, label]));

  return (
    <main className="sheet log-page">
      <nav className="sheet-nav">
        <a {...linkTo('/')}>← All characters</a>
        <a {...linkTo(`/c/${characterId}`)}>Sheet</a>
        <a {...linkTo(`/notes?character=${characterId}`)}>Notes</a>
      </nav>
      <header className="list-head">
        <h1>History{character ? ` · ${character.name}` : ''}</h1>
      </header>
      <div className="chips log-filters" role="group" aria-label="Filter by type">
        {FILTERS.map((f) => (
          <button key={f.label} className={`chip ${active.includes(f.label) ? 'on' : ''}`} aria-pressed={active.includes(f.label)} onClick={() => toggle(f.label)}>
            {f.label}
          </button>
        ))}
        {active.length > 0 && <button className="btn ghost small" onClick={() => setActive([])}>Clear</button>}
      </div>

      {!loading && !events.length && <p className="hint">Nothing logged yet{active.length ? ' for these filters' : ''}.</p>}
      {groups.map((g) => (
        <section key={g.day} className="card log-day">
          <h2>{g.day}</h2>
          <ol className="log-list">
            {g.items.map((e) => (
              <li key={e.id} className={`log-item log-${e.type}`}>
                <time dateTime={parseAt(e.at).toISOString()}>{parseAt(e.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</time>
                <span className="log-icon" aria-hidden="true">{ICON[e.type] ?? '•'}</span>
                <span>{e.summary}</span>
              </li>
            ))}
          </ol>
        </section>
      ))}
      {next && (
        <button className="btn ghost" disabled={loading} onClick={() => void fetchPage(next)}>
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </main>
  );
}
