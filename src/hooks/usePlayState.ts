import { useCallback, useEffect, useState } from 'react';
import type { Character } from '../lib/character';

const KEY = 'faelan-play-state';

export interface PlayState {
  hp: number;
  tempHp: number;
  /** slots used, index 0 = 1st level */
  slotsUsed: number[];
  goodberryUsed: boolean;
  hitDiceUsed: number;
  concentration: string | null;
  conditions: string[];
  deathSaves: { success: number; fail: number };
  /** class cantrips chosen (excludes always-known ones from race/feat) */
  chosenCantrips: string[];
  /** leveled class spells prepared (excludes always-prepared ones) */
  prepared: string[];
}

export const CONDITIONS = [
  'Blinded', 'Charmed', 'Deafened', 'Exhaustion', 'Frightened', 'Grappled', 'Incapacitated',
  'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious',
];

const fresh = (c: Character): PlayState => ({
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

function load(c: Character): PlayState {
  try {
    const v = localStorage.getItem(KEY);
    if (v) return { ...fresh(c), ...JSON.parse(v) };
  } catch {
    /* storage unavailable or corrupt */
  }
  return fresh(c);
}

export function usePlayState(c: Character) {
  const [state, setState] = useState<PlayState>(() => load(c));

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable */
    }
  }, [state]);

  const update = useCallback((fn: (s: PlayState) => Partial<PlayState>) => setState((s) => ({ ...s, ...fn(s) })), []);

  const damage = (n: number) =>
    update((s) => {
      const fromTemp = Math.min(s.tempHp, n);
      const hp = Math.max(0, s.hp - (n - fromTemp));
      return { tempHp: s.tempHp - fromTemp, hp, conditions: hp === 0 && !s.conditions.includes('Unconscious') ? [...s.conditions, 'Unconscious'] : s.conditions };
    });

  const heal = (n: number) =>
    update((s) => ({
      hp: Math.min(c.hitPoints, s.hp + n),
      deathSaves: { success: 0, fail: 0 },
      conditions: s.hp === 0 ? s.conditions.filter((x) => x !== 'Unconscious') : s.conditions,
    }));

  const setTemp = (n: number) => update(() => ({ tempHp: Math.max(0, n) }));

  const useSlot = (level: number) =>
    update((s) => {
      const used = [...s.slotsUsed];
      used[level - 1] = Math.min(c.slots[level - 1], (used[level - 1] ?? 0) + 1);
      return { slotsUsed: used };
    });

  const restoreSlot = (level: number) =>
    update((s) => {
      const used = [...s.slotsUsed];
      used[level - 1] = Math.max(0, (used[level - 1] ?? 0) - 1);
      return { slotsUsed: used };
    });

  const toggleCondition = (name: string) =>
    update((s) => ({
      conditions: s.conditions.includes(name) ? s.conditions.filter((x) => x !== name) : [...s.conditions, name],
    }));

  const longRest = () =>
    update((s) => ({
      ...fresh(c),
      conditions: s.conditions.filter((x) => x !== 'Unconscious'),
      chosenCantrips: s.chosenCantrips,
      prepared: s.prepared,
    }));

  const reset = () => setState(fresh(c));

  const toggleIn = (key: 'chosenCantrips' | 'prepared', name: string, cap: number) =>
    update((s) => {
      const list = s[key];
      if (list.includes(name)) return { [key]: list.filter((x) => x !== name) };
      if (list.length >= cap) return {};
      return { [key]: [...list, name] };
    });

  const toggleCantrip = (name: string) => toggleIn('chosenCantrips', name, c.cantripCap);
  const togglePrepared = (name: string) => toggleIn('prepared', name, c.preparedCap);

  return {
    state, update, damage, heal, setTemp, useSlot, restoreSlot, toggleCondition, longRest, reset,
    toggleCantrip, togglePrepared,
  };
}

export type PlayApi = ReturnType<typeof usePlayState>;
