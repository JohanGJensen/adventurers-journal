import { useMemo, useRef, useState, type ReactNode } from 'react';
import { normName } from '../../shared/noteLinks';
import { NOTE_FIELDS, NOTE_KINDS, NOTE_KIND_LABELS, type NoteKind, type NoteRef } from '../../shared/types';
import type { Draft } from './common';

interface Props {
  noteId: number;
  draft: Draft;
  refs: NoteRef[];
  ownerOptions: ReactNode;
  savedState: 'saved' | 'dirty';
  onChange: (d: Draft) => void;
  onSave: () => void;
  onDone: () => void;
  onDelete: () => void;
}

const OPEN_LINK = /\[\[([^[\]\n|]*)$/;

export function NoteEditor({ noteId, draft, refs, ownerOptions, savedState, onChange, onSave, onDone, onDelete }: Props) {
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => onChange({ ...draft, [k]: v });
  const setField = (k: string, v: string) => onChange({ ...draft, fields: { ...draft.fields, [k]: v } });
  const area = useRef<HTMLTextAreaElement>(null);
  const [link, setLink] = useState<{ query: string; at: number; pick: number } | null>(null);

  const others = useMemo(() => refs.filter((r) => r.id !== noteId), [refs, noteId]);

  /** Titles (and aliases, labelled) matching what's typed after "[[". Prefix matches first. */
  const suggestions = useMemo(() => {
    if (!link) return [];
    const q = normName(link.query);
    const out: { ref: NoteRef; via?: string; score: number }[] = [];
    for (const r of others) {
      const names = [r.title, ...r.aliases];
      let best: { via?: string; score: number } | null = null;
      for (const [i, n] of names.entries()) {
        const k = normName(n);
        const pos = q ? k.indexOf(q) : 0;
        if (pos < 0) continue;
        const score = (pos === 0 ? 0 : 1) + (i ? 0.5 : 0);
        if (!best || score < best.score) best = { via: i ? n : undefined, score };
      }
      if (best) out.push({ ref: r, ...best });
    }
    return out.sort((a, b) => a.score - b.score || a.ref.title.localeCompare(b.ref.title)).slice(0, 8);
  }, [link, others]);

  const detect = (el: HTMLTextAreaElement) => {
    const before = el.value.slice(0, el.selectionStart);
    const m = OPEN_LINK.exec(before);
    setLink(m && el.selectionStart === el.selectionEnd ? { query: m[1], at: before.length - m[1].length, pick: 0 } : null);
  };

  const insert = (title: string) => {
    const el = area.current;
    if (!el || !link) return;
    const after = draft.body.slice(el.selectionStart);
    const close = after.startsWith(']]') ? '' : ']]';
    const body = `${draft.body.slice(0, link.at)}${title}${close}${after}`;
    const caret = link.at + title.length + 2;
    set('body', body);
    setLink(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  return (
    <form
      className="note-edit"
      onSubmit={(e) => e.preventDefault()}
      onBlur={(e) => {
        // Saving on every focus hop inside the form would be noisy; save when focus leaves it.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onSave();
      }}
    >
      <input className="note-title" aria-label="Title" value={draft.title} onChange={(e) => set('title', e.target.value)} />
      <div className="row-form">
        <select aria-label="Note kind" value={draft.kind} onChange={(e) => set('kind', e.target.value as NoteKind)}>
          {NOTE_KINDS.map((k) => <option key={k} value={k}>{NOTE_KIND_LABELS[k].replace(/s$/, '')}</option>)}
        </select>
        <select aria-label="Belongs to" value={draft.owner} onChange={(e) => set('owner', e.target.value)}>
          {ownerOptions}
        </select>
        <span className="hint save-state">{savedState === 'saved' ? 'Saved' : 'Unsaved — saves when you leave the editor or press Ctrl+S'}</span>
      </div>

      {NOTE_FIELDS[draft.kind].length > 0 && (
        <div className="note-field-grid">
          {NOTE_FIELDS[draft.kind].map((f) => (
            <label key={f.key}>
              <span>{f.label}</span>
              {f.options ? (
                <select value={draft.fields[f.key] ?? ''} onChange={(e) => setField(f.key, e.target.value)}>
                  <option value="">—</option>
                  {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  value={draft.fields[f.key] ?? ''}
                  list={f.ref ? `note-refs-${f.ref}` : undefined}
                  placeholder={f.ref ? `${NOTE_KIND_LABELS[f.ref].replace(/s$/, '')} name` : undefined}
                  onChange={(e) => setField(f.key, e.target.value)}
                />
              )}
            </label>
          ))}
          {[...new Set(NOTE_FIELDS[draft.kind].map((f) => f.ref).filter((k): k is NoteKind => !!k))].map((k) => (
            <datalist key={k} id={`note-refs-${k}`}>
              {others.filter((r) => r.kind === k).map((r) => <option key={r.id} value={r.title} />)}
            </datalist>
          ))}
        </div>
      )}

      <div className="note-field-grid two">
        <label>
          <span>Also known as</span>
          <input value={draft.aliases} placeholder="Other names, comma-separated" onChange={(e) => set('aliases', e.target.value)} />
        </label>
        <label>
          <span>Tags</span>
          <input value={draft.tags} placeholder="e.g. sword coast, act 1" onChange={(e) => set('tags', e.target.value)} />
        </label>
      </div>

      <div className="note-body-edit">
        <textarea
          ref={area}
          aria-label="Note text"
          value={draft.body}
          rows={18}
          placeholder={'Write freely. # Heading, - list, **bold**, *italic*.\nType [[ to link another note; names of other notes link themselves.'}
          onChange={(e) => {
            set('body', e.target.value);
            detect(e.target);
          }}
          onSelect={(e) => detect(e.currentTarget)}
          onKeyDown={(e) => {
            if (!link || !suggestions.length) return;
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              const d = e.key === 'ArrowDown' ? 1 : -1;
              setLink({ ...link, pick: (link.pick + d + suggestions.length) % suggestions.length });
            } else if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              insert(suggestions[link.pick].ref.title);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setLink(null);
            }
          }}
        />
        {link && suggestions.length > 0 && (
          <ul className="link-suggest" role="listbox" aria-label="Link to note">
            {suggestions.map((s, i) => (
              <li key={s.ref.id} role="option" aria-selected={i === link.pick}>
                <button
                  type="button"
                  tabIndex={-1}
                  className={i === link.pick ? 'on' : ''}
                  onMouseDown={(e) => {
                    e.preventDefault(); // keep focus in the textarea
                    insert(s.ref.title);
                  }}
                >
                  <span className={`kind-dot kind-${s.ref.kind}`} aria-hidden />
                  {s.ref.title}
                  {s.via && <small> — “{s.via}”</small>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="row-form">
        <button type="button" className="btn" onClick={onDone} title="Save and read (Ctrl+E)">Done</button>
        <button type="button" className="btn ghost" onClick={onSave}>Save</button>
        <span className="spacer" />
        <button type="button" className="btn ghost danger-text" onClick={onDelete}>Delete</button>
      </div>
    </form>
  );
}
