import { NOTE_FIELDS, NOTE_KIND_LABELS, type Note, type NoteKind, type NoteRef } from '../../shared/types';

/** The editable copy of a note. Aliases and tags are edited as comma-separated text. */
export interface Draft {
  title: string;
  body: string;
  kind: NoteKind;
  aliases: string;
  tags: string;
  fields: Record<string, string>;
}
export const toDraft = (n: Note): Draft => ({
  title: n.title,
  body: n.body,
  kind: n.kind,
  aliases: n.aliases.join(', '),
  tags: n.tags.join(', '),
  fields: n.fields,
});
const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
/** Only the fields the kind defines, so switching kind back and forth in the editor doesn't send junk. */
const kindFields = (d: Draft) => Object.fromEntries(NOTE_FIELDS[d.kind].filter((f) => d.fields[f.key]?.trim()).map((f) => [f.key, d.fields[f.key].trim()]));
export const draftBody = (d: Draft) => ({
  title: d.title,
  body: d.body,
  kind: d.kind,
  aliases: list(d.aliases),
  tags: list(d.tags),
  fields: kindFields(d),
});
export const sameDraft = (a: Draft, b: Draft) => JSON.stringify(draftBody(a)) === JSON.stringify(draftBody(b));

export const parseAt = (at: string) => new Date(/[zZ]$/.test(at) ? at : `${at.replace(' ', 'T')}Z`);

export const QUEST_ORDER = ['active', 'on hold', 'completed', 'failed'];

/** Index order within a kind group: open quests first, latest session first, plain notes by recency, the rest A–Z. */
export function sortForKind(kind: NoteKind, xs: NoteRef[]): NoteRef[] {
  const byTitle = (a: NoteRef, b: NoteRef) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true });
  const rank = (r: NoteRef) => {
    const i = QUEST_ORDER.indexOf(r.fields.status ?? '');
    return i < 0 ? 1.5 : i; // no status sits between "on hold" and "completed"
  };
  const num = (r: NoteRef) => Number.parseFloat(r.fields.number ?? '') || -Infinity;
  const out = [...xs];
  if (kind === 'quest') return out.sort((a, b) => rank(a) - rank(b) || byTitle(a, b));
  if (kind === 'session') return out.sort((a, b) => num(b) - num(a) || b.updatedAt.localeCompare(a.updatedAt));
  if (kind === 'note') return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return out.sort(byTitle);
}

/** A short line of the note's most telling fields, for list rows and link previews. */
/** "NPCs" → "NPC", "Notes" → "note" (lower). */
export const kindName = (k: NoteKind, lower = false) => {
  const s = NOTE_KIND_LABELS[k].replace(/s$/, '');
  return lower && k !== 'npc' ? s.toLowerCase() : s;
};

/** People get a round, face-cropped portrait; everything else keeps its picture's shape. */
export const isPortraitKind = (k: NoteKind) => k === 'player' || k === 'npc';

const SETTLEMENTS = ['city', 'town', 'village'];

/**
 * The stand-in picture for a note without its own (public/fallbacks). Places get a town or a landmark by their type.
 * Players get none: they're real people.
 */
export const fallbackImage = (r: Pick<NoteRef, 'kind' | 'fields'>): string | null => {
  if (r.kind === 'player') return null;
  if (r.kind === 'place') return `/fallbacks/place-${SETTLEMENTS.includes(r.fields.type ?? '') ? 'city' : 'landmark'}.png`;
  return `/fallbacks/${r.kind}.png`;
};

/** A list row's thumbnail: the note's own image, else its kind's stand-in. `updatedAt` busts the cache when the image changes. */
export const thumbSrc = (r: Pick<NoteRef, 'id' | 'kind' | 'fields' | 'hasImage' | 'updatedAt'>) =>
  r.hasImage ? `/api/notes/${r.id}/image?v=${encodeURIComponent(r.updatedAt)}` : fallbackImage(r);

/** Plain text of a note body for snippets: links show their label, markdown marks are dropped. */
export const plainText = (body: string) =>
  body.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, t, l) => l ?? t).replace(/[#*_>`]/g, '').replace(/\s+/g, ' ').trim();

/** Fields a sidebar row shows instead of the first ones: a player row reads "Bard · Half-elf", not the person's name. */
export const LIST_FACTS: Partial<Record<NoteKind, readonly string[]>> = { player: ['class', 'race'] };

export const factLine = (r: Pick<NoteRef, 'kind' | 'fields'>, max = 3, keys?: readonly string[]) =>
  (keys ? keys.map((k) => NOTE_FIELDS[r.kind].find((f) => f.key === k)!) : NOTE_FIELDS[r.kind])
    .filter((f) => r.fields[f.key])
    .slice(0, max)
    .map((f) => (f.key === 'number' ? `#${r.fields[f.key]}` : r.fields[f.key]))
    .join(' · ');

export const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : (JSON.parse(v) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, v: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* private mode etc. */
    }
  },
};
