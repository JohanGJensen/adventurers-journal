import { EVENT_TYPES, type EventRow, type EventType } from '../../src/shared/types';
import { getCharacter } from '../characters';
import { parseJson } from '../db';
import { logEvents } from '../events';
import { body, HttpError, intParam, json, type Route } from '../http';
import { asEvents } from '../validate';

interface Row {
  id: number;
  at: string;
  type: EventType;
  summary: string;
  data_json: string | null;
}

/** Cursor = "<at>~<id>" of the last row returned; pages run newest first. */
const parseCursor = (v: string | null): [string, number] | null => {
  if (!v) return null;
  const m = /^(.+)~(\d+)$/.exec(v);
  if (!m) throw new HttpError(400, 'Invalid before cursor');
  return [m[1], Number(m[2])];
};

export const eventRoutes: Route[] = [
  [
    'GET',
    '/api/characters/:id/events',
    ({ db, params, url }) => {
      const { id } = getCharacter(db, intParam(params.id, 'character id'));
      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? 50) || 50));
      const types = (url.searchParams.get('type') ?? '').split(',').filter(Boolean);
      if (types.some((t) => !EVENT_TYPES.includes(t as EventType))) throw new HttpError(400, 'Unknown event type');
      const cursor = parseCursor(url.searchParams.get('before'));

      const where = ['character_id = ?'];
      const args: (string | number)[] = [id];
      if (types.length) {
        where.push(`type IN (${types.map(() => '?').join(',')})`);
        args.push(...types);
      }
      if (cursor) {
        where.push('(at < ? OR (at = ? AND id < ?))');
        args.push(cursor[0], cursor[0], cursor[1]);
      }
      const rows = db
        .query(`SELECT id, at, type, summary, data_json FROM events WHERE ${where.join(' AND ')} ORDER BY at DESC, id DESC LIMIT ?`)
        .all(...args, limit + 1) as Row[];
      const page = rows.slice(0, limit);
      const events: EventRow[] = page.map((r) => ({ id: r.id, at: r.at, type: r.type, summary: r.summary, data: parseJson(r.data_json, undefined) }));
      const last = page.at(-1);
      return json({ events, next: rows.length > limit && last ? `${last.at}~${last.id}` : null });
    },
  ],
  [
    'POST',
    '/api/characters/:id/events',
    async ({ db, params, req }) => {
      const { id } = getCharacter(db, intParam(params.id, 'character id'));
      const b = await body(req);
      const events = asEvents(Array.isArray(b) ? b : [b]);
      db.transaction(() => logEvents(db, id, events))();
      return json({ logged: events.length }, 201);
    },
  ],
];
