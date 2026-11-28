import { knownSpells, type Character } from '../lib/character';
import type { SpellEntry } from '../data/supplement';
import { cachedSpellLevel } from '../lib/api';
import type { SpellInfo } from '../shared/types';
import type { PlayApi } from './usePlayState';
import { useSpellInfo } from './useSpellInfo';

/** Used until the spell's SRD details have loaded. */
const CONCENTRATION_FALLBACK = new Set(['Entangle', 'Guidance', 'Resistance']);

/**
 * The character's spells for today and how casting spends slots, shared by the list and the deck so both cast the
 * same way: a levelled spell uses a slot (the lowest that's free, or one chosen to upcast), Magic Initiate spells
 * can go once per long rest without one, and a concentration spell takes over concentration.
 */
export function useSpellbook(c: Character, play: PlayApi) {
  const { state } = play;
  // Names don't depend on levels, so load details first and take levels from them.
  const info = useSpellInfo(knownSpells(c, state).map((s) => s.name));
  const spells = knownSpells(c, state, (n) => info.get(n)?.level ?? cachedSpellLevel(c.classKey, n));
  const details = (name: string): SpellInfo | undefined => info.get(name) ?? undefined;
  const isConc = (name: string) => details(name)?.concentration ?? CONCENTRATION_FALLBACK.has(name);

  const slotsLeft = (lvl: number) => (c.slots[lvl - 1] ?? 0) - (state.slotsUsed[lvl - 1] ?? 0);
  /** Slot levels a spell can be cast with right now, lowest first (Pact Magic slots are all one level). */
  const slotsFor = (spellLevel: number) => {
    const out: number[] = [];
    for (let l = Math.max(1, spellLevel); l <= c.slots.length; l++) if (slotsLeft(l) > 0) out.push(l);
    return out;
  };
  const slotFor = (spellLevel: number) => slotsFor(spellLevel)[0] ?? null;
  /** Whether it can be cast at all right now. */
  const castable = (s: SpellEntry) =>
    s.level === 0 || slotFor(s.level) !== null || (s.source === 'Magic Initiate' && !state.goodberryUsed);

  /** Casts `s`: at `slotLevel` (defaults to the lowest free), or free via Magic Initiate. Returns the slot used, 0 for a cantrip or free cast, null if it couldn't. */
  const cast = (s: SpellEntry, opts: { slotLevel?: number; free?: boolean } = {}): number | null => {
    let used = 0;
    if (s.level > 0) {
      if (opts.free) {
        if (state.goodberryUsed) return null;
        play.update(() => ({ goodberryUsed: true }), { type: 'slot', summary: `Cast ${s.name} without a slot (Magic Initiate)` });
      } else {
        const slot = opts.slotLevel ?? slotFor(s.level);
        if (slot === null || slotsLeft(slot) <= 0) return null;
        play.useSlot(slot);
        used = slot;
      }
    }
    if (isConc(s.name)) play.update(() => ({ concentration: s.name }), { type: 'spells', summary: `Concentrating on ${s.name}` });
    return used;
  };

  return {
    spells,
    cantrips: spells.filter((s) => s.level === 0),
    levels: [...new Set(spells.filter((s) => s.level > 0).map((s) => s.level))].sort((a, b) => a - b),
    details,
    isConc,
    slotsLeft,
    slotsFor,
    slotFor,
    castable,
    cast,
    caster: c.spellAbility !== null,
  };
}

export type Spellbook = ReturnType<typeof useSpellbook>;
