import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/client';
import { linkTo, navigate } from '../lib/router';
import { toast } from '../lib/toast';
import { NOTE_KINDS, type Campaign, type CharacterSummary, type Note, type NoteKind } from '../shared/types';
import { Loader } from './Loader';

/** "k:3" = campaign 3, "c:1" = character 1, "" = everything. */
type Owner = string;
const ownerOf = (n: Pick<Note, 'campaignId' | 'characterId'>): Owner => (n.campaignId ? `k:${n.campaignId}` : `c:${n.characterId}`);
const ownerBody = (o: Owner) =>
  o.startsWith('k:') ? { campaignId: Number(o.slice(2)), characterId: null } : { campaignId: null, characterId: Number(o.slice(2)) };

interface Draft {
  title: string;
  body: string;
  kind: NoteKind;
  owner: Owner;
}
const toDraft = (n: Note): Draft => ({ title: n.title, body: n.body, kind: n.kind, owner: ownerOf(n) });
const sameDraft = (a: Draft, b: Draft) => a.title === b.title && a.body === b.body && a.kind === b.kind && a.owner === b.owner;

const parseAt = (at: string) => new Date(/[zZ]$/.test(at) ? at : `${at.replace(' ', 'T')}Z`);

export function Notes({ query }: { query: URLSearchParams }) {
  const filter: Owner = query.get('campaign') ? `k:${query.get('campaign')}` : query.get('character') ? `c:${query.get('character')}` : '';
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [chars, setChars] = useState<CharacterSummary[]>([]);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<NoteKind | ''>('');
  const [selected, setSelected] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const saved = useRef<Draft | null>(null);

  useEffect(() => {
    document.title = 'Notes · Adventurers Journal';
    api<Campaign[]>('GET', '/campaigns').then((r) => r.data && setCampaigns(r.data));
    api<CharacterSummary[]>('GET', '/characters').then((r) => r.data && setChars(r.data));
  }, []);

  const refresh = useCallback(async () => {
    const p = new URLSearchParams();
    if (filter.startsWith('k:')) p.set('campaign', filter.slice(2));
    if (filter.startsWith('c:')) p.set('character', filter.slice(2));
    if (kind) p.set('kind', kind);
    if (q.trim()) p.set('q', q.trim());
    const r = await api<Note[]>('GET', `/notes?${p}`);
    if (r.data) setNotes(r.data);
    else toast(`Could not load notes: ${r.error}`, 'error');
  }, [filter, kind, q]);

  // Debounced so typing in search doesn't fire a request per key.
  useEffect(() => {
    const t = setTimeout(() => void refresh(), 200);
    return () => clearTimeout(t);
  }, [refresh]);

  const save = useCallback(async () => {
    if (selected === null || !draft || (saved.current && sameDraft(draft, saved.current))) return;
    const r = await api<Note>('PATCH', `/notes/${selected}`, { title: draft.title, body: draft.body, kind: draft.kind, ...ownerBody(draft.owner) });
    if (r.error !== undefined) return toast(`Could not save note: ${r.error}`, 'error');
    saved.current = toDraft(r.data);
    setNotes((ns) => ns && [r.data, ...ns.filter((n) => n.id !== r.data.id)]);
  }, [selected, draft]);

  const open = async (n: Note) => {
    await save();
    setSelected(n.id);
    setDraft(toDraft(n));
    saved.current = toDraft(n);
  };

  const create = async () => {
    await save();
    const owner = filter || (campaigns[0] ? `k:${campaigns[0].id}` : chars[0] ? `c:${chars[0].id}` : '');
    if (!owner) return toast('Create a campaign or a character first', 'error');
    const r = await api<Note>('POST', '/notes', { title: 'New note', kind: kind || 'note', ...ownerBody(owner) });
    if (r.error !== undefined) return toast(r.error, 'error');
    setNotes((ns) => [r.data, ...(ns ?? [])]);
    void open(r.data);
  };

  const remove = async () => {
    if (selected === null || !confirm(`Delete “${draft?.title}”?`)) return;
    const r = await api('DELETE', `/notes/${selected}`);
    if (r.error !== undefined) return toast(r.error, 'error');
    setNotes((ns) => ns && ns.filter((n) => n.id !== selected));
    setSelected(null);
    setDraft(null);
  };

  const setFilter = (o: Owner) => {
    void save();
    navigate(o ? `/notes?${o.startsWith('k:') ? 'campaign' : 'character'}=${o.slice(2)}` : '/notes', true);
  };

  const ownerName = (o: Owner) =>
    o.startsWith('k:') ? campaigns.find((k) => `k:${k.id}` === o)?.name : chars.find((c) => `c:${c.id}` === o)?.name;

  const ownerOptions = (
    <>
      {campaigns.length > 0 && (
        <optgroup label="Campaigns">
          {campaigns.map((k) => <option key={k.id} value={`k:${k.id}`}>{k.name}</option>)}
        </optgroup>
      )}
      {chars.length > 0 && (
        <optgroup label="Characters">
          {chars.map((c) => <option key={c.id} value={`c:${c.id}`}>{c.name}</option>)}
        </optgroup>
      )}
    </>
  );

  return (
    <main className="sheet notes-page">
      <nav className="sheet-nav">
        <a {...linkTo('/')}>← All characters</a>
        {filter.startsWith('c:') && <a {...linkTo(`/c/${filter.slice(2)}`)}>Sheet</a>}
      </nav>
      <header className="list-head">
        <h1>Notes{filter && ownerName(filter) ? ` · ${ownerName(filter)}` : ''}</h1>
      </header>

      <div className="notes-layout">
        <aside className="card notes-side">
          <div className="notes-filters">
            <select aria-label="Show notes for" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">All notes</option>
              {ownerOptions}
            </select>
            <select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value as NoteKind | '')}>
              <option value="">Any kind</option>
              {NOTE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <input type="search" placeholder="Search notes…" aria-label="Search notes" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn" onClick={create}>New note</button>
          </div>
          {notes === null ? (
            <Loader label="Leafing through notes" />
          ) : !notes.length ? (
            <p className="hint">{q ? 'No matches.' : 'No notes yet.'}</p>
          ) : (
            <ul className="note-list">
              {notes.map((n) => (
                <li key={n.id}>
                  <button className={`note-row ${n.id === selected ? 'on' : ''}`} onClick={() => open(n)}>
                    <strong>{n.id === selected && draft ? draft.title : n.title}</strong>
                    <small>
                      <span className="badge">{n.kind}</span> {!filter && ownerName(ownerOf(n))} · {parseAt(n.updatedAt).toLocaleDateString()}
                    </small>
                    {n.body && <span className="note-snippet">{n.body.slice(0, 140)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="card note-editor">
          {!draft ? (
            <p className="hint">Pick a note, or create one.</p>
          ) : (
            <form
              onSubmit={(e) => e.preventDefault()}
              onBlur={() => void save()}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                  e.preventDefault();
                  void save();
                }
              }}
            >
              <input className="note-title" aria-label="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              <div className="row-form">
                <select aria-label="Note kind" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as NoteKind })}>
                  {NOTE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
                <select aria-label="Belongs to" value={draft.owner} onChange={(e) => setDraft({ ...draft, owner: e.target.value })}>
                  {ownerOptions}
                </select>
                <span className="hint">{saved.current && sameDraft(draft, saved.current) ? 'Saved' : 'Unsaved — saves on blur or Ctrl+S'}</span>
              </div>
              <textarea aria-label="Note text" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={18} />
              <div className="row-form">
                <button type="button" className="btn" onClick={() => void save()}>Save</button>
                <button type="button" className="btn ghost danger-text" onClick={remove}>Delete</button>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
