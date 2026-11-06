import type { Database } from 'bun:sqlite';
import faelan from '../src/data/faelan.json';
import { FAELAN_EXTRAS } from '../src/data/supplement';
import { insertCharacter } from './characters';

/** On an empty DB, adds Faelan so there is a character to open and to import localStorage data into. */
export function seedIfEmpty(db: Database): number | null {
  const { n } = db.query('SELECT count(*) AS n FROM characters').get() as { n: number };
  if (n > 0) return null;
  return insertCharacter(db, faelan, { extras: FAELAN_EXTRAS, seedKey: 'faelan' });
}
