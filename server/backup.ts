import type { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Copies the DB with VACUUM INTO data/backups/dnd-<timestamp>.sqlite (next to the DB file). Returns the path. */
export function backup(db: Database, dbPath: string): string {
  if (dbPath === ':memory:') throw new Error('Cannot back up an in-memory database');
  const dir = join(dirname(dbPath), 'backups');
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `dnd-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
  db.query('VACUUM INTO ?').run(out);
  return out;
}
