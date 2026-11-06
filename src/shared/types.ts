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

export type SpellSource = 'Class' | 'Magic Initiate' | 'Gnome' | 'Other';

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
  'roll', 'damage', 'heal', 'temp_hp', 'slot', 'rest', 'condition', 'spells', 'item', 'coins', 'import',
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

export interface LocalExport {
  format: 'dnd-tool/local-export';
  version: 1;
  exportedAt: string;
  playState?: Partial<PlayState>;
  inventory?: Partial<Inventory>;
}

export const LOCAL_KEYS = { play: 'faelan-play-state', inventory: 'faelan-inventory' } as const;
