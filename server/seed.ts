import type { Db } from './sqlite';
import faelan from '../src/data/faelan.json';
import { FAELAN_EXTRAS } from '../src/data/supplement';
import { insertCharacter } from './characters';

/** On an empty DB, adds Faelan so there is a character to open. */
export function seedIfEmpty(db: Db): number | null {
  const { n } = db.query('SELECT count(*) AS n FROM characters').get() as { n: number };
  if (n > 0) return null;
  return insertCharacter(db, faelan, { extras: FAELAN_EXTRAS, seedKey: 'faelan' });
}
