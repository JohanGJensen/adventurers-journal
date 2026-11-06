import { useCallback, useEffect, useState } from 'react';
import type { Character } from '../lib/character';

const KEY = 'faelan-inventory';

export const COINS = ['cp', 'sp', 'ep', 'gp', 'pp'] as const;
export type Coin = (typeof COINS)[number];

export interface Item {
  id: string;
  name: string;
  qty: number;
  equipped: boolean;
}

export interface Inventory {
  coins: Record<Coin, number>;
  items: Item[];
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const clampCount = (n: number) => Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));

const seed = (c: Character): Inventory => ({
  coins: { cp: 0, sp: 0, ep: 0, gp: c.gold, pp: 0 },
  items: c.equipment.map((name) => ({ id: newId(), name, qty: 1, equipped: false })),
});

function load(c: Character): Inventory {
  try {
    const v = localStorage.getItem(KEY);
    if (v) {
      const parsed = JSON.parse(v) as Partial<Inventory>;
      const base = seed(c);
      return {
        coins: { ...base.coins, ...parsed.coins },
        items: Array.isArray(parsed.items) ? parsed.items : base.items,
      };
    }
  } catch {
    /* storage unavailable or corrupt */
  }
  return seed(c);
}

/** Coins and items. Kept apart from play state so rests and "Reset play state" leave purchases alone. */
export function useInventory(c: Character) {
  const [inv, setInv] = useState<Inventory>(() => load(c));

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(inv));
    } catch {
      /* storage unavailable */
    }
  }, [inv]);

  const setCoin = useCallback(
    (k: Coin, n: number) => setInv((s) => ({ ...s, coins: { ...s.coins, [k]: clampCount(n) } })),
    [],
  );

  const mapItems = (fn: (items: Item[]) => Item[]) => setInv((s) => ({ ...s, items: fn(s.items) }));

  const addItem = (name: string, qty = 1) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    mapItems((items) => {
      const same = items.find((x) => !x.equipped && x.name.toLowerCase() === trimmed.toLowerCase());
      if (same) return items.map((x) => (x === same ? { ...x, qty: x.qty + qty } : x));
      return [...items, { id: newId(), name: trimmed, qty: Math.max(1, qty), equipped: false }];
    });
  };

  const updateItem = (id: string, patch: Partial<Omit<Item, 'id'>>) =>
    mapItems((items) =>
      items.map((x) =>
        x.id === id
          ? {
              ...x,
              ...patch,
              name: patch.name !== undefined ? patch.name.trim() || x.name : x.name,
              qty: patch.qty !== undefined ? clampCount(patch.qty) : x.qty,
            }
          : x,
      ),
    );

  const removeItem = (id: string) => mapItems((items) => items.filter((x) => x.id !== id));
  /** Move one unit between active and inventory, merging into a same-named row on the other side. */
  const moveOne = (id: string) =>
    mapItems((items) => {
      const src = items.find((x) => x.id === id);
      if (!src) return items;
      const to = !src.equipped;
      const key = src.name.toLowerCase();
      const dest = items.find((x) => x.equipped === to && x.name.toLowerCase() === key);
      const last = src.qty <= 1;
      if (!dest) {
        if (last) return items.map((x) => (x === src ? { ...x, equipped: to } : x));
        return [
          ...items.map((x) => (x === src ? { ...x, qty: x.qty - 1 } : x)),
          { id: newId(), name: src.name, qty: 1, equipped: to },
        ];
      }
      return items
        .filter((x) => !(x === src && last))
        .map((x) =>
          x === dest ? { ...x, qty: x.qty + Math.min(1, src.qty) } : x === src ? { ...x, qty: x.qty - 1 } : x,
        );
    });
  const resetInventory = () => setInv(seed(c));

  return { inv, setCoin, addItem, updateItem, removeItem, moveOne, resetInventory };
}

export type InventoryApi = ReturnType<typeof useInventory>;
