// Pure item-list operations. The client applies them optimistically and the server applies them
// authoritatively, so both sides follow the same merge rules.
import { clampCount } from './state';
import type { Item } from './types';

export function addItem(items: Item[], name: string, qty: number, newId: () => string): Item[] {
  const trimmed = name.trim();
  if (!trimmed) return items;
  const same = items.find((x) => !x.equipped && x.name.toLowerCase() === trimmed.toLowerCase());
  if (same) return items.map((x) => (x === same ? { ...x, qty: x.qty + qty } : x));
  return [...items, { id: newId(), name: trimmed, qty: Math.max(1, qty), equipped: false }];
}

export type ItemPatch = Partial<Omit<Item, 'id'>>;

export const updateItem = (items: Item[], id: string, patch: ItemPatch): Item[] =>
  items.map((x) =>
    x.id === id
      ? {
          ...x,
          ...patch,
          name: patch.name !== undefined ? patch.name.trim() || x.name : x.name,
          qty: patch.qty !== undefined ? clampCount(patch.qty) : x.qty,
        }
      : x,
  );

export const removeItem = (items: Item[], id: string): Item[] => items.filter((x) => x.id !== id);

/** Move one unit between active and inventory, merging into a same-named row on the other side. */
export function moveOne(items: Item[], id: string, newId: () => string): Item[] {
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
    .map((x) => (x === dest ? { ...x, qty: x.qty + Math.min(1, src.qty) } : x === src ? { ...x, qty: x.qty - 1 } : x));
}
