import type { Db } from './sqlite';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';

/** Writes a consistent copy of the DB (WAL included) to `outPath`, replacing any file already there. */
export function backup(db: Db, outPath: string): void {
  mkdirSync(dirname(outPath), { recursive: true });
  rmSync(outPath, { force: true }); // VACUUM INTO refuses to overwrite
  db.query('VACUUM INTO ?').run(outPath);
}
