import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/client';
import { linkTo, navigate } from '../../lib/router';
import { toast } from '../../lib/toast';
import { buildLinkIndex } from '../../shared/noteLinks';
import { NOTE_KINDS, NOTE_KIND_LABELS, type Campaign, type CharacterSummary, type Note, type NoteKind, type NoteRef } from '../../shared/types';
import { Loader } from '../Loader';
import { draftBody, factLine, ownerBody, ownerOf, parseAt, sameDraft, toDraft, type Draft, type Owner } from './common';
import { NoteEditor } from './NoteEditor';
import { NoteSidebar } from './NoteSidebar';
import { NoteLink, NoteView, type LinkHandlers } from './NoteView';

type Backlink = Pick<Note, 'id' | 'title' | 'kind'>;

/** /notes?campaign=3&note=12 — the owner filter and the open note both live in the URL, so Back works. */
const notesHref = (filter: Owner, note: number | null) => {
  const p = new URLSearchParams();
  if (filter) p.set(filter.startsWith('k:') ? 'campaign' : 'character', filter.slice(2));
  if (note !== null) p.set('note', String(note));
  const s = p.toString();
  return s ? `/notes?${s}` : '/notes';
};

export function Notes({ query }: { query: URLSearchParams }) {
  const filter: Owner = query.get('campaign') ? `k:${query.get('campaign')}` : query.get('character') ? `c:${query.get('character')}` : '';
  const selectedId = Number(query.get('note')) || null;

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [chars, setChars] = useState<CharacterSummary[]>([]);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [refs, setRefs] = useState<NoteRef[]>([]);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<NoteKind | ''>('');
  const [tag, setTag] = useState('');

  const [current, setCurrent] = useState<Note | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [mode, setMode] = useState<'read' | 'edit'>('read');
  const [backlinks, setBacklinks] = useState<Backlink[] | null>(null);
  const [preview, setPreview] = useState<{ id: number; rect: DOMRect } | null>(null);

  // Refs mirror state for the save path, which runs from effects and event handlers alike.
  const saved = useRef<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const currentId = useRef<number | null>(null);
  const editNext = useRef(false);
  draftRef.current = draft;

  useEffect(() => {
    api<Campaign[]>('GET', '/campaigns').then((r) => r.data && setCampaigns(r.data));
    api<CharacterSummary[]>('GET', '/characters').then((r) => r.data && setChars(r.data));
  }, []);

  const loadRefs = useCallback(async () => {
    const r = await api<NoteRef[]>('GET', '/notes/index');
    if (r.data) setRefs(r.data);
  }, []);

  const refresh = useCallback(async () => {
    const p = new URLSearchParams();
    if (filter.startsWith('k:')) p.set('campaign', filter.slice(2));
    if (filter.startsWith('c:')) p.set('character', filter.slice(2));
    if (kind) p.set('kind', kind);
    if (tag) p.set('tag', tag);
    if (q.trim()) p.set('q', q.trim());
    const r = await api<Note[]>('GET', `/notes?${p}`);
    if (r.data) setNotes(r.data);
    else toast(`Could not load notes: ${r.error}`, 'error');
  }, [filter, kind, tag, q]);

  // Debounced so typing in search doesn't fire a request per key.
  useEffect(() => {
    const t = setTimeout(() => void refresh(), 200);
    return () => clearTimeout(t);
  }, [refresh]);
  useEffect(() => void loadRefs(), [loadRefs]);

  const loadBacklinks = useCallback(async (id: number) => {
    const r = await api<Backlink[]>('GET', `/notes/${id}/backlinks`);
    if (currentId.current === id) setBacklinks(r.data ?? []);
  }, []);

  /** Saves the open draft if it changed. Safe to call from anywhere; never clobbers a newer selection. */
  const save = useCallback(async (): Promise<boolean> => {
    const id = currentId.current;
    const d = draftRef.current;
    if (id === null || !d || (saved.current && sameDraft(d, saved.current))) return true;
    const r = await api<Note>('PATCH', `/notes/${id}`, draftBody(d));
    if (r.error !== undefined) {
      toast(`Could not save note: ${r.error}`, 'error');
      return false;
    }
    if (currentId.current === id) {
      saved.current = toDraft(r.data);
      setCurrent(r.data);
      // Server-side normalising (trimmed aliases, the old title kept as an alias) shows up in the editor.
      if (sameDraft(draftRef.current!, d)) setDraft(toDraft(r.data));
      void loadBacklinks(id);
    }
    void refresh();
    void loadRefs();
    return true;
  }, [refresh, loadRefs, loadBacklinks]);

  // Open whatever note the URL names, saving the one we're leaving first.
  useEffect(() => {
    void save();
    currentId.current = selectedId;
    setPreview(null);
    if (selectedId === null) {
      setCurrent(null);
      setDraft(null);
      saved.current = null;
      return;
    }
    const show = (n: Note) => {
      if (currentId.current !== n.id) return;
      setCurrent(n);
      setDraft(toDraft(n));
      saved.current = toDraft(n);
      setMode(editNext.current ? 'edit' : 'read');
      editNext.current = false;
    };
    setBacklinks(null);
    void loadBacklinks(selectedId);
    api<Note>('GET', `/notes/${selectedId}`).then((r) => {
      if (r.data) show(r.data);
      else if (currentId.current === selectedId) {
        toast(`Could not open note: ${r.error}`, 'error');
        navigate(notesHref(filter, null), true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on selection change
  }, [selectedId]);

  useEffect(() => {
    document.title = `${current ? `${current.title} · ` : ''}Notes · Adventurers Journal`;
  }, [current]);

  const openId = (id: number) => navigate(notesHref(filter, id));

  const create = async (init: { title: string; kind: NoteKind; owner?: Owner }) => {
    await save();
    const owner = init.owner || filter || (campaigns[0] ? `k:${campaigns[0].id}` : chars[0] ? `c:${chars[0].id}` : '');
    if (!owner) return toast('Create a campaign or a character first', 'error');
    const r = await api<Note>('POST', '/notes', { title: init.title, kind: init.kind, ...ownerBody(owner) });
    if (r.error !== undefined) return toast(r.error, 'error');
    void refresh();
    void loadRefs();
    editNext.current = true;
    openId(r.data.id);
  };

  const remove = async () => {
    if (!current || !confirm(`Delete “${current.title}”?`)) return;
    const r = await api('DELETE', `/notes/${current.id}`);
    if (r.error !== undefined) return toast(r.error, 'error');
    saved.current = draftRef.current; // nothing left to save
    void refresh();
    void loadRefs();
    navigate(notesHref(filter, null));
  };

  const done = async () => {
    if (await save()) setMode('read');
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !currentId.current) return;
      if (e.key === 's') {
        e.preventDefault();
        void save();
      } else if (e.key === 'e') {
        e.preventDefault();
        if (mode === 'edit') void done();
        else setMode('edit');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const setFilter = (o: Owner) => navigate(notesHref(o, selectedId), true);

  const ownerName = (o: Owner) =>
    o.startsWith('k:') ? campaigns.find((k) => `k:${k.id}` === o)?.name : chars.find((c) => `c:${c.id}` === o)?.name;

  const index = useMemo(() => buildLinkIndex(refs, current), [refs, current]);
  const inScope = useMemo(() => (filter ? refs.filter((r) => ownerOf(r) === filter) : refs), [refs, filter]);
  const allTags = useMemo(() => {
    const count = new Map<string, number>();
    for (const r of inScope) for (const t of r.tags) count.set(t, (count.get(t) ?? 0) + 1);
    return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
  }, [inScope]);

  const h: LinkHandlers = {
    onLink: openId,
    onMissing: (title, k) => void create({ title, kind: k ?? 'note', owner: current ? ownerOf(current) : undefined }),
    onPreview: (id, anchor) => setPreview(id === null || !anchor ? null : { id, rect: anchor.getBoundingClientRect() }),
  };

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

  const filtering = !!(q.trim() || kind || tag);

  return (
    <main className="sheet notes-page">
      <nav className="sheet-nav">
        <a {...linkTo('/')}>← All characters</a>
        {filter.startsWith('c:') && <a {...linkTo(`/c/${filter.slice(2)}`)}>Sheet</a>}
        {filter.startsWith('c:') && <a {...linkTo(`/c/${filter.slice(2)}/lore`)}>Lore</a>}
        {filter.startsWith('c:') && <a {...linkTo(`/c/${filter.slice(2)}/map`)}>Map</a>}
      </nav>
      <header className="list-head">
        <h1>
          <a className="plain-link" {...linkTo(notesHref(filter, null))}>Notes</a>
          {filter && ownerName(filter) ? ` · ${ownerName(filter)}` : ''}
        </h1>
      </header>

      <div className="notes-layout">
        <aside className="card notes-side">
          <div className="notes-filters">
            <input type="search" placeholder="Search titles, text, aliases, tags…" aria-label="Search notes" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="row-form">
              <select aria-label="Show notes for" value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="">All notes</option>
                {ownerOptions}
              </select>
              <select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value as NoteKind | '')}>
                <option value="">Any kind</option>
                {NOTE_KINDS.map((k) => <option key={k} value={k}>{NOTE_KIND_LABELS[k]}</option>)}
              </select>
            </div>
            {allTags.length > 0 && (
              <div className="chips tag-filter">
                {allTags.map((t) => (
                  <button key={t} className={`chip tag ${t === tag ? 'on' : ''}`} aria-pressed={t === tag} onClick={() => setTag(t === tag ? '' : t)}>
                    #{t}
                  </button>
                ))}
              </div>
            )}
            <button className="btn" onClick={() => void create({ title: 'New note', kind: kind || 'note' })}>
              New {kind ? NOTE_KIND_LABELS[kind].replace(/s$/, '').toLowerCase() : 'note'}
            </button>
          </div>
          {notes === null ? (
            <Loader label="Leafing through notes" />
          ) : !notes.length ? (
            <p className="hint">{filtering ? 'No matches.' : 'No notes yet.'}</p>
          ) : (
            <NoteSidebar
              notes={notes}
              selectedId={selectedId}
              draftTitle={draft && current?.id === selectedId ? draft.title : null}
              ranked={!!q.trim()}
              showOwner={!filter}
              ownerName={ownerName}
              onOpen={(n) => openId(n.id)}
            />
          )}
        </aside>

        <section className="card note-panel">
          {selectedId === null ? (
            <Overview refs={inScope} h={h} />
          ) : !current || !draft ? (
            <Loader label="Opening note" />
          ) : mode === 'read' ? (
            <NoteView
              note={current}
              index={index}
              ownerName={ownerName(ownerOf(current))}
              backlinks={backlinks}
              h={h}
              onTag={(t) => setTag(t)}
              onEdit={() => setMode('edit')}
            />
          ) : (
            <NoteEditor
              noteId={current.id}
              draft={draft}
              refs={refs}
              ownerOptions={ownerOptions}
              savedState={saved.current && sameDraft(draft, saved.current) ? 'saved' : 'dirty'}
              onChange={setDraft}
              onSave={() => void save()}
              onDone={() => void done()}
              onDelete={remove}
            />
          )}
        </section>
      </div>

      {preview && <LinkPreview refs={refs} notes={notes} {...preview} />}
    </main>
  );
}

/** The landing panel: open quests and the latest changes. */
function Overview({ refs, h }: { refs: NoteRef[]; h: LinkHandlers }) {
  const quests = refs.filter((r) => r.kind === 'quest' && (r.fields.status ?? 'active') === 'active');
  const recent = refs.slice(0, 8);
  const counts = NOTE_KINDS.map((k) => [k, refs.filter((r) => r.kind === k).length] as const).filter(([, n]) => n);
  if (!refs.length) return <p className="hint">No notes yet. Make one for a person, a place or a quest; type [[ in a note to link it to another.</p>;
  return (
    <div className="notes-overview">
      <p className="kind-counts">
        {counts.map(([k, n]) => (
          <span key={k}>
            <span className={`kind-dot kind-${k}`} aria-hidden /> {n} {NOTE_KIND_LABELS[k].toLowerCase()}
          </span>
        ))}
      </p>
      {quests.length > 0 && (
        <section>
          <h3>Open quests</h3>
          <ul>
            {quests.map((r) => {
              const facts = factLine({ kind: r.kind, fields: { ...r.fields, status: '' } });
              return (
                <li key={r.id}>
                  <NoteLink id={r.id} h={h}>{r.title}</NoteLink>
                  {facts && <small> — {facts}</small>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <section>
        <h3>Recently updated</h3>
        <ul>
          {recent.map((r) => (
            <li key={r.id}>
              <span className={`kind-dot kind-${r.kind}`} aria-hidden /> <NoteLink id={r.id} h={h}>{r.title}</NoteLink>
              <small> · {parseAt(r.updatedAt).toLocaleDateString()}</small>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

const bodies = new Map<number, string>();

/** A small card under a hovered link: kind, key facts and the opening lines. */
function LinkPreview({ id, rect, refs, notes }: { id: number; rect: DOMRect; refs: NoteRef[]; notes: Note[] | null }) {
  const ref = refs.find((r) => r.id === id);
  const [body, setBody] = useState(() => notes?.find((n) => n.id === id)?.body ?? bodies.get(id));
  useEffect(() => {
    if (body !== undefined) return;
    let live = true;
    api<Note>('GET', `/notes/${id}`).then((r) => {
      if (!r.data) return;
      bodies.set(id, r.data.body);
      if (live) setBody(r.data.body);
    });
    return () => void (live = false);
  }, [id, body]);
  if (!ref) return null;
  const facts = factLine(ref, 4);
  const below = rect.bottom + 180 < window.innerHeight;
  const left = Math.max(16, Math.min(rect.left, window.innerWidth - 336));
  const snippet = body?.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, t, l) => l ?? t).replace(/[#*_>`]/g, '').trim().slice(0, 220);
  return (
    <div className={`link-preview kind-${ref.kind}`} role="tooltip" style={below ? { left, top: rect.bottom + 6 } : { left, bottom: window.innerHeight - rect.top + 6 }}>
      <span className={`kind-badge kind-${ref.kind}`}>{NOTE_KIND_LABELS[ref.kind].replace(/s$/, '')}</span>
      <strong>{ref.title}</strong>
      {facts && <small>{facts}</small>}
      {snippet && <p>{snippet}{body && body.length > 220 ? '…' : ''}</p>}
    </div>
  );
}
