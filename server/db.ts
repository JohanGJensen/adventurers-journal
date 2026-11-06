import { Database } from 'bun:sqlite';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const MIGRATIONS = join(import.meta.dir, 'migrations');

export const defaultDbPath = () => process.env.DND_DB ?? join(import.meta.dir, '..', 'data', 'dnd.sqlite');

export function openDb(path = defaultDbPath()): Database {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true, strict: true });
  if (path !== ':memory:') db.exec('PRAGMA journal_mode=WAL;');
  db.exec('PRAGMA foreign_keys=ON;');
  migrate(db);
  return db;
}

/** Applies migrations/NNN_*.sql above PRAGMA user_version, in order, each in its own transaction. */
export function migrate(db: Database): number {
  const current = (db.query('PRAGMA user_version').get() as { user_version: number }).user_version;
  const files = readdirSync(MIGRATIONS)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort();
  let applied = 0;
  for (const f of files) {
    const n = parseInt(f, 10);
    if (n <= current) continue;
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.exec(`PRAGMA user_version = ${n}`);
    })();
    applied++;
  }
  return applied;
}

export const parseJson = <T>(s: string | null | undefined, fallback: T): T => {
  if (s == null) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};
