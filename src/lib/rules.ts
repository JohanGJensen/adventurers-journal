export const ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;
export type Ability = (typeof ABILITIES)[number];

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

export interface ClassRules {
  hitDie: number;
  saves: Ability[];
  spellAbility: Ability;
  /** index = character level; value = slots per spell level (index 0 = 1st level) */
  slots: number[][];
  /** index = character level; class cantrips known */
  cantripsKnown: number[];
  /** index = character level; spells prepared */
  preparedCount: number[];
}

export const CLASSES: Record<string, ClassRules> = {
  druid: {
    hitDie: 8,
    saves: ['INT', 'WIS'],
    spellAbility: 'WIS',
    slots: [[], [2], [3], [4, 2], [4, 3], [4, 3, 2]],
    cantripsKnown: [0, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    preparedCount: [0, 4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22],
  },
};

export const modifier = (score: number) => Math.floor((score - 10) / 2);
export const proficiencyBonus = (level: number) => 2 + Math.floor((level - 1) / 4);
export const fmt = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);
export const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/** Highest spell level a full caster can cast at a given character level. */
export const maxSpellLevel = (charLevel: number) => Math.min(9, Math.ceil(charLevel / 2));
/** Lowest character level at which a full caster gets spells of the given level. */
export const unlockLevel = (spellLevel: number) => Math.max(1, spellLevel * 2 - 1);

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
