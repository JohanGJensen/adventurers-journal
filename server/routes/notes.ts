import type { Database } from 'bun:sqlite';
import { NOTE_KINDS, type Note, type NoteKind } from '../../src/shared/types';
import { getCampaign } from '../campaigns';
import { getCharacter } from '../characters';
import { body, HttpError, intParam, json, type Route } from '../http';
import { bad, isObj, optCampaignId } from '../validate';

interface Row {
  id: number;
  campaign_id: number | null;
  character_id: number | null;
  kind: NoteKind;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
}

const toNote = (r: Row): Note => ({
  id: r.id,
  campaignId: r.campaign_id,
  characterId: r.character_id,
  kind: r.kind,
  title: r.title,
  body: r.body,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

function getNote(db: Database, id: number): Note {
  const r = db.query('SELECT * FROM notes WHERE id = ?').get(id) as Row | null;
  if (!r) throw new HttpError(404, `No note ${id}`);
  return toNote(r);
}

/** User text → an FTS5 query of quoted prefix tokens, so input can never be a syntax error. */
export const ftsQuery = (q: string): string | null => {
  const tokens = q.match(/[\p{L}\p{N}_]+/gu) ?? [];
  return tokens.length ? tokens.map((t) => `"${t}"*`).join(' ') : null;
};

const asKind = (v: unknown): NoteKind => (NOTE_KINDS.includes(v as NoteKind) ? (v as NoteKind) : bad(`kind must be one of ${NOTE_KINDS.join(', ')}`));
const asText = (v: unknown, name: string, max: number) => (typeof v === 'string' && v.length <= max ? v : bad(`${name} must be a string (max ${max})`));

function checkOwners(db: Database, campaignId: number | null, characterId: number | null) {
  if (campaignId === null && characterId === null) bad('A note needs a campaignId or a characterId');
  if (campaignId) getCampaign(db, campaignId);
  if (characterId) getCharacter(db, characterId);
}

export const noteRoutes: Route[] = [
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
      if (p.get('character')) {
        where.push('n.character_id = ?');
        args.push(intParam(p.get('character'), 'character'));
      }
      if (p.get('kind')) {
        where.push('n.kind = ?');
        args.push(asKind(p.get('kind')));
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
      if (!isObj(b)) bad('Body must be { title, body?, kind?, campaignId?, characterId? }');
      const o = b as Record<string, unknown>;
      const campaignId = optCampaignId(o.campaignId) ?? null;
      const characterId = o.characterId == null ? null : intParam(String(o.characterId), 'characterId');
      checkOwners(db, campaignId, characterId);
      const title = asText(o.title ?? 'Untitled', 'title', 300).trim() || 'Untitled';
      const r = db
        .query('INSERT INTO notes (campaign_id, character_id, kind, title, body) VALUES (?, ?, ?, ?, ?) RETURNING *')
        .get(campaignId, characterId, o.kind === undefined ? 'note' : asKind(o.kind), title, asText(o.body ?? '', 'body', 200_000)) as Row;
      return json(toNote(r), 201);
    },
  ],
  [
    'PATCH',
    '/api/notes/:id',
    async ({ db, params, req }) => {
      const n = getNote(db, intParam(params.id, 'note id'));
      const b = await body(req);
      if (!isObj(b)) bad('Body must be an object');
      const o = b as Record<string, unknown>;
      const campaignId = o.campaignId === undefined ? n.campaignId : (optCampaignId(o.campaignId) ?? null);
      const characterId =
        o.characterId === undefined ? n.characterId : o.characterId === null ? null : intParam(String(o.characterId), 'characterId');
      checkOwners(db, campaignId, characterId);
      const title = o.title === undefined ? n.title : asText(o.title, 'title', 300).trim() || 'Untitled';
      const text = o.body === undefined ? n.body : asText(o.body, 'body', 200_000);
      const kind = o.kind === undefined ? n.kind : asKind(o.kind);
      db.query(
        `UPDATE notes SET campaign_id = ?, character_id = ?, kind = ?, title = ?, body = ?, updated_at = datetime('now') WHERE id = ?`,
      ).run(campaignId, characterId, kind, title, text, n.id);
      return json(getNote(db, n.id));
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
