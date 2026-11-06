import { useCallback, useEffect, useRef, useState } from 'react';
import type { Character } from '../lib/character';
import { api, type Result } from '../lib/client';
import { toast } from '../lib/toast';
import * as ops from '../shared/inventory';
import { clampCount, newId, seedInventory } from '../shared/state';
import type { Coin, Inventory, Item } from '../shared/types';

export { COINS } from '../shared/types';
export type { Coin, Inventory, Item } from '../shared/types';

const COIN_DELAY = 400;

/**
 * Coins and items, stored on the server. Kept apart from play state so rests and "Reset play state"
 * leave purchases alone. Each change applies at once (using the same pure functions the server
 * runs), then the server's answer replaces it; on failure the change is rolled back.
 */
export function useInventory(c: Character, characterId: number) {
  const [inv, setInv] = useState<Inventory>(() => seedInventory(c, newId));
  const [ready, setReady] = useState(false);
  const cur = useRef(inv);
  // Requests run one at a time, in order, so responses can't arrive out of order.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const inflight = useRef(0);

  const set = useCallback((next: Inventory) => {
    cur.current = next;
    setInv(next);
  }, []);

  useEffect(() => {
    let live = true;
    setReady(false);
    api<Inventory>('GET', `/characters/${characterId}/inventory`).then((r) => {
      if (!live) return;
      if (r.data) {
        set(r.data);
        setReady(true);
      } else if (r.status !== 0) toast(`Could not load inventory: ${r.error}`, 'error');
    });
    return () => {
      live = false;
    };
  }, [characterId, set]);

  const send = useCallback(
    (optimistic: Inventory, request: () => Promise<Result<Inventory>>, snapshot: Inventory = cur.current) => {
      set(optimistic);
      inflight.current++;
      queue.current = queue.current.then(async () => {
        const r = await request();
        inflight.current--;
        if (r.data) {
          // Only adopt the server copy once nothing newer is still waiting, to avoid flicker.
          if (inflight.current === 0) set(r.data);
        } else {
          set(snapshot);
          toast(r.status === 0 ? 'Server not reachable — change undone' : `Could not save: ${r.error}`, 'error');
        }
      });
    },
    [set],
  );

  const path = `/characters/${characterId}`;

  // Coin inputs change per keystroke, so their save is debounced.
  const coinTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const coinSnapshot = useRef<Inventory | null>(null);
  const setCoin = useCallback(
    (k: Coin, n: number) => {
      coinSnapshot.current ??= cur.current;
      const next = { ...cur.current, coins: { ...cur.current.coins, [k]: clampCount(n) } };
      set(next);
      clearTimeout(coinTimer.current);
      coinTimer.current = setTimeout(() => {
        const coins = cur.current.coins;
        const snapshot = coinSnapshot.current ?? cur.current;
        coinSnapshot.current = null;
        send(cur.current, () => api<Inventory>('PUT', `${path}/coins`, coins), snapshot);
      }, COIN_DELAY);
    },
    [path, send, set],
  );

  const withItems = (items: Item[]): Inventory => ({ ...cur.current, items });

  const addItem = (name: string, qty = 1) => {
    if (!name.trim()) return;
    const id = newId();
    send(withItems(ops.addItem(cur.current.items, name, qty, () => id)), () =>
      api<Inventory>('POST', `${path}/items`, { name, qty, id }),
    );
  };

  const updateItem = (id: string, patch: ops.ItemPatch) =>
    send(withItems(ops.updateItem(cur.current.items, id, patch)), () =>
      api<Inventory>('PATCH', `${path}/items/${encodeURIComponent(id)}`, patch),
    );

  const removeItem = (id: string) =>
    send(withItems(ops.removeItem(cur.current.items, id)), () =>
      api<Inventory>('DELETE', `${path}/items/${encodeURIComponent(id)}`),
    );

  /** Move one unit between active and inventory, merging into a same-named row on the other side. */
  const moveOne = (id: string) => {
    const created = newId();
    send(withItems(ops.moveOne(cur.current.items, id, () => created)), () =>
      api<Inventory>('POST', `${path}/items/${encodeURIComponent(id)}/move`, { newId: created }),
    );
  };

  const resetInventory = () => send(seedInventory(c, newId), () => api<Inventory>('POST', `${path}/inventory/reset`));

  return { inv, ready, setCoin, addItem, updateItem, removeItem, moveOne, resetInventory };
}

export type InventoryApi = ReturnType<typeof useInventory>;
