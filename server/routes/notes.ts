import type { Db } from '../sqlite';
import { buildLinkIndex, normName, refersTo, renameLinks } from '../../src/shared/noteLinks';
import { NOTE_FIELDS, NOTE_KINDS, type Note, type NoteKind, type NoteRef } from '../../src/shared/types';
import { getCampaign } from '../campaigns';
import { getCharacter } from '../characters';
import { body, HttpError, intParam, json, type Route } from '../http';
import { asPortrait, bad, isObj, optCampaignId } from '../validate';

interface Row {
  id: number;
  campaign_id: number;
  kind: NoteKind;
  title: string;
  body: string;
  aliases: string;
  tags: string;
  fields_json: string;
  image: string | null;
  created_at: string;
  updated_at: string;
}

const lines = (s: string) => (s ? s.split('\n') : []);
const parseFields = (s: string): Record<string, string> => {
  try {
    const o = JSON.parse(s) as unknown;
    return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, string>) : {};
  } catch {
    return {};
  }
};

/** A note without its image: what lists return. */
const toNote = (r: Row): Note => ({
  id: r.id,
  campaignId: r.campaign_id,
  kind: r.kind,
  title: r.title,
  body: r.body,
  aliases: lines(r.aliases),
  tags: lines(r.tags),
  fields: parseFields(r.fields_json),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** A whole note, image included: single-note responses only (images run to ~1.5 MB). */
const withImage = (r: Row): Note => ({ ...toNote(r), image: r.image });

function getRow(db: Db, id: number): Row {
  const r = db.query('SELECT * FROM notes WHERE id = ?').get(id) as Row | null;
  if (!r) throw new HttpError(404, `No note ${id}`);
  return r;
}
const getNote = (db: Db, id: number): Note => toNote(getRow(db, id));

/** User text → an FTS5 query of quoted prefix tokens, so input can never be a syntax error. */
export const ftsQuery = (q: string): string | null => {
  const tokens = q.match(/[\p{L}\p{N}_]+/gu) ?? [];
  return tokens.length ? tokens.map((t) => `"${t}"*`).join(' ') : null;
};

const asKind = (v: unknown): NoteKind => (NOTE_KINDS.includes(v as NoteKind) ? (v as NoteKind) : bad(`kind must be one of ${NOTE_KINDS.join(', ')}`));
const asText = (v: unknown, name: string, max: number) => (typeof v === 'string' && v.length <= max ? v : bad(`${name} must be a string (max ${max})`));

/** A list of short names: trimmed, one line each, deduped case-insensitively, empties dropped. */
function asNames(v: unknown, name: string, lower: boolean): string[] {
  if (!Array.isArray(v) || v.length > 30 || !v.every((x) => typeof x === 'string' && x.length <= 100)) bad(`${name} must be up to 30 strings (max 100)`);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of v as string[]) {
    const t = x.replace(/\s+/g, ' ').trim();
    const v2 = lower ? t.toLowerCase() : t;
    if (v2 && !seen.has(normName(v2))) seen.add(normName(v2)), out.push(v2);
  }
  return out;
}

/**
 * Keeps only the fields `kind` defines, with non-empty string values and pick-list values from the list.
 * `lenient` drops a bad pick-list value instead of rejecting it (used when the kind changes under existing fields).
 */
function asFields(v: unknown, kind: NoteKind, lenient = false): Record<string, string> {
  if (!isObj(v)) return bad('fields must be an object');
  const out: Record<string, string> = {};
  for (const f of NOTE_FIELDS[kind]) {
    const x = (v as Record<string, unknown>)[f.key];
    if (x === undefined || x === null || x === '') continue;
    if (typeof x !== 'string' || x.length > 300) bad(`${f.label} must be a string (max 300)`);
    const t = (x as string).trim();
    if (f.options && t && !f.options.includes(t)) {
      if (lenient) continue;
      bad(`${f.label} must be one of ${f.options.join(', ')}`);
    }
    if (t) out[f.key] = t;
  }
  return out;
}

/**
 * The campaign a new note goes to: `campaignId`, or else the campaign of `characterId` (so callers
 * holding only a character, like the map, needn't look it up). Every note belongs to a campaign.
 */
function campaignFor(db: Db, o: Record<string, unknown>): number {
  const id = optCampaignId(o.campaignId);
  if (id) return getCampaign(db, id).id;
  if (o.characterId != null) {
    const c = getCharacter(db, intParam(String(o.characterId), 'characterId'));
    if (c.campaignId) return c.campaignId;
    bad(`${c.name} isn't in a campaign yet; add them to one to keep notes`);
  }
  return bad('A note needs a campaignId');
}

/** Points [[old title]] links in the campaign's other notes at the new title. Leaves updated_at alone: the author didn't edit them. */
function rewriteLinks(db: Db, n: Note, from: string, to: string) {
  const q = ftsQuery(from);
  if (!q) return;
  const rows = db
    .query('SELECT n.id, n.body FROM notes_fts JOIN notes n ON n.id = notes_fts.rowid WHERE notes_fts MATCH ? AND n.id != ? AND n.campaign_id = ?')
    .all(`body : (${q})`, n.id, n.campaignId) as {
    id: number;
    body: string;
  }[];
  for (const r of rows) {
    const body = renameLinks(r.body, from, to);
    if (body !== r.body) db.query('UPDATE notes SET body = ? WHERE id = ?').run(body, r.id);
  }
}


function allRefs(db: Db, where: string[] = [], args: (string | number)[] = []): NoteRef[] {
  const rows = db
    .query(`SELECT * FROM notes ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY updated_at DESC, id DESC`)
    .all(...args) as Row[];
  return rows.map((r) => {
    const n = toNote(r);
    const { body: _, createdAt: __, ...ref } = n;
    return ref;
  });
}

export const noteRoutes: Route[] = [
  [
    'GET',
    '/api/notes/index',
    ({ db, url }) => {
      const campaign = url.searchParams.get('campaign');
      return json(campaign ? allRefs(db, ['campaign_id = ?'], [intParam(campaign, 'campaign')]) : allRefs(db));
    },
  ],
  [
    'GET',
    '/api/notes/:id/backlinks',
    ({ db, params }) => {
      const n = getNote(db, intParam(params.id, 'note id'));
      const names = [n.title, ...n.aliases];
      // Links stay inside a campaign. FTS narrows the candidates to notes containing every word of
      // some name; refersTo() then resolves their links against the campaign's notes, as the reader sees them.
      const qs = names.map(ftsQuery).filter((q): q is string => !!q);
      if (!qs.length) return json([]);
      const rows = db
        .query(`SELECT n.* FROM notes_fts JOIN notes n ON n.id = notes_fts.rowid WHERE notes_fts MATCH ? AND n.id != ? AND n.campaign_id = ?`)
        .all(`{title body} : (${qs.map((q) => `(${q})`).join(' OR ')})`, n.id, n.campaignId) as Row[];
      const fieldRows = db.query(`SELECT * FROM notes WHERE id != ? AND campaign_id = ? AND fields_json != '{}'`).all(n.id, n.campaignId) as Row[];
      const index = buildLinkIndex(allRefs(db, ['campaign_id = ?'], [n.campaignId]));
      const seen = new Set<number>();
      const out: Pick<Note, 'id' | 'title' | 'kind'>[] = [];
      for (const r of [...rows, ...fieldRows].sort((a, b) => b.updated_at.localeCompare(a.updated_at))) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        const m = toNote(r);
        if (refersTo(m, index, n.id)) out.push({ id: m.id, title: m.title, kind: m.kind });
      }
      return json(out);
    },
  ],
  [
    'GET',
    '/api/notes',
    ({ db, url }) => {
      const p = url.searchParams;
      const where: string[] = [];
      const args: (string | number)[] = [];
      if (p.get('campaign')) {
        where.push('n.campaign_id = ?');
        args.push(intParam(p.get('campaign'), 'campaign'));
      }
      if (p.get('kind')) {
        where.push('n.kind = ?');
        args.push(asKind(p.get('kind')));
      }
      if (p.get('tag')) {
        where.push("instr(char(10) || n.tags || char(10), char(10) || ? || char(10)) > 0");
        args.push(p.get('tag')!.trim().toLowerCase());
      }
      const q = ftsQuery(p.get('q') ?? '');
      let sql: string;
      if (q) {
        where.push('notes_fts MATCH ?');
        args.push(q);
        sql = `SELECT n.* FROM notes_fts JOIN notes n ON n.id = notes_fts.rowid WHERE ${where.join(' AND ')} ORDER BY bm25(notes_fts), n.updated_at DESC LIMIT 200`;
      } else {
        sql = `SELECT n.* FROM notes n ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY n.updated_at DESC, n.id DESC LIMIT 200`;
      }
      return json((db.query(sql).all(...args) as Row[]).map(toNote));
    },
  ],
  [
    'POST',
    '/api/notes',
    async ({ db, req }) => {
      const b = await body(req);
      if (!isObj(b)) bad('Body must be { title, campaignId (or characterId), body?, kind?, aliases?, tags?, fields? }');
      const o = b as Record<string, unknown>;
      const campaignId = campaignFor(db, o);
      const title = asText(o.title ?? 'Untitled', 'title', 300).trim() || 'Untitled';
      const kind = o.kind === undefined ? 'note' : asKind(o.kind);
      const r = db
        .query('INSERT INTO notes (campaign_id, kind, title, body, aliases, tags, fields_json) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *')
        .get(
          campaignId,
          kind,
          title,
          asText(o.body ?? '', 'body', 200_000),
          asNames(o.aliases ?? [], 'aliases', false).join('\n'),
          asNames(o.tags ?? [], 'tags', true).join('\n'),
          JSON.stringify(asFields(o.fields ?? {}, kind)),
        ) as Row;
      return json(withImage(r), 201);
    },
  ],
  ['GET', '/api/notes/:id', ({ db, params }) => json(withImage(getRow(db, intParam(params.id, 'note id'))))],
  [
    'PATCH',
    '/api/notes/:id',
    async ({ db, params, req }) => {
      const row = getRow(db, intParam(params.id, 'note id'));
      const n = toNote(row);
      const b = await body(req);
      if (!isObj(b)) bad('Body must be an object');
      const o = b as Record<string, unknown>;
      // A note can move to another campaign, never to none.
      const campaignId = o.campaignId === undefined ? n.campaignId : getCampaign(db, optCampaignId(o.campaignId) ?? bad('campaignId must be a positive integer')).id;
      const title = o.title === undefined ? n.title : asText(o.title, 'title', 300).trim() || 'Untitled';
      const text = o.body === undefined ? n.body : asText(o.body, 'body', 200_000);
      const kind = o.kind === undefined ? n.kind : asKind(o.kind);
      const image = o.image === undefined ? row.image : o.image === null ? null : asPortrait(o.image);
      let aliases = o.aliases === undefined ? n.aliases : asNames(o.aliases, 'aliases', false);
      const tags = o.tags === undefined ? n.tags : asNames(o.tags, 'tags', true);
      // On a kind change, fields the new kind doesn't define are dropped.
      const fields = asFields(o.fields === undefined ? n.fields : o.fields, kind, kind !== n.kind);
      const renamed = normName(title) !== normName(n.title);
      // The old title stays an alias, so plain mentions of it still find this note.
      if (renamed && !aliases.some((a) => normName(a) === normName(n.title)) && aliases.length < 30) aliases = [...aliases, n.title];
      aliases = aliases.filter((a) => normName(a) !== normName(title));
      db.transaction(() => {
        db.query(
          `UPDATE notes SET campaign_id = ?, kind = ?, title = ?, body = ?, aliases = ?, tags = ?, fields_json = ?, image = ?, updated_at = datetime('now') WHERE id = ?`,
        ).run(campaignId, kind, title, text, aliases.join('\n'), tags.join('\n'), JSON.stringify(fields), image, n.id);
        if (renamed) rewriteLinks(db, { ...n, campaignId }, n.title, title);
      })();
      return json(withImage(getRow(db, n.id)));
    },
  ],
  [
    'DELETE',
    '/api/notes/:id',
    ({ db, params }) => {
      const n = getNote(db, intParam(params.id, 'note id'));
      db.query('DELETE FROM notes WHERE id = ?').run(n.id);
      return json({ deleted: n.id });
    },
  ],
];
