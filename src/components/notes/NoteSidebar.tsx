import { useState } from 'react';
import { NOTE_KINDS, NOTE_KIND_LABELS, type Note, type NoteKind } from '../../shared/types';
import { factLine, LIST_FACTS, plainText, sortForKind, storage } from './common';

const COLLAPSED_KEY = 'notes.collapsedKinds';

interface Props {
  notes: Note[];
  selectedId: number | null;
  /** Live title of the note being edited, so the row follows the editor. */
  draftTitle: string | null;
  /** Keep the server's relevance order inside each group (while searching). */
  ranked: boolean;
  /** One kind is shown: a flat list without group headers. */
  flat: boolean;
  onOpen: (n: Note) => void;
}

/** Notes grouped by kind, each group collapsible and counted. */
export function NoteSidebar({ notes, selectedId, draftTitle, ranked, flat, onOpen }: Props) {
  const [collapsed, setCollapsed] = useState<NoteKind[]>(() => storage.get(COLLAPSED_KEY, []));
  const toggle = (k: NoteKind) => {
    const next = collapsed.includes(k) ? collapsed.filter((x) => x !== k) : [...collapsed, k];
    setCollapsed(next);
    storage.set(COLLAPSED_KEY, next);
  };

  const groups = NOTE_KINDS.map((kind) => {
    const xs = notes.filter((n) => n.kind === kind);
    return { kind, notes: ranked ? xs : (sortForKind(kind, xs) as Note[]) };
  }).filter((g) => g.notes.length);

  return (
    <div className="note-groups">
      {groups.map((g) => {
        // A group never hides the open note.
        const open = flat || !collapsed.includes(g.kind) || g.notes.some((n) => n.id === selectedId);
        return (
          <section key={g.kind} className={`note-group kind-${g.kind}`}>
            {!flat && (
              <button className="note-group-head" aria-expanded={open} onClick={() => toggle(g.kind)}>
                <span className="caret" aria-hidden>{open ? '▾' : '▸'}</span>
                <span className={`kind-dot kind-${g.kind}`} aria-hidden />
                {NOTE_KIND_LABELS[g.kind]}
                <span className="count">{g.notes.length}</span>
              </button>
            )}
            {open && (
              <ul className="note-list">
                {g.notes.map((n) => {
                  const facts = factLine(n, 2, LIST_FACTS[n.kind]);
                  const status = n.kind === 'quest' ? n.fields.status : undefined;
                  return (
                    <li key={n.id}>
                      <button className={`note-row ${n.id === selectedId ? 'on' : ''} ${status ? `status-${status.replace(' ', '-')}` : ''}`} onClick={() => onOpen(n)}>
                        <strong>{n.id === selectedId && draftTitle !== null ? draftTitle : n.title}</strong>
                        {facts && <small>{facts}</small>}
                        {n.body && <span className="note-snippet">{plainText(n.body).slice(0, 140)}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
