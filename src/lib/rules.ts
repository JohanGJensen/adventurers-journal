import { ABILITY_KEYS, type AbilityKey } from '../shared/types';

export const ABILITIES = ABILITY_KEYS;
export type Ability = AbilityKey;

export const ABILITY_NAMES: Record<Ability, string> = {
  STR: 'Strength',
  DEX: 'Dexterity',
  CON: 'Constitution',
  INT: 'Intelligence',
  WIS: 'Wisdom',
  CHA: 'Charisma',
};

export const SKILLS: Record<string, Ability> = {
  Acrobatics: 'DEX',
  'Animal Handling': 'WIS',
  Arcana: 'INT',
  Athletics: 'STR',
  Deception: 'CHA',
  History: 'INT',
  Insight: 'WIS',
  Intimidation: 'CHA',
  Investigation: 'INT',
  Medicine: 'WIS',
  Nature: 'INT',
  Perception: 'WIS',
  Performance: 'CHA',
  Persuasion: 'CHA',
  Religion: 'INT',
  'Sleight of Hand': 'DEX',
  Stealth: 'DEX',
  Survival: 'WIS',
};

export type CasterKind = 'full' | 'half' | 'pact' | 'none';

export interface ClassRules {
  hitDie: number;
  saves: Ability[];
  /** null for classes without Spellcasting (Barbarian, Fighter, Monk, Rogue) */
  spellAbility: Ability | null;
  caster: CasterKind;
  /**
   * index = character level; value = slots per spell level (index 0 = 1st level).
   * Pact Magic slots sit at their slot level, e.g. a level 3 warlock has [0, 2].
   */
  slots: number[][];
  /** index = character level; class cantrips known */
  cantripsKnown: number[];
  /** index = character level; spells prepared */
  preparedCount: number[];
  /** index = character level; Wild Shape uses (0 = no Wild Shape) */
  wildShapeUses: number[];
  /** character levels at which the subclass grants features */
  subclassLevels: number[];
}

export const MAX_LEVEL = 20;

/** Per-level table helper: values for levels 1–20, with index 0 (level 0) filled in as 0. */
const byLevel = (...xs: number[]) => [0, ...xs];
const NONE = byLevel(...Array<number>(20).fill(0));
const NO_SLOTS: number[][] = Array.from({ length: 21 }, () => []);

/** Full-caster spell slots, index = character level (PHB 2024; checked by scripts/check-levels.ts). */
const FULL_CASTER_SLOTS: number[][] = [
  [],
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

/** Half-caster (Paladin, Ranger) spell slots, index = character level (PHB 2024). */
const HALF_CASTER_SLOTS: number[][] = [
  [],
  [2],
  [2],
  [3],
  [3],
  [4, 2],
  [4, 2],
  [4, 3],
  [4, 3],
  [4, 3, 2],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2],
];

/** Warlock Pact Magic: [slot count, slot level] per character level (PHB 2024). */
const PACT: [number, number][] = [
  [0, 0],
  [1, 1], [2, 1], [2, 2], [2, 2], [2, 3], [2, 3], [2, 4], [2, 4], [2, 5], [2, 5],
  [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [4, 5], [4, 5], [4, 5], [4, 5],
];
const PACT_SLOTS: number[][] = PACT.map(([n, lvl]) => (n ? [...Array<number>(lvl - 1).fill(0), n] : []));

const FULL_PREPARED = byLevel(4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22);
const HALF_PREPARED = byLevel(2, 3, 4, 5, 6, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14, 15, 15);
/** 2 cantrips, 3 at level 4, 4 at level 10 (Bard, Druid, Warlock). */
const CANTRIPS_2 = byLevel(2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4);
/** 3 cantrips, 4 at level 4, 5 at level 10 (Cleric, Wizard). */
const CANTRIPS_3 = byLevel(3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5);

const martial = (hitDie: number, saves: Ability[], subclassLevels: number[]): ClassRules => ({
  hitDie,
  saves,
  spellAbility: null,
  caster: 'none',
  slots: NO_SLOTS,
  cantripsKnown: NONE,
  preparedCount: NONE,
  wildShapeUses: NONE,
  subclassLevels,
});

/** The twelve 2024 classes, keyed by dnd5eapi.co class index. */
export const CLASSES: Record<string, ClassRules> = {
  barbarian: martial(12, ['STR', 'CON'], [3, 6, 10, 14]),
  bard: {
    hitDie: 8,
    saves: ['DEX', 'CHA'],
    spellAbility: 'CHA',
    caster: 'full',
    slots: FULL_CASTER_SLOTS,
    cantripsKnown: CANTRIPS_2,
    preparedCount: FULL_PREPARED,
    wildShapeUses: NONE,
    subclassLevels: [3, 6, 14],
  },
  cleric: {
    hitDie: 8,
    saves: ['WIS', 'CHA'],
    spellAbility: 'WIS',
    caster: 'full',
    slots: FULL_CASTER_SLOTS,
    cantripsKnown: CANTRIPS_3,
    preparedCount: FULL_PREPARED,
    wildShapeUses: NONE,
    subclassLevels: [3, 6, 17],
  },
  druid: {
    hitDie: 8,
    saves: ['INT', 'WIS'],
    spellAbility: 'WIS',
    caster: 'full',
    slots: FULL_CASTER_SLOTS,
    cantripsKnown: CANTRIPS_2,
    preparedCount: FULL_PREPARED,
    subclassLevels: [3, 6, 10, 14],
    wildShapeUses: [0, 0, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4],
  },
  fighter: martial(10, ['STR', 'CON'], [3, 7, 10, 15, 18]),
  monk: martial(8, ['STR', 'DEX'], [3, 6, 11, 17]),
  paladin: {
    hitDie: 10,
    saves: ['WIS', 'CHA'],
    spellAbility: 'CHA',
    caster: 'half',
    slots: HALF_CASTER_SLOTS,
    cantripsKnown: NONE,
    preparedCount: HALF_PREPARED,
    wildShapeUses: NONE,
    subclassLevels: [3, 7, 15, 20],
  },
  ranger: {
    hitDie: 10,
    saves: ['STR', 'DEX'],
    spellAbility: 'WIS',
    caster: 'half',
    slots: HALF_CASTER_SLOTS,
    cantripsKnown: NONE,
    preparedCount: HALF_PREPARED,
    wildShapeUses: NONE,
    subclassLevels: [3, 7, 11, 15],
  },
  rogue: martial(8, ['DEX', 'INT'], [3, 9, 13, 17]),
  sorcerer: {
    hitDie: 6,
    saves: ['CON', 'CHA'],
    spellAbility: 'CHA',
    caster: 'full',
    slots: FULL_CASTER_SLOTS,
    cantripsKnown: byLevel(4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6),
    preparedCount: byLevel(2, 4, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22),
    wildShapeUses: NONE,
    subclassLevels: [3, 6, 14, 18],
  },
  warlock: {
    hitDie: 8,
    saves: ['WIS', 'CHA'],
    spellAbility: 'CHA',
    caster: 'pact',
    slots: PACT_SLOTS,
    cantripsKnown: CANTRIPS_2,
    preparedCount: byLevel(2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15),
    wildShapeUses: NONE,
    subclassLevels: [3, 6, 10, 14],
  },
  wizard: {
    hitDie: 6,
    saves: ['INT', 'WIS'],
    spellAbility: 'INT',
    caster: 'full',
    slots: FULL_CASTER_SLOTS,
    cantripsKnown: CANTRIPS_3,
    preparedCount: FULL_PREPARED,
    wildShapeUses: NONE,
    subclassLevels: [3, 6, 10, 14],
  },
};

export const modifier = (score: number) => Math.floor((score - 10) / 2);
export const proficiencyBonus = (level: number) => 2 + Math.floor((level - 1) / 4);
export const fmt = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);
export const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
/** HP gained per level with the fixed option (5 for a d8). */
export const fixedHitDie = (hitDie: number) => hitDie / 2 + 1;

/** Highest spell level the class can cast at a character level: the top of its slot table (0 = none). */
export const maxSpellLevel = (rules: ClassRules, charLevel: number) => rules.slots[charLevel]?.length ?? 0;
/** Lowest character level at which the class gets spells of the given level, or null if it never does. */
export function unlockLevel(rules: ClassRules, spellLevel: number): number | null {
  for (let l = 1; l <= MAX_LEVEL; l++) if (maxSpellLevel(rules, l) >= spellLevel) return l;
  return null;
}

/* Armor (SRD). Keys are item names lowercased, non-alphanumerics → "-", trailing "-armor" dropped. */
type ArmorKind = 'light' | 'medium' | 'heavy';
const ARMOR: Record<string, { base: number; kind: ArmorKind }> = {
  padded: { base: 11, kind: 'light' },
  leather: { base: 11, kind: 'light' },
  'studded-leather': { base: 12, kind: 'light' },
  hide: { base: 12, kind: 'medium' },
  'chain-shirt': { base: 13, kind: 'medium' },
  'scale-mail': { base: 14, kind: 'medium' },
  breastplate: { base: 14, kind: 'medium' },
  'half-plate': { base: 15, kind: 'medium' },
  'ring-mail': { base: 14, kind: 'heavy' },
  'chain-mail': { base: 16, kind: 'heavy' },
  splint: { base: 17, kind: 'heavy' },
  plate: { base: 18, kind: 'heavy' },
};

const armorKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .replace(/-armor$/, '');

export const isShield = (name: string) => armorKey(name) === 'shield';

/**
 * AC from equipped items: the best equipped body armor (or the unarmored AC) plus 2 for a shield.
 * `unarmored` is the sheet's AC without armor.
 */
export function armorClassFrom(
  items: { name: string; equipped: boolean }[],
  dexMod: number,
  unarmored: number,
): { value: number; source: string } {
  let best: { value: number; source: string } = { value: unarmored, source: 'no armor' };
  let hasArmor = false;
  for (const item of items) {
    if (!item.equipped) continue;
    const a = ARMOR[armorKey(item.name)];
    if (!a) continue;
    const dex = a.kind === 'light' ? dexMod : a.kind === 'medium' ? Math.min(2, dexMod) : 0;
    const value = a.base + dex;
    const source = a.kind === 'heavy' ? item.name : `${item.name} + DEX${a.kind === 'medium' ? ' (max 2)' : ''}`;
    if (!hasArmor || value > best.value) best = { value, source };
    hasArmor = true;
  }
  const shield = items.some((x) => x.equipped && isShield(x.name));
  return shield ? { value: best.value + 2, source: `${best.source} + Shield` } : best;
}
