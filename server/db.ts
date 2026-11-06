import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { MIGRATIONS } from './migrations';
import { openSqlite, type Db } from './sqlite';

/** Opens (creating if needed) and migrates the DB at `path`, or an in-memory one for ':memory:'. */
export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = openSqlite(path);
  // WAL + synchronous=NORMAL: durable against app crashes, skips an fsync per commit (play state saves often).
  if (path !== ':memory:') db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;');
  db.exec('PRAGMA foreign_keys=ON;');
  migrate(db);
  return db;
}

/** Applies MIGRATIONS above PRAGMA user_version, in order, each in its own transaction. */
export function migrate(db: Db): number {
  const current = (db.query('PRAGMA user_version').get() as { user_version: number }).user_version;
  let applied = 0;
  for (const { n, sql } of MIGRATIONS) {
    if (n <= current) continue;
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
