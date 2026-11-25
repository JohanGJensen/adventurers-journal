// Links between notes: explicit [[Title]] / [[Title|label]] links, plus auto-links for
// plain mentions of another note's title or alias. Shared by the server (backlinks, renames)
// and the client (rendering, autocomplete).
import { NOTE_FIELDS, type NoteRef } from './types';

/** Names compare case-insensitively with whitespace collapsed. */
export const normName = (s: string): string => s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();

/** Names shorter than this are never auto-linked (only via [[ ]]), so "Ox" doesn't light up every page. */
export const MIN_AUTO_LEN = 3;

const WIKI = /\[\[([^[\]\n|]+?)(?:\|([^[\]\n]+?))?\]\]/g;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A regex that matches any of `names` as whole words (Unicode-aware), longest first. */
function namesRegex(names: Iterable<string>): RegExp | null {
  const list = [...new Set([...names].map(normName))].filter((n) => n.length >= MIN_AUTO_LEN).sort((a, b) => b.length - a.length);
  if (!list.length) return null;
  const alt = list.map((n) => n.split(' ').map(escapeRe).join('\\s+')).join('|');
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alt})(?![\\p{L}\\p{N}_])`, 'giu');
}

/** The targets of the explicit links in `body`, as written. */
export const wikiLinks = (body: string): string[] => [...body.matchAll(WIKI)].map((m) => m[1].trim());

export interface LinkIndex {
  byName: Map<string, NoteRef>;
  /** Matches auto-linkable names (excludes the current note's own names). */
  auto: RegExp | null;
}

const ownerKey = (r: Pick<NoteRef, 'campaignId' | 'characterId'>) => (r.campaignId ? `k:${r.campaignId}` : `c:${r.characterId}`);

/**
 * Name → note for every title and alias. When two notes share a name, the one with the same
 * owner as the note being read wins, otherwise the first in `refs`.
 */
export function buildLinkIndex(refs: NoteRef[], self?: Pick<NoteRef, 'id' | 'campaignId' | 'characterId'> | null): LinkIndex {
  const byName = new Map<string, NoteRef>();
  const home = self ? ownerKey(self) : null;
  for (const r of refs) {
    for (const name of [r.title, ...r.aliases]) {
      const k = normName(name);
      if (!k) continue;
      const prev = byName.get(k);
      if (!prev || (home && ownerKey(prev) !== home && ownerKey(r) === home)) byName.set(k, r);
    }
  }
  const autoNames = [...byName].filter(([, r]) => r.id !== self?.id).map(([k]) => k);
  return { byName, auto: namesRegex(autoNames) };
}

export type Segment =
  | { t: 'text'; text: string }
  | { t: 'link'; id: number; text: string; auto: boolean }
  | { t: 'missing'; target: string; text: string };

/**
 * Splits plain text into text and link segments. `seen` (shared across a paragraph by the caller)
 * makes only the first auto-mention of a note link, and an explicit link suppresses later auto ones.
 */
export function segmentText(text: string, index: LinkIndex, seen: Set<number> = new Set()): Segment[] {
  const out: Segment[] = [];
  const push = (s: Segment) => {
    const last = out[out.length - 1];
    if (s.t === 'text' && last?.t === 'text') last.text += s.text;
    else if (s.t !== 'text' || s.text) out.push(s);
  };
  const autoLink = (chunk: string) => {
    if (!index.auto) return push({ t: 'text', text: chunk });
    let at = 0;
    for (const m of chunk.matchAll(index.auto)) {
      const r = index.byName.get(normName(m[0]));
      if (!r || seen.has(r.id)) continue;
      seen.add(r.id);
      push({ t: 'text', text: chunk.slice(at, m.index) });
      push({ t: 'link', id: r.id, text: m[0], auto: true });
      at = m.index + m[0].length;
    }
    push({ t: 'text', text: chunk.slice(at) });
  };
  let at = 0;
  for (const m of text.matchAll(WIKI)) {
    autoLink(text.slice(at, m.index));
    const target = m[1].trim();
    const label = (m[2] ?? m[1]).trim();
    const r = index.byName.get(normName(target));
    if (r) {
      seen.add(r.id);
      push({ t: 'link', id: r.id, text: label, auto: false });
    } else push({ t: 'missing', target, text: label });
    at = m.index + m[0].length;
  }
  autoLink(text.slice(at));
  return out;
}

/** The note a reference-field value points at, if any. */
export const resolveName = (index: LinkIndex, name: string): NoteRef | undefined => index.byName.get(normName(name));

/**
 * Does `note` link to note `targetId` — by [[link]], plain mention or a reference field — when read
 * against `index`? Resolving through the full index means "Neverwinter Wood" doesn't count as "Neverwinter".
 */
export function refersTo(note: Pick<NoteRef, 'id' | 'kind' | 'fields'> & { body: string }, index: LinkIndex, targetId: number): boolean {
  if (note.id === targetId) return false;
  if (NOTE_FIELDS[note.kind].some((f) => f.ref && note.fields[f.key] && resolveName(index, note.fields[f.key])?.id === targetId)) return true;
  return segmentText(note.body, index).some((s) => s.t === 'link' && s.id === targetId);
}

/** Rewrites [[old]] and [[old|label]] to point at `newName`. */
export const renameLinks = (body: string, oldName: string, newName: string): string => {
  const from = normName(oldName);
  return body.replace(WIKI, (all, target: string, label?: string) =>
    normName(target) === from ? `[[${newName}${label === undefined ? '' : `|${label}`}]]` : all,
  );
};
