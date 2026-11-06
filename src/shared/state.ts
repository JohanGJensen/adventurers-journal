import { COINS, type Coins, type Inventory, type Item, type PlayState, type SpellEntry } from './types';

export const CONDITIONS = [
  'Blinded', 'Charmed', 'Deafened', 'Exhaustion', 'Frightened', 'Grappled', 'Incapacitated',
  'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious',
];

/** The parts of a derived Character that default state depends on. */
export interface StateBasis {
  hitPoints: number;
  slots: number[];
  spells: SpellEntry[];
  equipment: string[];
  gold: number;
}

export const clampCount = (n: number) => Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));

export const freshPlayState = (c: StateBasis): PlayState => ({
  hp: c.hitPoints,
  tempHp: 0,
  slotsUsed: c.slots.map(() => 0),
  goodberryUsed: false,
  hitDiceUsed: 0,
  concentration: null,
  conditions: [],
  deathSaves: { success: 0, fail: 0 },
  chosenCantrips: c.spells.filter((x) => x.source === 'Class' && x.level === 0).map((x) => x.name),
  prepared: c.spells.filter((x) => x.source === 'Class' && x.level > 0).map((x) => x.name),
});

/** Fills in fields older saves lack. */
export const normalizePlayState = (c: StateBasis, partial?: Partial<PlayState> | null): PlayState => ({
  ...freshPlayState(c),
  ...(partial && typeof partial === 'object' ? partial : {}),
});

export const seedInventory = (c: StateBasis, newId: () => string): Inventory => ({
  coins: { cp: 0, sp: 0, ep: 0, gp: c.gold, pp: 0 },
  items: c.equipment.map((name) => ({ id: newId(), name, qty: 1, equipped: false })),
});

export function normalizeInventory(c: StateBasis, partial: Partial<Inventory> | null | undefined, newId: () => string): Inventory {
  const base = seedInventory(c, newId);
  if (!partial || typeof partial !== 'object') return base;
  const coins = { ...base.coins } as Coins;
  for (const k of COINS) {
    const v = (partial.coins as Partial<Coins> | undefined)?.[k];
    if (typeof v === 'number') coins[k] = clampCount(v);
  }
  const items: Item[] = Array.isArray(partial.items)
    ? partial.items
        .filter((x) => x && typeof x.name === 'string')
        .map((x) => ({
          id: typeof x.id === 'string' && x.id ? x.id : newId(),
          name: x.name,
          qty: clampCount(Number(x.qty ?? 1)),
          equipped: !!x.equipped,
        }))
    : base.items;
  return { coins, items };
}

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
