// Hand-written guards for request bodies.
import { COINS, EVENT_TYPES, type Coins, type EventIn, type PlayState } from '../src/shared/types';
import type { ItemPatch } from '../src/shared/inventory';
import { HttpError } from './http';

type Obj = Record<string, unknown>;
export const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min = 0): v is number => Number.isInteger(v) && (v as number) >= min;
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

export const bad = (msg: string): never => {
  throw new HttpError(400, msg);
};

export function asPlayState(v: unknown): PlayState {
  if (!isObj(v)) return bad('state must be an object');
  const ok =
    isInt(v.hp) &&
    isInt(v.tempHp) &&
    Array.isArray(v.slotsUsed) &&
    v.slotsUsed.every((x) => isInt(x)) &&
    typeof v.goodberryUsed === 'boolean' &&
    isInt(v.hitDiceUsed) &&
    (v.concentration === null || typeof v.concentration === 'string') &&
    isStrArr(v.conditions) &&
    isObj(v.deathSaves) &&
    isInt(v.deathSaves.success) &&
    isInt(v.deathSaves.fail) &&
    isStrArr(v.chosenCantrips) &&
    isStrArr(v.prepared);
  if (!ok) bad('state is not a valid PlayState');
  return v as unknown as PlayState;
}

export function asEvents(v: unknown): EventIn[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > 200) return bad('events must be an array (max 200)');
  return v.map((e) => {
    if (!isObj(e) || !EVENT_TYPES.includes(e.type as never) || typeof e.summary !== 'string' || e.summary.length > 500)
      bad('invalid event');
    return { type: (e as Obj).type, summary: (e as Obj).summary, data: (e as Obj).data } as EventIn;
  });
}

export function asCoins(v: unknown): Coins {
  if (!isObj(v) || !COINS.every((k) => isInt(v[k]))) return bad('coins must have non-negative integer cp, sp, ep, gp, pp');
  return Object.fromEntries(COINS.map((k) => [k, v[k]])) as Coins;
}

export function asItemPatch(v: unknown): ItemPatch {
  if (!isObj(v)) return bad('patch must be an object');
  const out: ItemPatch = {};
  if (v.name !== undefined) out.name = typeof v.name === 'string' ? v.name : bad('name must be a string');
  if (v.qty !== undefined) out.qty = typeof v.qty === 'number' ? v.qty : bad('qty must be a number');
  if (v.equipped !== undefined) out.equipped = typeof v.equipped === 'boolean' ? v.equipped : bad('equipped must be a boolean');
  return out;
}

export const optId = (v: unknown): string | undefined =>
  v === undefined ? undefined : typeof v === 'string' && /^[\w-]{1,64}$/.test(v) ? v : bad('invalid id');
