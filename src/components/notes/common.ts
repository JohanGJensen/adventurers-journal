import { NOTE_FIELDS, type Note, type NoteKind, type NoteRef } from '../../shared/types';

/** "k:3" = campaign 3, "c:1" = character 1, "" = everything. */
export type Owner = string;
export const ownerOf = (n: Pick<Note, 'campaignId' | 'characterId'>): Owner => (n.campaignId ? `k:${n.campaignId}` : `c:${n.characterId}`);
export const ownerBody = (o: Owner) =>
  o.startsWith('k:') ? { campaignId: Number(o.slice(2)), characterId: null } : { campaignId: null, characterId: Number(o.slice(2)) };

/** The editable copy of a note. Aliases and tags are edited as comma-separated text. */
export interface Draft {
  title: string;
  body: string;
  kind: NoteKind;
  owner: Owner;
  aliases: string;
  tags: string;
  fields: Record<string, string>;
}
export const toDraft = (n: Note): Draft => ({
  title: n.title,
  body: n.body,
  kind: n.kind,
  owner: ownerOf(n),
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
  ...ownerBody(d.owner),
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
export const factLine = (r: Pick<NoteRef, 'kind' | 'fields'>, max = 3) =>
  NOTE_FIELDS[r.kind]
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
