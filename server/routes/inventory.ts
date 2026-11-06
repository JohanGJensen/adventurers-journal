import { addItem, moveOne, removeItem, updateItem } from '../../src/shared/inventory';
import { newId } from '../../src/shared/state';
import { COINS, type Item } from '../../src/shared/types';
import { getCharacter } from '../characters';
import { logEvents } from '../events';
import { body, HttpError, intParam, json, optionalBody, type Route } from '../http';
import { changeItems, readInventory, resetInventory, writeCoins } from '../inventory';
import { asCoins, asItemPatch, bad, isObj, optId } from '../validate';

const cidOf = (db: Parameters<typeof getCharacter>[0], raw: string) => getCharacter(db, intParam(raw, 'character id')).id;

const find = (items: Item[], id: string) => items.find((x) => x.id === id) ?? null;
const label = (x: Item) => (x.qty === 1 ? x.name : `${x.name} ×${x.qty}`);

/** A client-supplied id for the new row, so optimistic ids stay valid; falls back to a fresh UUID once used. */
const idSource = (preferred: string | undefined) => {
  let used = false;
  return () => {
    if (preferred && !used) {
      used = true;
      return preferred;
    }
    return newId();
  };
};

export const inventoryRoutes: Route[] = [
  ['GET', '/api/characters/:id/inventory', ({ db, params }) => json(readInventory(db, cidOf(db, params.id)))],
  [
    'POST',
    '/api/characters/:id/inventory/reset',
    ({ db, params }) => json(resetInventory(db, cidOf(db, params.id))),
  ],
  [
    'PUT',
    '/api/characters/:id/coins',
    async ({ db, params, req }) => {
      const cid = cidOf(db, params.id);
      const coins = asCoins(await body(req));
      return json(
        db.transaction(() => {
          const before = readInventory(db, cid).coins;
          const changed = COINS.filter((k) => before[k] !== coins[k]);
          writeCoins(db, cid, coins);
          if (changed.length)
            logEvents(db, cid, [
              { type: 'coins', summary: `Coins: ${changed.map((k) => `${k} ${before[k]} → ${coins[k]}`).join(', ')}`, data: { before, after: coins } },
            ]);
          return readInventory(db, cid);
        })(),
      );
    },
  ],
  [
    'POST',
    '/api/characters/:id/items',
    async ({ db, params, req }) => {
      const cid = cidOf(db, params.id);
      const b = await body(req);
      if (!isObj(b) || typeof b.name !== 'string' || !b.name.trim()) bad('Body must be { name, qty?, id? }');
      const { name, qty = 1, id } = b as { name: string; qty?: unknown; id?: unknown };
      if (!Number.isInteger(qty) || (qty as number) < 1) bad('qty must be a positive integer');
      const ids = idSource(optId(id));
      return json(
        changeItems(
          db,
          cid,
          (items) => addItem(items, name, qty as number, ids),
          () => ({ type: 'item', summary: `Added ${name.trim()}${qty !== 1 ? ` ×${qty}` : ''}` }),
        ),
      );
    },
  ],
  [
    'PATCH',
    '/api/characters/:id/items/:itemId',
    async ({ db, params, req }) => {
      const cid = cidOf(db, params.id);
      const patch = asItemPatch(await body(req));
      return json(
        changeItems(
          db,
          cid,
          (items) => {
            if (!find(items, params.itemId)) throw new HttpError(404, 'No such item');
            return updateItem(items, params.itemId, patch);
          },
          (before, after) => {
            const a = find(before, params.itemId)!;
            const b = find(after, params.itemId)!;
            const parts = [
              a.name !== b.name && `renamed to ${b.name}`,
              a.qty !== b.qty && `qty ${a.qty} → ${b.qty}`,
              a.equipped !== b.equipped && (b.equipped ? 'equipped' : 'unequipped'),
            ].filter(Boolean);
            return parts.length ? { type: 'item', summary: `${a.name}: ${parts.join(', ')}` } : null;
          },
        ),
      );
    },
  ],
  [
    'DELETE',
    '/api/characters/:id/items/:itemId',
    ({ db, params }) => {
      const cid = cidOf(db, params.id);
      let removed: Item | null = null;
      return json(
        changeItems(
          db,
          cid,
          (items) => {
            removed = find(items, params.itemId);
            if (!removed) throw new HttpError(404, 'No such item');
            return removeItem(items, params.itemId);
          },
          () => ({ type: 'item', summary: `Removed ${label(removed!)}` }),
        ),
      );
    },
  ],
  [
    'POST',
    '/api/characters/:id/items/:itemId/move',
    async ({ db, params, req }) => {
      const cid = cidOf(db, params.id);
      const b = await optionalBody(req);
      const ids = idSource(optId(isObj(b) ? b.newId : undefined));
      return json(
        changeItems(
          db,
          cid,
          (items) => {
            if (!find(items, params.itemId)) throw new HttpError(404, 'No such item');
            return moveOne(items, params.itemId, ids);
          },
          (before) => {
            const src = find(before, params.itemId)!;
            return { type: 'item', summary: `${src.equipped ? 'Put away' : 'Equipped'} ${src.name}` };
          },
        ),
      );
    },
  ],
];
