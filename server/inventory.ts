import type { Db } from './sqlite';
import { newId, seedInventory } from '../src/shared/state';
import { COINS, type Coins, type EventIn, type Inventory, type Item } from '../src/shared/types';
import { deriveCharacter } from './characters';
import { logEvents } from './events';

interface ItemRow {
  id: string;
  name: string;
  qty: number;
  equipped: number;
}

const readItems = (db: Db, cid: number): Item[] =>
  (db.query('SELECT id, name, qty, equipped FROM items WHERE character_id = ? ORDER BY sort, rowid').all(cid) as ItemRow[]).map(
    (r) => ({ id: r.id, name: r.name, qty: r.qty, equipped: !!r.equipped }),
  );

export const hasInventory = (db: Db, cid: number) =>
  !!db.query('SELECT 1 FROM coins WHERE character_id = ?').get(cid) || !!db.query('SELECT 1 FROM items WHERE character_id = ? LIMIT 1').get(cid);

export function writeCoins(db: Db, cid: number, coins: Coins) {
  db.query(
    `INSERT INTO coins (character_id, cp, sp, ep, gp, pp) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (character_id) DO UPDATE SET cp = excluded.cp, sp = excluded.sp, ep = excluded.ep, gp = excluded.gp, pp = excluded.pp`,
  ).run(cid, ...COINS.map((k) => coins[k]));
}

/** Replaces the character's item list with `items` (in order). */
export function writeItems(db: Db, cid: number, items: Item[]) {
  const keep = new Set(items.map((x) => x.id));
  for (const { id } of db.query('SELECT id FROM items WHERE character_id = ?').all(cid) as { id: string }[])
    if (!keep.has(id)) db.query('DELETE FROM items WHERE id = ?').run(id);
  const up = db.query(
    `INSERT INTO items (id, character_id, name, qty, equipped, sort) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET name = excluded.name, qty = excluded.qty, equipped = excluded.equipped, sort = excluded.sort
     WHERE items.character_id = excluded.character_id`,
  );
  items.forEach((x, i) => up.run(x.id, cid, x.name, x.qty, x.equipped ? 1 : 0, i));
}

/** Coins + items; seeds from the sheet the first time. */
export function readInventory(db: Db, cid: number): Inventory {
  const coins = db.query('SELECT cp, sp, ep, gp, pp FROM coins WHERE character_id = ?').get(cid) as Coins | null;
  if (coins) return { coins, items: readItems(db, cid) };
  return db.transaction(() => {
    const seeded = seedInventory(deriveCharacter(db, cid), newId);
    writeCoins(db, cid, seeded.coins);
    if (!readItems(db, cid).length) writeItems(db, cid, seeded.items);
    return { coins: seeded.coins, items: readItems(db, cid) };
  })();
}

/** Applies a pure item-list change in a transaction and logs what changed. Returns the new inventory. */
export function changeItems(db: Db, cid: number, fn: (items: Item[]) => Item[], describe: (before: Item[], after: Item[]) => EventIn | null): Inventory {
  return db.transaction(() => {
    const inv = readInventory(db, cid);
    const after = fn(inv.items);
    writeItems(db, cid, after);
    const e = describe(inv.items, after);
    if (e) logEvents(db, cid, [e]);
    return { coins: inv.coins, items: readItems(db, cid) };
  })();
}

export function resetInventory(db: Db, cid: number): Inventory {
  return db.transaction(() => {
    const seeded = seedInventory(deriveCharacter(db, cid), newId);
    writeCoins(db, cid, seeded.coins);
    writeItems(db, cid, seeded.items);
    logEvents(db, cid, [{ type: 'item', summary: 'Reset inventory to the character sheet' }]);
    return readInventory(db, cid);
  })();
}
