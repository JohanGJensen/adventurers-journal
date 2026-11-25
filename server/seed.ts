import type { Db } from './sqlite';
import faelan from '../src/data/faelan.json';
import { FAELAN_EXTRAS } from '../src/data/supplement';
import { FAELAN_LORE } from '../src/data/faelan-lore';
import { insertCharacter } from './characters';

/** On an empty DB, adds Faelan so there is a character to open. Also backfills his lore (see seedLore). */
export function seedIfEmpty(db: Db): number | null {
  const { n } = db.query('SELECT count(*) AS n FROM characters').get() as { n: number };
  const id = n > 0 ? null : insertCharacter(db, faelan, { extras: FAELAN_EXTRAS, seedKey: 'faelan' });
  seedLore(db);
  return id;
}

/** Gives the seeded Faelan his lore if he has none yet; never overwrites lore that exists. */
export function seedLore(db: Db): void {
  db.query('INSERT OR IGNORE INTO character_lore (character_id, data_json) SELECT id, ? FROM characters WHERE seed_key = ?').run(
    JSON.stringify(FAELAN_LORE),
    'faelan',
  );
}
