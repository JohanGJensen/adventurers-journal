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
  wildShapeUsed: 0,
  variant: null,
  resourcesUsed: {},
});

/** Sizes `slotsUsed` to the current slot table (it changes when the level does), clamping each entry. */
export const fitSlots = (used: number[], slots: number[]) => slots.map((max, i) => Math.min(max, used[i] ?? 0));

/** Fills in fields older saves lack and fits level-dependent fields to the current level. */
export function normalizePlayState(c: StateBasis, partial?: Partial<PlayState> | null): PlayState {
  const p = (partial && typeof partial === 'object' ? partial : {}) as Partial<PlayState> & { landType?: string | null };
  const { landType, ...rest } = p;
  const s: PlayState = { ...freshPlayState(c), ...rest };
  if (s.variant == null && typeof landType === 'string') s.variant = landType; // saves from before variants
  return { ...s, slotsUsed: fitSlots(s.slotsUsed, c.slots) };
}

/** The starting inventory: the sheet's gold, and its equipment with repeated names merged into one stack. */
export function seedInventory(c: StateBasis, newId: () => string): Inventory {
  const items: Item[] = [];
  for (const name of c.equipment) {
    const same = items.find((x) => x.name === name);
    if (same) same.qty++;
    else items.push({ id: newId(), name, qty: 1, equipped: false });
  }
  return { coins: { cp: 0, sp: 0, ep: 0, gp: c.gold, pp: 0 }, items };
}

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
