import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/client';
import { pictureFrom } from '../../lib/portrait';
import { usePortraitPicker } from '../PortraitCropper';
import { linkTo, navigate } from '../../lib/router';
import { toast } from '../../lib/toast';
import { buildLinkIndex } from '../../shared/noteLinks';
import { NOTE_KINDS, NOTE_KIND_LABELS, type Campaign, type CharacterDto, type CharacterSummary, type Note, type NoteKind, type NoteRef } from '../../shared/types';
import { Loader } from '../Loader';
import { draftBody, factLine, isPortraitKind, kindName, parseAt, plainText, sameDraft, sortForKind, toDraft, type Draft } from './common';
import { NoteEditor } from './NoteEditor';
import { NoteSidebar } from './NoteSidebar';
import { NoteLink, NoteView, type LinkHandlers } from './NoteView';

type Backlink = Pick<Note, 'id' | 'title' | 'kind'>;

const asKind = (v: string | null): NoteKind | '' => (NOTE_KINDS.includes(v as NoteKind) ? (v as NoteKind) : '');

/** /c/1/notes?kind=npc&note=12: the kind tab and the open note live in the URL, so Back works. */
const notesHref = (characterId: number, o: { kind?: NoteKind | ''; note?: number | null } = {}) => {
  const p = new URLSearchParams();
  if (o.kind) p.set('kind', o.kind);
  if (o.note) p.set('note', String(o.note));
  const s = p.toString();
  return `/c/${characterId}/notes${s ? `?${s}` : ''}`;
};

/** A character's Notes tab: the notes of the campaign they play in, shared by everyone in it. */
export function Notes({ characterId, query }: { characterId: number; query: URLSearchParams }) {
  const [character, setCharacter] = useState<CharacterDto | { error: string } | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [members, setMembers] = useState<CharacterSummary[]>([]);

  useEffect(() => {
    let live = true;
    api<CharacterDto>('GET', `/characters/${characterId}`).then((r) => live && setCharacter(r.data ?? { error: r.error ?? 'Not found' }));
    api<CharacterSummary[]>('GET', '/characters').then((r) => live && r.data && setMembers(r.data));
    return () => void (live = false);
  }, [characterId]);

  const campaignId = character && !('error' in character) ? character.campaignId : null;
  useEffect(() => {
    if (!campaignId) return;
    api<Campaign[]>('GET', '/campaigns').then((r) => setCampaign(r.data?.find((k) => k.id === campaignId) ?? null));
  }, [campaignId]);

  const classKey = members.find((m) => m.id === characterId)?.classKey ?? undefined;

  if (!character) return <Loader size="page" label="Leafing through notes" />;
  if ('error' in character)
    return (
      <div className="loading">
        <p>{character.error}</p>
        <a {...linkTo('/')}>All characters</a>
      </div>
    );

  const nav = (
    <nav className="sheet-nav">
      <a {...linkTo('/')}>← All characters</a>
      <a {...linkTo(`/c/${characterId}`)}>Sheet</a>
      <a {...linkTo(`/c/${characterId}/lore`)}>Lore</a>
      <a {...linkTo(`/c/${characterId}/log`)}>History</a>
    </nav>
  );

  if (!campaignId)
    return (
      <main className="sheet notes-page" data-class={classKey}>
        {nav}
        <section className="card notes-none prose">
          <h2>No campaign, no notes</h2>
          <p>
            Notes belong to a campaign, and every character in it shares them. {character.name} isn’t in a campaign yet: add them to one
            on the <a {...linkTo('/')}>character list</a>.
          </p>
        </section>
      </main>
    );

  const together = members.filter((m) => m.campaignId === campaignId);
  return (
    <main className="sheet notes-page" data-class={classKey}>
      {nav}
      <NotesBody
        key={campaignId}
        characterId={characterId}
        campaignId={campaignId}
        campaignName={campaign?.name ?? ''}
        sharedWith={together.map((m) => m.name)}
        query={query}
      />
    </main>
  );
}

interface BodyProps {
  characterId: number;
  campaignId: number;
  campaignName: string;
  sharedWith: string[];
  query: URLSearchParams;
}

function NotesBody({ characterId, campaignId, campaignName, sharedWith, query }: BodyProps) {
  const selectedId = Number(query.get('note')) || null;
  const kind = asKind(query.get('kind'));

  const [notes, setNotes] = useState<Note[] | null>(null);
  const [refs, setRefs] = useState<NoteRef[]>([]);
  const [q, setQ] = useState('');
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

  const href = (o: { kind?: NoteKind | ''; note?: number | null }) => notesHref(characterId, { kind, note: selectedId, ...o });

  const loadRefs = useCallback(async () => {
    const r = await api<NoteRef[]>('GET', `/notes/index?campaign=${campaignId}`);
    if (r.data) setRefs(r.data);
  }, [campaignId]);

  const refresh = useCallback(async () => {
    const p = new URLSearchParams({ campaign: String(campaignId) });
    if (kind) p.set('kind', kind);
    if (tag) p.set('tag', tag);
    if (q.trim()) p.set('q', q.trim());
    const r = await api<Note[]>('GET', `/notes?${p}`);
    if (r.data) setNotes(r.data);
    else toast(`Could not load notes: ${r.error}`, 'error');
  }, [campaignId, kind, tag, q]);

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
      if (r.data && r.data.campaignId === campaignId) show(r.data);
      else if (currentId.current === selectedId) {
        toast(r.data ? 'That note belongs to another campaign' : `Could not open note: ${r.error}`, 'error');
        navigate(href({ note: null }), true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on selection change
  }, [selectedId]);

  useEffect(() => {
    document.title = `${current ? `${current.title} · ` : ''}Notes · Adventurers Journal`;
  }, [current]);

  const openId = (id: number) => navigate(href({ note: id }));

  const create = async (init: { title: string; kind: NoteKind }) => {
    await save();
    const r = await api<Note>('POST', '/notes', { title: init.title, kind: init.kind, campaignId });
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
    navigate(href({ note: null }));
  };

  const [imageBusy, setImageBusy] = useState(false);
  const picker = usePortraitPicker();
  /** Adds, replaces or (null) removes the open note's image. Saves straight away, after any pending text edits. */
  const setImage = async (file: File | null) => {
    const id = currentId.current;
    const n = current;
    if (id === null || !n) return;
    let image: string | null = null;
    if (file) {
      try {
        image = await (isPortraitKind(draftRef.current?.kind ?? n.kind) ? picker.pick(file) : pictureFrom(file));
      } catch (e) {
        return toast(e instanceof Error ? e.message : String(e), 'error');
      }
      if (!image) return; // framing cancelled: keep the current image
      if (currentId.current !== id) return; // another note was opened meanwhile
    }
    setImageBusy(true);
    try {
      if (!(await save())) return;
      const r = await api<Note>('PATCH', `/notes/${id}`, { image });
      if (r.error !== undefined) return toast(`Could not save the image: ${r.error}`, 'error');
      if (currentId.current === id) setCurrent(r.data);
      toast(image ? `Image added to “${r.data.title}”` : `Image removed from “${r.data.title}”`);
    } finally {
      setImageBusy(false);
    }
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

  const index = useMemo(() => buildLinkIndex(refs, current), [refs, current]);
  const counts = useMemo(() => {
    const m = new Map<NoteKind, number>();
    for (const r of refs) m.set(r.kind, (m.get(r.kind) ?? 0) + 1);
    return m;
  }, [refs]);
  const allTags = useMemo(() => {
    const count = new Map<string, number>();
    for (const r of refs) for (const t of r.tags) count.set(t, (count.get(t) ?? 0) + 1);
    return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
  }, [refs]);

  const h: LinkHandlers = {
    href: (id) => notesHref(characterId, { kind, note: id }),
    onLink: openId,
    onMissing: (title, k) => void create({ title, kind: k ?? 'note' }),
    onPreview: (id, anchor) => setPreview(id === null || !anchor ? null : { id, rect: anchor.getBoundingClientRect() }),
  };

  const setKind = (k: NoteKind | '') => navigate(href({ kind: k }), true);
  const filtering = !!(q.trim() || kind || tag);
  const newKind = kind || 'note';

  return (
    <>
      <header className="list-head notes-head">
        <div>
          <h1>
            <a className="plain-link" {...linkTo(href({ kind: '', note: null }))}>Notes</a>
            {campaignName && <span className="notes-campaign"> · {campaignName}</span>}
          </h1>
          {sharedWith.length > 1 && <p className="notes-shared">Shared by {sharedWith.join(', ')}</p>}
        </div>
        <button className="btn" onClick={() => void create({ title: `New ${kindName(newKind, true)}`, kind: newKind })}>
          + New {kindName(newKind, true)}
        </button>
      </header>

      <div className={`notes-layout ${selectedId ? 'has-note' : ''}`}>
        <aside className="card notes-side">
          <div className="notes-filters">
            <input type="search" placeholder="Search notes…" aria-label="Search notes" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="kind-tabs" role="group" aria-label="Show kind">
              <button className={`kind-tab ${kind ? '' : 'on'}`} aria-pressed={!kind} onClick={() => setKind('')}>
                All <span className="count">{refs.length}</span>
              </button>
              {NOTE_KINDS.filter((k) => counts.get(k) || k === kind).map((k) => (
                <button key={k} className={`kind-tab kind-${k} ${k === kind ? 'on' : ''}`} aria-pressed={k === kind} onClick={() => setKind(k === kind ? '' : k)}>
                  <span className="kind-dot" aria-hidden /> {NOTE_KIND_LABELS[k]} <span className="count">{counts.get(k) ?? 0}</span>
                </button>
              ))}
            </div>
            {allTags.length > 0 && (
              <details className="tag-filter" open={!!tag || undefined}>
                <summary>
                  Tags
                  {tag && (
                    <>
                      : <strong>#{tag}</strong>{' '}
                      <button
                        className="linkish"
                        onClick={(e) => {
                          e.preventDefault();
                          setTag('');
                        }}
                      >
                        clear
                      </button>
                    </>
                  )}
                </summary>
                <div className="chips">
                  {allTags.map((t) => (
                    <button key={t} className={`chip note-tag ${t === tag ? 'on' : ''}`} aria-pressed={t === tag} onClick={() => setTag(t === tag ? '' : t)}>
                      #{t}
                    </button>
                  ))}
                </div>
              </details>
            )}
          </div>
          {notes === null ? (
            <Loader label="Leafing through notes" />
          ) : !notes.length ? (
            <p className="hint">{filtering ? 'Nothing matches.' : 'No notes yet.'}</p>
          ) : (
            <NoteSidebar
              notes={notes}
              selectedId={selectedId}
              draftTitle={draft && current?.id === selectedId ? draft.title : null}
              ranked={!!q.trim()}
              flat={!!kind}
              onOpen={(n) => openId(n.id)}
            />
          )}
        </aside>

        <section className="card note-panel reading">
          {selectedId !== null && (
            <nav className="note-crumbs" aria-label="Breadcrumb">
              <a {...linkTo(href({ kind: '', note: null }))}>← Overview</a>
              {current && (
                <>
                  {' · '}
                  <a {...linkTo(href({ kind: current.kind, note: null }))}>{NOTE_KIND_LABELS[current.kind]}</a>
                </>
              )}
            </nav>
          )}
          {selectedId === null ? (
            <Dashboard refs={refs} h={h} onKind={(k) => navigate(href({ kind: k }))} onCreate={(k) => void create({ title: `New ${kindName(k, true)}`, kind: k })} />
          ) : !current || !draft ? (
            <Loader label="Opening note" />
          ) : mode === 'read' ? (
            <NoteView note={current} index={index} backlinks={backlinks} h={h} onTag={(t) => setTag(t)} onEdit={() => setMode('edit')} />
          ) : (
            <NoteEditor
              noteId={current.id}
              draft={draft}
              refs={refs}
              savedState={saved.current && sameDraft(draft, saved.current) ? 'saved' : 'dirty'}
              image={current.image}
              imageBusy={imageBusy}
              onImage={(f) => void setImage(f)}
              onChange={setDraft}
              onSave={() => void save()}
              onDone={() => void done()}
              onDelete={remove}
            />
          )}
        </section>
      </div>

      {preview && <LinkPreview refs={refs} notes={notes} {...preview} />}
      {picker.dialog}
    </>
  );
}

/** Kinds on the dashboard, most-used first; quests also get their own "open quests" list above. */
const DASH_KINDS: NoteKind[] = ['session', 'player', 'npc', 'place', 'quest', 'faction', 'item', 'lore', 'note'];
const STARTERS: NoteKind[] = ['session', 'quest', 'npc', 'place'];

/** The landing panel: open quests, a card per kind with its latest notes, and what changed lately. */
function Dashboard({ refs, h, onKind, onCreate }: { refs: NoteRef[]; h: LinkHandlers; onKind: (k: NoteKind) => void; onCreate: (k: NoteKind) => void }) {
  if (!refs.length)
    return (
      <div className="notes-empty prose">
        <h2>An empty notebook</h2>
        <p>
          Everything the party learns goes here: sessions, quests, the people you meet and the places you go. Type <code>[[</code> in a note
          to link another, and names of other notes link themselves.
        </p>
        <div className="row-form">
          {STARTERS.map((k) => (
            <button key={k} className={`btn ghost kind-${k}`} onClick={() => onCreate(k)}>
              <span className="kind-dot" aria-hidden /> New {kindName(k, true)}
            </button>
          ))}
        </div>
      </div>
    );

  const quests = sortForKind('quest', refs.filter((r) => r.kind === 'quest' && (r.fields.status ?? 'active') === 'active'));
  const recent = refs.slice(0, 6);
  return (
    <div className="notes-dash">
      {quests.length > 0 && (
        <section className="dash-quests kind-quest">
          <h2>Open quests</h2>
          <ul>
            {quests.map((r) => {
              const facts = factLine({ kind: r.kind, fields: { ...r.fields, status: '' } });
              return (
                <li key={r.id}>
                  <NoteLink id={r.id} h={h}>{r.title}</NoteLink>
                  {facts && <span className="dash-facts">{facts}</span>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="dash-cards">
        {DASH_KINDS.map((k) => {
          const xs = refs.filter((r) => r.kind === k);
          const top = (k === 'note' || k === 'session' ? xs : sortForKind(k, xs)).slice(0, 4);
          return (
            <section key={k} className={`dash-card kind-${k} ${xs.length ? '' : 'empty'}`}>
              <header>
                <button className="dash-card-title" onClick={() => onKind(k)} disabled={!xs.length} title={`Show all ${NOTE_KIND_LABELS[k].toLowerCase()}`}>
                  <span className="kind-dot" aria-hidden /> {NOTE_KIND_LABELS[k]}
                  <span className="count">{xs.length}</span>
                </button>
                <button className="icon-btn" onClick={() => onCreate(k)} aria-label={`New ${kindName(k, true)}`} title={`New ${kindName(k, true)}`}>
                  +
                </button>
              </header>
              {top.length ? (
                <ul>
                  {top.map((r) => (
                    <li key={r.id}>
                      <NoteLink id={r.id} h={h}>{r.title}</NoteLink>
                    </li>
                  ))}
                  {xs.length > top.length && (
                    <li>
                      <button className="linkish more" onClick={() => onKind(k)}>
                        and {xs.length - top.length} more
                      </button>
                    </li>
                  )}
                </ul>
              ) : (
                <p className="hint">None yet.</p>
              )}
            </section>
          );
        })}
      </div>

      <section className="dash-recent">
        <h2>Recently updated</h2>
        <ul>
          {recent.map((r) => (
            <li key={r.id} className={`kind-${r.kind}`}>
              <span className="kind-dot" aria-hidden /> <NoteLink id={r.id} h={h}>{r.title}</NoteLink>
              <small>{parseAt(r.updatedAt).toLocaleDateString()}</small>
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
  const text = body ? plainText(body) : '';
  return (
    <div className={`link-preview kind-${ref.kind}`} role="tooltip" style={below ? { left, top: rect.bottom + 6 } : { left, bottom: window.innerHeight - rect.top + 6 }}>
      <span className={`kind-badge kind-${ref.kind}`}>{kindName(ref.kind)}</span>
      <strong>{ref.title}</strong>
      {facts && <small>{facts}</small>}
      {text && <p>{text.slice(0, 220)}{text.length > 220 ? '…' : ''}</p>}
    </div>
  );
}

/** Old /notes links (bookmarks, notes opened in a new tab before this change): find a character to show them through. */
export function LegacyNotesRedirect({ query }: { query: URLSearchParams }) {
  const [lost, setLost] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => {
      const note = Number(query.get('note')) || null;
      let campaignId = Number(query.get('campaign')) || null;
      let characterId = Number(query.get('character')) || null;
      if (note) campaignId = (await api<Note>('GET', `/notes/${note}`)).data?.campaignId ?? campaignId;
      if (campaignId) {
        const chars = (await api<CharacterSummary[]>('GET', '/characters')).data ?? [];
        characterId = chars.find((c) => c.campaignId === campaignId)?.id ?? null;
      }
      if (!live) return;
      if (characterId) navigate(notesHref(characterId, { note }), true);
      else if (!note && !campaignId) navigate('/', true);
      else setLost(true);
    })();
    return () => void (live = false);
  }, [query]);
  if (!lost) return <Loader size="page" label="Finding the notes" />;
  return (
    <div className="loading">
      <p>Notes are on each character’s Notes tab now, and no character plays in this campaign.</p>
      <a {...linkTo('/')}>All characters</a>
    </div>
  );
}
