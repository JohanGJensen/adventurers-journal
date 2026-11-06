// The homebrew subclass library. Characters link to a subclass by index `homebrew-<id>` and always use its current version.
import type { Db } from './sqlite';
import { homebrewId, type HomebrewSubclass, type LevelChoice } from '../src/shared/types';
import { parseJson } from './db';
import { HttpError } from './http';

interface Row {
  id: number;
  class_key: string;
  name: string;
  data_json: string;
}

const toSubclass = (r: Row): HomebrewSubclass => ({ ...parseJson<Omit<HomebrewSubclass, 'id'>>(r.data_json, {} as never), id: r.id });

export function listHomebrew(db: Db, classKey?: string): HomebrewSubclass[] {
  const rows = (
    classKey
      ? db.query('SELECT * FROM homebrew_subclasses WHERE class_key = ? ORDER BY name').all(classKey)
      : db.query('SELECT * FROM homebrew_subclasses ORDER BY class_key, name').all()
  ) as Row[];
  const users = usage(db);
  return rows.map((r) => ({ ...toSubclass(r), usedBy: users.get(r.id) ?? [] }));
}

export function findHomebrew(db: Db, id: number): HomebrewSubclass | null {
  const r = db.query('SELECT * FROM homebrew_subclasses WHERE id = ?').get(id) as Row | null;
  return r ? toSubclass(r) : null;
}

export function getHomebrew(db: Db, id: number): HomebrewSubclass {
  const h = findHomebrew(db, id);
  if (!h) throw new HttpError(404, `No homebrew subclass ${id}`);
  return { ...h, usedBy: usage(db).get(id) ?? [] };
}

export function createHomebrew(db: Db, body: Omit<HomebrewSubclass, 'id'>): HomebrewSubclass {
  const { id } = db
    .query('INSERT INTO homebrew_subclasses (class_key, name, data_json) VALUES (?, ?, ?) RETURNING id')
    .get(body.classKey, body.name, JSON.stringify(body)) as { id: number };
  return getHomebrew(db, id);
}

export function updateHomebrew(db: Db, id: number, body: Omit<HomebrewSubclass, 'id'>): HomebrewSubclass {
  const current = getHomebrew(db, id);
  if (current.usedBy?.length && current.classKey !== body.classKey)
    throw new HttpError(409, `Can't change the class while ${current.usedBy.join(', ')} use this subclass`);
  db.query(`UPDATE homebrew_subclasses SET class_key = ?, name = ?, data_json = ?, updated_at = datetime('now') WHERE id = ?`).run(
    body.classKey,
    body.name,
    JSON.stringify(body),
    id,
  );
  // Characters store the subclass name in their level record; keep it in step with renames.
  for (const c of linked(db, id)) {
    const levels = c.levels.map((l) => (homebrewId(l.subclass?.index) === id ? { ...l, subclass: { ...l.subclass!, name: body.name } } : l));
    db.query('UPDATE characters SET levels_json = ? WHERE id = ?').run(JSON.stringify(levels), c.id);
  }
  return getHomebrew(db, id);
}

export function deleteHomebrew(db: Db, id: number) {
  const { usedBy } = getHomebrew(db, id);
  if (usedBy?.length) throw new HttpError(409, `In use by ${usedBy.join(', ')}. Undo their level-ups or pick another subclass first.`);
  db.query('DELETE FROM homebrew_subclasses WHERE id = ?').run(id);
}

/** Characters whose level-ups chose this homebrew subclass. */
function linked(db: Db, id: number) {
  const rows = db.query("SELECT id, name, levels_json FROM characters WHERE levels_json LIKE '%homebrew-%'").all() as {
    id: number;
    name: string;
    levels_json: string;
  }[];
  return rows
    .map((r) => ({ id: r.id, name: r.name, levels: parseJson<LevelChoice[]>(r.levels_json, []) }))
    .filter((r) => r.levels.some((l) => homebrewId(l.subclass?.index) === id));
}

/** homebrew id → names of characters using it */
function usage(db: Db): Map<number, string[]> {
  const out = new Map<number, string[]>();
  const rows = db.query("SELECT name, levels_json FROM characters WHERE levels_json LIKE '%homebrew-%'").all() as { name: string; levels_json: string }[];
  for (const r of rows) {
    for (const l of parseJson<LevelChoice[]>(r.levels_json, [])) {
      const id = homebrewId(l.subclass?.index);
      if (id !== null) out.set(id, [...new Set([...(out.get(id) ?? []), r.name])]);
    }
  }
  return out;
}
