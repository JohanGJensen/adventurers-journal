import { Fragment, type ReactNode } from 'react';
import { parseBlocks, parseInline, type Inline } from '../../lib/markdown';
import { resolveName, segmentText, type LinkIndex } from '../../shared/noteLinks';
import { NOTE_FIELDS, type Note, type NoteKind } from '../../shared/types';
import { isPortraitKind, kindName, parseAt } from './common';

export interface LinkHandlers {
  /** The page URL of note `id`, for new-tab opens. */
  href: (id: number) => string;
  /** Open note `id`. */
  onLink: (id: number) => void;
  /** Create a note for a [[target]] that doesn't exist yet. */
  onMissing: (title: string, kind?: NoteKind) => void;
  /** Show (id + anchor) or hide (null) the hover preview. */
  onPreview: (id: number | null, anchor?: HTMLElement) => void;
}

export function NoteLink({ id, children, auto, h }: { id: number; children: ReactNode; auto?: boolean; h: LinkHandlers }) {
  return (
    <a
      href={h.href(id)}
      className={`note-link${auto ? ' auto' : ''}`}
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        h.onPreview(null);
        h.onLink(id);
      }}
      onMouseEnter={(e) => h.onPreview(id, e.currentTarget)}
      onMouseLeave={() => h.onPreview(null)}
      onFocus={(e) => h.onPreview(id, e.currentTarget)}
      onBlur={() => h.onPreview(null)}
    >
      {children}
    </a>
  );
}

function MissingLink({ title, kind, children, h }: { title: string; kind?: NoteKind; children: ReactNode; h: LinkHandlers }) {
  return (
    <button type="button" className="note-link missing" title={`No note “${title}” yet — click to create it`} onClick={() => h.onMissing(title, kind)}>
      {children}
    </button>
  );
}

/** Renders plain text with its links; `seen` spans one block so a name auto-links once per paragraph. */
function LinkedText({ text, index, seen, h }: { text: string; index: LinkIndex; seen: Set<number>; h: LinkHandlers }) {
  return (
    <>
      {segmentText(text, index, seen).map((s, i) =>
        s.t === 'text' ? (
          <Fragment key={i}>{s.text}</Fragment>
        ) : s.t === 'link' ? (
          <NoteLink key={i} id={s.id} auto={s.auto} h={h}>{s.text}</NoteLink>
        ) : (
          <MissingLink key={i} title={s.target} h={h}>{s.text}</MissingLink>
        ),
      )}
    </>
  );
}

function Inlines({ nodes, index, seen, h }: { nodes: Inline[]; index: LinkIndex; seen: Set<number>; h: LinkHandlers }) {
  return (
    <>
      {nodes.map((n, i) =>
        n.t === 'text' ? (
          <LinkedText key={i} text={n.text} index={index} seen={seen} h={h} />
        ) : n.t === 'code' ? (
          <code key={i}>{n.text}</code>
        ) : n.t === 'strong' ? (
          <strong key={i}><Inlines nodes={n.children} index={index} seen={seen} h={h} /></strong>
        ) : (
          <em key={i}><Inlines nodes={n.children} index={index} seen={seen} h={h} /></em>
        ),
      )}
    </>
  );
}

export function NoteBody({ text, index, h }: { text: string; index: LinkIndex; h: LinkHandlers }) {
  const line = (s: string, seen: Set<number>) => <Inlines nodes={parseInline(s)} index={index} seen={seen} h={h} />;
  const lines = (ls: string[]) => {
    const seen = new Set<number>();
    return ls.map((l, i) => (
      <Fragment key={i}>
        {i > 0 && <br />}
        {line(l, seen)}
      </Fragment>
    ));
  };
  return (
    <div className="note-body prose">
      {parseBlocks(text).map((b, i) => {
        switch (b.t) {
          case 'h': {
            const H = `h${b.level + 2}` as 'h3' | 'h4' | 'h5';
            return <H key={i}>{line(b.text, new Set())}</H>;
          }
          case 'p':
            return <p key={i}>{lines(b.lines)}</p>;
          case 'quote':
            return <blockquote key={i}>{lines(b.lines)}</blockquote>;
          case 'hr':
            return <hr key={i} />;
          default: {
            const L = b.t;
            const seen = new Set<number>();
            return <L key={i}>{b.items.map((it, j) => <li key={j}>{line(it, seen)}</li>)}</L>;
          }
        }
      })}
    </div>
  );
}

interface ViewProps {
  note: Note;
  index: LinkIndex;
  backlinks: Pick<Note, 'id' | 'title' | 'kind'>[] | null;
  h: LinkHandlers;
  onTag: (tag: string) => void;
  onEdit: () => void;
}

export function NoteView({ note, index, backlinks, h, onTag, onEdit }: ViewProps) {
  const facts = NOTE_FIELDS[note.kind].filter((f) => note.fields[f.key]);
  return (
    <article className={`note-read kind-${note.kind} ${note.image ? 'has-image' : ''}`}>
      {note.image && (
        // Beside the title (and the facts, when there are any).
        <figure className={`note-image ${isPortraitKind(note.kind) ? 'portrait' : 'picture'}`} style={{ gridRowEnd: facts.length ? 'span 2' : 'span 1' }}>
          <img src={note.image} alt={note.title} />
        </figure>
      )}
      <header className="note-read-head">
        <div>
          <span className={`kind-badge kind-${note.kind}`}>{kindName(note.kind)}</span>
          <h2>{note.title}</h2>
          {note.aliases.length > 0 && <p className="note-aka">Also known as {note.aliases.join(', ')}</p>}
        </div>
        <button className="btn ghost small" onClick={onEdit} title="Edit (Ctrl+E)">Edit</button>
      </header>

      {facts.length > 0 && (
        <dl className="note-facts">
          {facts.map((f) => {
            const v = note.fields[f.key];
            const target = f.ref ? resolveName(index, v) : undefined;
            return (
              <div key={f.key} className={`fact fact-${f.key} ${f.key === 'status' ? `status-${v.replace(' ', '-')}` : ''}`}>
                <dt>{f.label}</dt>
                <dd>
                  {target ? (
                    <NoteLink id={target.id} h={h}>{v}</NoteLink>
                  ) : f.ref && !f.loose ? (
                    <MissingLink title={v} kind={f.ref} h={h}>{v}</MissingLink>
                  ) : (
                    v
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      )}

      {note.body.trim() ? (
        <NoteBody text={note.body} index={index} h={h} />
      ) : (
        <p className="hint">
          Nothing written yet. <button className="linkish" onClick={onEdit}>Start writing</button>
        </p>
      )}

      <footer className="note-read-foot">
        {note.tags.length > 0 && (
          <div className="chips">
            {note.tags.map((t) => (
              <button key={t} className="chip note-tag" onClick={() => onTag(t)} title={`Show notes tagged “${t}”`}>#{t}</button>
            ))}
          </div>
        )}
        <section className="backlinks">
          <h3>Mentioned in</h3>
          {backlinks === null ? (
            <p className="hint">…</p>
          ) : backlinks.length ? (
            <ul>
              {backlinks.map((b) => (
                <li key={b.id}>
                  <span className={`kind-dot kind-${b.kind}`} aria-hidden /> <NoteLink id={b.id} h={h}>{b.title}</NoteLink>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">No other note mentions this one yet.</p>
          )}
        </section>
        <p className="hint">Updated {parseAt(note.updatedAt).toLocaleString()}</p>
      </footer>
    </article>
  );
}
