// Types shared by the React client and the Bun server.

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
  /** Wild Shape uses spent since the last rest */
  wildShapeUsed: number;
  /** the subclass variant in effect, e.g. Circle of the Land's land type (changes on long rest) */
  variant: string | null;
  /** uses spent of the character's limited resources, by resource key */
  resourcesUsed: Record<string, number>;
}

export const COINS = ['cp', 'sp', 'ep', 'gp', 'pp'] as const;
export type Coin = (typeof COINS)[number];
export type Coins = Record<Coin, number>;

export interface Item {
  id: string;
  name: string;
  qty: number;
  equipped: boolean;
}

export interface Inventory {
  coins: Coins;
  items: Item[];
}

export type SpellSource = 'Class' | 'Magic Initiate' | 'Gnome' | 'Subclass' | 'Other';

export interface SpellEntry {
  name: string;
  level: number;
  source: SpellSource;
  note?: string;
}

/** Per-character data the sheet export doesn't contain. */
export interface CharacterExtras {
  portrait?: string;
  /** always-known spells from race, feats etc. */
  bonusSpells?: SpellEntry[];
  /** extra class cantrips (e.g. Druid Primal Order: Magician) */
  bonusCantrips?: number;
  /** class-list spells missing from the SRD list */
  extraClassSpells?: { name: string; level: number }[];
}

export interface SpellInfo {
  level: number;
  school: string;
  concentration: boolean;
  ritual: boolean;
  castingTime: string;
  range: string;
}

/** Stats of a weapon or armor, for the equipment list. Absent for gear without any. */
export interface EquipmentInfo {
  /** e.g. "1d6 bludgeoning" */
  damage?: string;
  /** two-handed damage die, e.g. "1d8" */
  versatile?: string;
  /** e.g. "AC 11 + DEX", "+2 AC" */
  ac?: string;
  properties: string[];
}

export type Kind = 'spells' | 'equipment';

export interface Detail {
  name: string;
  /** structured spell fields, for filtering; spells only */
  spell?: SpellInfo;
  /** weapon/armor stats; equipment only */
  equipment?: EquipmentInfo;
  meta: [string, string][];
  paragraphs: string[];
  source: '2024 SRD' | '2014 SRD' | 'Local';
}

export interface ClassSpell {
  index: string;
  name: string;
  level: number;
}

export const EVENT_TYPES = [
  'roll', 'damage', 'heal', 'temp_hp', 'slot', 'rest', 'condition', 'spells', 'item', 'coins', 'import', 'level',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface EventIn {
  type: EventType;
  summary: string;
  data?: unknown;
}

export interface EventRow extends EventIn {
  id: number;
  at: string;
}

export interface CharacterSummary {
  id: number;
  name: string;
  campaignId: number | null;
  seedKey: string | null;
  portrait: string | null;
  subtitle: string;
}

export interface CharacterDto {
  id: number;
  name: string;
  campaignId: number | null;
  seedKey: string | null;
  sheet: unknown;
  extras: CharacterExtras;
  /** level-ups past the export's level, in order */
  levels: LevelChoice[];
  /** the homebrew subclass the character has taken (live: always the current version), if any */
  homebrew: HomebrewSubclass | null;
}

export interface Campaign {
  id: number;
  name: string;
  createdAt: string;
}

export const NOTE_KINDS = ['note', 'session', 'npc', 'quest', 'place'] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export interface Note {
  id: number;
  campaignId: number | null;
  characterId: number | null;
  kind: NoteKind;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export const ABILITY_KEYS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;
export type AbilityKey = (typeof ABILITY_KEYS)[number];
export type AbilityBonus = Partial<Record<AbilityKey, number>>;

/** A pick from the SRD (`index`) or typed in by the player (`custom`). */
export interface Pick {
  index: string;
  name: string;
  custom?: boolean;
  /** a homebrew subclass: index is `homebrew-<id>` */
  homebrew?: boolean;
  /** player notes for custom picks */
  notes?: string;
}

export interface FeatureText {
  name: string;
  source: string;
  description: string;
}

/** One locked-in level-up. Everything the sheet needs is stored here, so it derives offline. */
export interface LevelChoice {
  /** the level reached (2..20) */
  level: number;
  /** die result; the fixed option stores hitDie / 2 + 1 */
  hp: { method: 'fixed' | 'roll'; die: number };
  subclass?: Pick & { description?: string };
  asi?: { kind: 'scores'; plus: AbilityBonus } | ({ kind: 'feat'; plus?: AbilityBonus; description?: string } & Pick);
  option?: { feature: string; choice: string; description?: string };
  boon?: Pick & { plus?: AbilityBonus; description?: string };
  /** class and subclass features gained at this level, as shown at lock-in */
  features: FeatureText[];
}

/** What the level-up wizard needs from the SRD for one level. */
export interface LevelUpInfo {
  level: number;
  features: (FeatureText & { index: string })[];
  /** subclasses to pick from (only at the subclass level) */
  subclasses?: (Pick & { description: string })[];
  /** feats the character qualifies for (ASI levels) */
  feats?: (Pick & { description: string })[];
  /** epic boons (level 19) */
  boons?: (Pick & { description: string })[];
}

/* ---- Homebrew subclasses ---- */

export interface HomebrewBuffs {
  ac?: number;
  speed?: number;
  initiative?: number;
  /** extra max HP per character level */
  hpPerLevel?: number;
  abilities?: AbilityBonus;
  /** extra class cantrips known */
  cantrips?: number;
  skills?: string[];
  saves?: AbilityKey[];
  /** armor, weapons, tools: shown as text */
  proficiencies?: string[];
}

export interface HomebrewResource {
  name: string;
  /** a fixed number, the proficiency bonus, or an ability modifier (min 1) */
  uses: number | 'prof' | AbilityKey;
  recharge: 'short' | 'long';
}

export interface HomebrewSpell {
  name: string;
  level: number;
}

/** What the subclass grants at one of the class's subclass levels. */
export interface HomebrewLevel {
  level: number;
  features: { name: string; description: string }[];
  /** always prepared from this level on */
  spells: HomebrewSpell[];
  buffs: HomebrewBuffs;
  resources: HomebrewResource[];
}

export interface HomebrewVariant {
  name: string;
  description: string;
  /** always prepared while this variant is active, from character level `atLevel` */
  spells: (HomebrewSpell & { atLevel: number })[];
}

export interface HomebrewSubclass {
  id: number;
  classKey: string;
  name: string;
  description: string;
  levels: HomebrewLevel[];
  /** a choice like Circle of the Land's land type: picked at level-up, changeable on each long rest */
  variants: { label: string; options: HomebrewVariant[] } | null;
  usedBy?: string[];
}

export const homebrewIndex = (id: number) => `homebrew-${id}`;
export const homebrewId = (index: string | undefined): number | null => {
  const m = /^homebrew-(\d+)$/.exec(index ?? '');
  return m ? Number(m[1]) : null;
};
