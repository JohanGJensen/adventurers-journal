import type { Db } from '../sqlite';
import {
  MARK_KINDS,
  PATH_KINDS,
  TERRAINS,
  type JourneyMapDto,
  type MapHex,
  type MapMark,
  type MapPath,
  type MarkKind,
  type PathKind,
  type Terrain,
} from '../../src/shared/types';
import { getCharacter } from '../characters';
import { body, HttpError, intParam, json, type Route } from '../http';
import { bad, isObj } from '../validate';

interface HexRow {
  q: number;
  r: number;
  terrain: Terrain;
  state: MapHex['state'];
  label: string;
  note_id: number | null;
}
interface PathRow {
  id: number;
  kind: PathKind;
  points_json: string;
}
interface MarkRow {
  id: number;
  kind: MarkKind;
  x: number;
  y: number;
  label: string;
  note_id: number | null;
}

const toHex = (r: HexRow): MapHex => ({ q: r.q, r: r.r, terrain: r.terrain, state: r.state, label: r.label, noteId: r.note_id });
const toPath = (r: PathRow): MapPath => ({ id: r.id, kind: r.kind, points: JSON.parse(r.points_json) });
const toMark = (r: MarkRow): MapMark => ({ id: r.id, kind: r.kind, x: r.x, y: r.y, label: r.label, noteId: r.note_id });

/** Hex coordinates stay within a generous board; they may be negative. */
const coord = (v: unknown, name: string): number =>
  Number.isInteger(v) && Math.abs(v as number) <= 500 ? (v as number) : bad(`${name} must be an integer between -500 and 500`);
const coordParam = (v: string | null, name: string) => coord(v === null || v === '' ? NaN : Number(v), name);
/** Map-unit positions (500 hexes ≈ 35 000 units), kept to one decimal. */
const pos = (v: unknown, name: string): number =>
  typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 50_000 ? Math.round(v * 10) / 10 : bad(`${name} must be a number within ±50000`);
const label = (v: unknown, max: number): string =>
  v === undefined ? '' : typeof v === 'string' && v.length <= max ? v.trim() : bad(`label must be a string (max ${max})`);
const oneOf = <T extends string>(list: readonly T[], v: unknown, name: string): T => (list.includes(v as T) ? (v as T) : bad(`${name} must be one of ${list.join(', ')}`));

function getMap(db: Db, characterId: number): JourneyMapDto {
  return {
    hexes: (db.query('SELECT * FROM map_hexes WHERE character_id = ? ORDER BY r, q').all(characterId) as HexRow[]).map(toHex),
    paths: (db.query('SELECT * FROM map_paths WHERE character_id = ? ORDER BY id').all(characterId) as PathRow[]).map(toPath),
    marks: (db.query('SELECT * FROM map_marks WHERE character_id = ? ORDER BY id').all(characterId) as MarkRow[]).map(toMark),
  };
}

function noteFor(db: Db, characterId: number, v: unknown): number | null {
  if (v == null) return null;
  const id = intParam(String(v), 'noteId');
  const n = db.query('SELECT character_id FROM notes WHERE id = ?').get(id) as { character_id: number | null } | null;
  if (!n) throw new HttpError(404, `No note ${id}`);
  if (n.character_id !== characterId) bad("noteId must be one of this character's notes");
  return id;
}

const owner = (db: Db, params: Record<string, string>) => getCharacter(db, intParam(params.id, 'character id')).id;

async function object(req: Request, shape: string): Promise<Record<string, unknown>> {
  const b = await body(req);
  return isObj(b) ? (b as Record<string, unknown>) : bad(`Body must be ${shape}`);
}

function getMark(db: Db, characterId: number, id: number): MarkRow {
  const r = db.query('SELECT * FROM map_marks WHERE id = ? AND character_id = ?').get(id, characterId) as MarkRow | null;
  if (!r) throw new HttpError(404, `No mark ${id}`);
  return r;
}

export const mapRoutes: Route[] = [
  ['GET', '/api/characters/:id/map', ({ db, params }) => json(getMap(db, owner(db, params)))],

  /* ---------- Hexes ---------- */
  [
    'PUT',
    '/api/characters/:id/map/hexes',
    async ({ db, params, req }) => {
      const id = owner(db, params);
      const o = await object(req, '{ q, r, terrain, state?, label?, noteId? }');
      const q = coord(o.q, 'q');
      const r = coord(o.r, 'r');
      const terrain = oneOf(TERRAINS, o.terrain, 'terrain');
      const state = o.state === undefined ? 'sketched' : oneOf(['sketched', 'charted'] as const, o.state, 'state');
      const row = db
        .query(
          `INSERT INTO map_hexes (character_id, q, r, terrain, state, label, note_id) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (character_id, q, r) DO UPDATE SET terrain = excluded.terrain, state = excluded.state, label = excluded.label,
             note_id = excluded.note_id, updated_at = datetime('now')
           RETURNING *`,
        )
        .get(id, q, r, terrain, state, label(o.label, 80), noteFor(db, id, o.noteId)) as HexRow;
      return json(toHex(row));
    },
  ],
  [
    'DELETE',
    '/api/characters/:id/map/hexes',
    ({ db, params, url }) => {
      const id = owner(db, params);
      const q = coordParam(url.searchParams.get('q'), 'q');
      const r = coordParam(url.searchParams.get('r'), 'r');
      const gone = db.query('DELETE FROM map_hexes WHERE character_id = ? AND q = ? AND r = ? RETURNING id').get(id, q, r);
      if (!gone) throw new HttpError(404, `No hex at ${q},${r}`);
      return json({ deleted: [q, r] });
    },
  ],

  /* ---------- Paths: freehand lines ---------- */
  [
    'POST',
    '/api/characters/:id/map/paths',
    async ({ db, params, req }) => {
      const id = owner(db, params);
      const o = await object(req, '{ kind, points }');
      const kind = oneOf(PATH_KINDS, o.kind, 'kind');
      if (!Array.isArray(o.points) || o.points.length < 2 || o.points.length > 2000) bad('points must be 2–2000 [x, y] pairs');
      const points = (o.points as unknown[]).map((p, i): [number, number] =>
        Array.isArray(p) && p.length === 2 ? [pos(p[0], `points[${i}].x`), pos(p[1], `points[${i}].y`)] : bad(`points[${i}] must be [x, y]`),
      );
      const row = db.query('INSERT INTO map_paths (character_id, kind, points_json) VALUES (?, ?, ?) RETURNING *').get(id, kind, JSON.stringify(points)) as PathRow;
      return json(toPath(row), 201);
    },
  ],
  [
    'DELETE',
    '/api/characters/:id/map/paths/:path',
    ({ db, params }) => {
      const id = owner(db, params);
      const path = intParam(params.path, 'path id');
      if (!db.query('DELETE FROM map_paths WHERE id = ? AND character_id = ? RETURNING id').get(path, id)) throw new HttpError(404, `No path ${path}`);
      return json({ deleted: path });
    },
  ],

  /* ---------- Marks: pins and free text ---------- */
  [
    'POST',
    '/api/characters/:id/map/marks',
    async ({ db, params, req }) => {
      const id = owner(db, params);
      const o = await object(req, '{ kind, x, y, label?, noteId? }');
      const row = db
        .query('INSERT INTO map_marks (character_id, kind, x, y, label, note_id) VALUES (?, ?, ?, ?, ?, ?) RETURNING *')
        .get(id, oneOf(MARK_KINDS, o.kind, 'kind'), pos(o.x, 'x'), pos(o.y, 'y'), label(o.label, 120), noteFor(db, id, o.noteId)) as MarkRow;
      return json(toMark(row), 201);
    },
  ],
  [
    'PATCH',
    '/api/characters/:id/map/marks/:mark',
    async ({ db, params, req }) => {
      const id = owner(db, params);
      const m = getMark(db, id, intParam(params.mark, 'mark id'));
      const o = await object(req, '{ kind?, x?, y?, label?, noteId? }');
      const row = db
        .query('UPDATE map_marks SET kind = ?, x = ?, y = ?, label = ?, note_id = ? WHERE id = ? RETURNING *')
        .get(
          o.kind === undefined ? m.kind : oneOf(MARK_KINDS, o.kind, 'kind'),
          o.x === undefined ? m.x : pos(o.x, 'x'),
          o.y === undefined ? m.y : pos(o.y, 'y'),
          o.label === undefined ? m.label : label(o.label, 120),
          o.noteId === undefined ? m.note_id : noteFor(db, id, o.noteId),
          m.id,
        ) as MarkRow;
      return json(toMark(row));
    },
  ],
  [
    'DELETE',
    '/api/characters/:id/map/marks/:mark',
    ({ db, params }) => {
      const id = owner(db, params);
      const m = getMark(db, id, intParam(params.mark, 'mark id'));
      db.query('DELETE FROM map_marks WHERE id = ?').run(m.id);
      return json({ deleted: m.id });
    },
  ],
];
