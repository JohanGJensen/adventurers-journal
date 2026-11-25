import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { buildCharacter } from '../lib/character';
import { api } from '../lib/client';
import { linkTo } from '../lib/router';
import { toast } from '../lib/toast';
import { TRAIT_KINDS, type CharacterDto, type Lore, type LoreSection, type TraitKind } from '../shared/types';
import { Loader } from './Loader';

const TRAIT_LABEL: Record<TraitKind, string> = { personality: 'Personality', ideals: 'Ideals', bonds: 'Bonds', flaws: 'Flaws' };

/** "Omens: flowers bloom…" or "Socially awkward. Warm, but…" → a short lead-in to set in bold, and the rest. */
function leadIn(text: string): [string, string] {
  const m = /^(.{2,40}?[:.])\s+(\S.*)$/s.exec(text);
  return m && m[1].split(/\s+/).length <= 5 ? [m[1], m[2]] : ['', text];
}

function Bullet({ text }: { text: string }) {
  const [lead, rest] = leadIn(text);
  return (
    <li>
      {lead && <strong>{lead}</strong>} {rest}
    </li>
  );
}

/** Blank lines split paragraphs; a block whose lines all start with "- " is a list. */
function Prose({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  if (!blocks.length) return <p className="hint">Nothing written yet.</p>;
  return (
    <>
      {blocks.map((b, i) => {
        const lines = b.split('\n');
        return lines.every((l) => l.trimStart().startsWith('- ')) ? (
          <ul key={i} className="lore-list">{lines.map((l, j) => <Bullet key={j} text={l.trimStart().slice(2)} />)}</ul>
        ) : (
          <p key={i}>{b}</p>
        );
      })}
    </>
  );
}

const saveKeys = (save: () => void) => (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    save();
  }
};

const newId = () => `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

function SectionCard({
  section,
  first,
  last,
  startEditing,
  onSave,
  onMove,
  onDelete,
}: {
  section: LoreSection;
  first: boolean;
  last: boolean;
  startEditing: boolean;
  onSave: (s: LoreSection) => Promise<boolean>;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState<LoreSection | null>(startEditing ? section : null);
  const changed = draft !== null && (draft.title !== section.title || draft.body !== section.body);
  const save = async () => {
    if (draft && changed) await onSave(draft);
  };
  const done = async () => {
    if (!draft || !changed || (await onSave(draft))) setDraft(null);
  };

  if (!draft)
    return (
      <section className="card lore-section">
        <div className="card-head">
          <h2>{section.title || 'Untitled'}</h2>
          <button className="btn ghost small" onClick={() => setDraft(section)}>Edit</button>
        </div>
        <Prose text={section.body} />
      </section>
    );

  return (
    <section className="card lore-section editing">
      <form onSubmit={(e) => e.preventDefault()} onBlur={() => void save()} onKeyDown={saveKeys(() => void save())}>
        <input className="note-title" aria-label="Section title" value={draft.title} autoFocus onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        <textarea aria-label="Section text" rows={10} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
        <p className="hint">Leave a blank line between paragraphs. Start lines with “- ” for a list.</p>
        <div className="row-form">
          <button type="button" className="btn" onClick={() => void done()}>Done</button>
          <button type="button" className="btn ghost small" disabled={first} onClick={() => onMove(-1)} aria-label="Move section up">↑</button>
          <button type="button" className="btn ghost small" disabled={last} onClick={() => onMove(1)} aria-label="Move section down">↓</button>
          <span className="hint">{changed ? 'Unsaved — saves on blur or Ctrl+S' : 'Saved'}</span>
          <button type="button" className="btn ghost danger-text" onClick={onDelete}>Delete</button>
        </div>
      </form>
    </section>
  );
}

function TraitCard({ kind, items, onSave }: { kind: TraitKind; items: string[]; onSave: (items: string[]) => Promise<boolean> }) {
  const [draft, setDraft] = useState<string | null>(null);
  const parse = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);
  const changed = draft !== null && parse(draft).join('\n') !== items.join('\n');
  const save = async () => {
    if (draft !== null && changed) await onSave(parse(draft));
  };
  const done = async () => {
    if (draft === null || !changed || (await onSave(parse(draft)))) setDraft(null);
  };

  return (
    <section className="lore-trait">
      <div className="lore-trait-head">
        <h3>{TRAIT_LABEL[kind]}</h3>
        {draft === null && <button className="btn ghost small" onClick={() => setDraft(items.join('\n'))}>Edit</button>}
      </div>
      {draft === null ? (
        items.length ? <ul className="lore-list">{items.map((t, i) => <Bullet key={i} text={t} />)}</ul> : <p className="hint">None yet.</p>
      ) : (
        <form onSubmit={(e) => e.preventDefault()} onBlur={() => void save()} onKeyDown={saveKeys(() => void save())}>
          <textarea aria-label={`${TRAIT_LABEL[kind]}, one per line`} rows={6} value={draft} autoFocus onChange={(e) => setDraft(e.target.value)} />
          <div className="row-form">
            <button type="button" className="btn" onClick={() => void done()}>Done</button>
            <span className="hint">One per line. {changed ? 'Unsaved' : 'Saved'}</span>
          </div>
        </form>
      )}
    </section>
  );
}

export function LorePage({ characterId }: { characterId: number }) {
  const [character, setCharacter] = useState<CharacterDto | null>(null);
  const [lore, setLore] = useState<Lore | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  // Saves run in order, each building on the last saved document.
  const latest = useRef<Lore | null>(null);

  useEffect(() => {
    api<CharacterDto>('GET', `/characters/${characterId}`).then((r) => {
      if (r.data) {
        setCharacter(r.data);
        document.title = `Lore · ${r.data.name}`;
      }
    });
    api<Lore>('GET', `/characters/${characterId}/lore`).then((r) => {
      if (r.error !== undefined) return toast(`Could not load lore: ${r.error}`, 'error');
      latest.current = r.data;
      setLore(r.data);
    });
  }, [characterId]);

  const persist = async (change: (l: Lore) => Lore): Promise<boolean> => {
    if (!latest.current) return false;
    const next = change(latest.current);
    latest.current = next;
    setLore(next);
    const r = await api<Lore>('PUT', `/characters/${characterId}/lore`, { sections: next.sections, traits: next.traits });
    if (r.error !== undefined) {
      toast(`Could not save lore: ${r.error}`, 'error');
      return false;
    }
    return true;
  };

  const updateSection = (s: LoreSection) => persist((l) => ({ ...l, sections: l.sections.map((x) => (x.id === s.id ? s : x)) }));
  const moveSection = (id: string, dir: -1 | 1) =>
    void persist((l) => {
      const i = l.sections.findIndex((x) => x.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= l.sections.length) return l;
      const sections = [...l.sections];
      [sections[i], sections[j]] = [sections[j], sections[i]];
      return { ...l, sections };
    });
  const deleteSection = (s: LoreSection) => {
    if (!confirm(`Delete the section “${s.title || 'Untitled'}”?`)) return;
    void persist((l) => ({ ...l, sections: l.sections.filter((x) => x.id !== s.id) }));
  };
  const addSection = () => {
    const id = newId();
    setFresh(id);
    void persist((l) => ({ ...l, sections: [...l.sections, { id, title: 'New chapter', body: '' }] }));
  };

  // The class palette (accent colours), as on the sheet.
  let classKey: string | undefined;
  try {
    classKey = character ? buildCharacter(character.sheet, character.extras, character.levels, character.homebrew).classKey : undefined;
  } catch {
    classKey = undefined;
  }

  return (
    <main className="sheet lore-page" data-class={classKey}>
      <nav className="sheet-nav">
        <a {...linkTo('/')}>← All characters</a>
        <a {...linkTo(`/c/${characterId}`)}>Sheet</a>
        <a {...linkTo(`/c/${characterId}/log`)}>History</a>
        <a {...linkTo(`/notes?character=${characterId}`)}>Notes</a>
      </nav>
      <header className="list-head">
        <h1>Lore & Story{character ? ` · ${character.name}` : ''}</h1>
      </header>

      {!lore ? (
        <Loader label="Recalling old tales" />
      ) : (
        <div className="lore-layout">
          <section className="card lore-glance" aria-label="At a glance">
            <h2>At a glance</h2>
            <div className="lore-traits">
              {TRAIT_KINDS.map((k) => (
                <TraitCard key={k} kind={k} items={lore.traits[k]} onSave={(items) => persist((l) => ({ ...l, traits: { ...l.traits, [k]: items } }))} />
              ))}
            </div>
          </section>
          <div className="lore-story">
            {!lore.sections.length && <p className="hint">No story yet. Add the first chapter of their tale.</p>}
            {lore.sections.map((s, i) => (
              <SectionCard
                key={s.id}
                section={s}
                first={i === 0}
                last={i === lore.sections.length - 1}
                startEditing={s.id === fresh}
                onSave={updateSection}
                onMove={(dir) => moveSection(s.id, dir)}
                onDelete={() => deleteSection(s)}
              />
            ))}
            <button className="btn" onClick={addSection}>Add a chapter</button>
          </div>
        </div>
      )}
    </main>
  );
}
