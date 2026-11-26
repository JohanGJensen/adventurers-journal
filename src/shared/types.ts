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

export type SpellSource = 'Class' | 'Magic Initiate' | 'Gnome' | 'Species' | 'Subclass' | 'Other';

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
  /** lowercase class id (e.g. "druid") for theming; null if the sheet can't be derived */
  classKey: string | null;
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

export const NOTE_KINDS = ['note', 'session', 'player', 'quest', 'npc', 'place', 'faction', 'item', 'lore'] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export const NOTE_KIND_LABELS: Record<NoteKind, string> = {
  note: 'Notes',
  session: 'Sessions',
  player: 'Players',
  quest: 'Quests',
  npc: 'NPCs',
  place: 'Places',
  faction: 'Factions',
  item: 'Items',
  lore: 'Lore',
};

/**
 * A kind-specific field. `options` makes it a pick list; `ref` means the value names another note of that kind.
 * `loose` refs link when a note matches and are plain text otherwise (not a "create this note" link).
 */
export interface NoteFieldDef {
  key: string;
  label: string;
  options?: readonly string[];
  ref?: NoteKind;
  loose?: boolean;
}

export const NOTE_FIELDS: Record<NoteKind, readonly NoteFieldDef[]> = {
  note: [],
  session: [
    { key: 'number', label: 'Session #' },
    { key: 'playedOn', label: 'Played on' },
    { key: 'gameDate', label: 'In-game date' },
  ],
  // The other people at the table and their characters (not NPCs).
  player: [
    { key: 'player', label: 'Player' },
    { key: 'race', label: 'Race' },
    { key: 'class', label: 'Class' },
    { key: 'level', label: 'Level' },
    { key: 'status', label: 'Status', options: ['active', 'absent', 'retired', 'dead'] },
    { key: 'bond', label: 'Relationship' },
  ],
  quest: [
    { key: 'status', label: 'Status', options: ['active', 'on hold', 'completed', 'failed'] },
    { key: 'giver', label: 'Given by', ref: 'npc' },
    { key: 'location', label: 'Location', ref: 'place' },
    { key: 'reward', label: 'Reward' },
  ],
  npc: [
    { key: 'role', label: 'Role' },
    { key: 'attitude', label: 'Attitude', options: ['friendly', 'neutral', 'hostile', 'unknown'] },
    { key: 'status', label: 'Status', options: ['alive', 'dead', 'missing', 'unknown'] },
    { key: 'location', label: 'Found at', ref: 'place' },
    { key: 'faction', label: 'Faction', ref: 'faction' },
  ],
  place: [
    { key: 'type', label: 'Type', options: ['city', 'town', 'village', 'dungeon', 'region', 'landmark', 'other'] },
    { key: 'within', label: 'Within', ref: 'place' },
  ],
  faction: [
    { key: 'goal', label: 'Goal' },
    { key: 'headquarters', label: 'Headquarters', ref: 'place' },
    { key: 'standing', label: 'Our standing', options: ['allied', 'friendly', 'neutral', 'wary', 'hostile'] },
  ],
  item: [
    { key: 'type', label: 'Type' },
    { key: 'rarity', label: 'Rarity', options: ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'] },
    { key: 'holder', label: 'Held by', ref: 'player', loose: true },
  ],
  lore: [{ key: 'topic', label: 'Topic / era' }],
};

export interface Note {
  id: number;
  /** Every note belongs to a campaign; the characters in it share its notes. */
  campaignId: number;
  kind: NoteKind;
  title: string;
  body: string;
  /** Other names the note answers to in links and auto-mentions. */
  aliases: string[];
  /** Lowercase free tags. */
  tags: string[];
  /** Kind-specific values, keyed by NOTE_FIELDS[kind][].key. */
  fields: Record<string, string>;
  /** An image data URL. Only on single-note responses (GET /notes/:id, POST, PATCH), never in lists. */
  image?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The light shape used to resolve links: no body. */
export type NoteRef = Omit<Note, 'body' | 'createdAt' | 'image'>;

/** The trait lists on a character's Lore page. */
export const TRAIT_KINDS = ['personality', 'ideals', 'bonds', 'flaws'] as const;
export type TraitKind = (typeof TRAIT_KINDS)[number];

export interface LoreSection {
  id: string;
  title: string;
  body: string;
}

/** A character's backstory and traits; stored as one document per character. */
export interface Lore {
  sections: LoreSection[];
  traits: Record<TraitKind, string[]>;
  updatedAt: string | null;
}

export const emptyLore = (): Lore => ({ sections: [], traits: { personality: [], ideals: [], bonds: [], flaws: [] }, updatedAt: null });

export const TERRAINS = ['plains', 'forest', 'hills', 'mountains', 'water', 'swamp', 'desert', 'road', 'settlement', 'ruin', 'cave'] as const;
export type Terrain = (typeof TERRAINS)[number];

/** One hex on a character's journey map (axial coordinates). Sketched until charted with a Cartographer's Tools check. */
export interface MapHex {
  q: number;
  r: number;
  terrain: Terrain;
  state: 'sketched' | 'charted';
  label: string;
  noteId: number | null;
}

export const PATH_KINDS = ['trail', 'road', 'river', 'border'] as const;
export type PathKind = (typeof PATH_KINDS)[number];

/** A freehand line on the map, in map units (the hex grid's pixel space at zoom 1). */
export interface MapPath {
  id: number;
  kind: PathKind;
  points: [number, number][];
}

export const MARK_KINDS = ['party', 'camp', 'battle', 'treasure', 'danger', 'quest', 'npc', 'text'] as const;
export type MarkKind = (typeof MARK_KINDS)[number];

/** A pin (or, for `text`, a free label) placed anywhere on the map. */
export interface MapMark {
  id: number;
  kind: MarkKind;
  x: number;
  y: number;
  label: string;
  noteId: number | null;
}

export interface JourneyMapDto {
  hexes: MapHex[];
  paths: MapPath[];
  marks: MapMark[];
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

/* Character creation (2024 SRD), normalised by server/creation.ts. */

export interface CreateText {
  index: string;
  name: string;
  description: string;
}

/** Pick `choose` of `from` (skill or tool names). */
export interface NameChoice {
  choose: number;
  desc: string;
  from: string[];
}

export interface EquipItem {
  name: string;
  qty: number;
  /** "of your choice" items (e.g. a musical instrument): the player fills in the specifics on the sheet */
  choice?: boolean;
}

/** One starting-equipment package, e.g. (A) gear + 15 GP or (B) 75 GP. */
export interface EquipOption {
  label: string;
  items: EquipItem[];
  gold: number;
}

export interface ClassSummary {
  index: string;
  name: string;
  hitDie: number;
  primary: string;
  saves: AbilityKey[];
  /** null for classes without Spellcasting */
  spellAbility: AbilityKey | null;
}

export interface CreateClass extends ClassSummary {
  skills: NameChoice;
  /** tool or instrument proficiencies to pick (Bard, Monk) */
  toolChoices: NameChoice[];
  /** armor and weapon training */
  proficiencies: string[];
  equipment: EquipOption[];
  /** level-1 class features with text */
  features: CreateText[];
  cantrips: number;
  prepared: number;
}

export interface CreateSpell {
  name: string;
  level: number;
}

export interface CreateTrait extends CreateText {
  /** the trait asks for skill proficiencies (Human Skillful, Elf Keen Senses) */
  skills?: NameChoice;
  /** spells the trait grants at level 1 */
  spells: CreateSpell[];
  /** replaces the species speed (Wood Elf) */
  speed?: number;
  /** the trait grants an origin feat of the player's choice (Human Versatile) */
  originFeat?: boolean;
}

export interface CreateLineage {
  index: string;
  name: string;
  /** short form for the species label, e.g. "Wood" for "Elven Lineage: Wood Elf" */
  label: string;
  /** level-1 traits */
  traits: CreateTrait[];
}

export interface SpeciesSummary {
  index: string;
  name: string;
  speed: number;
  sizes: string[];
  traitNames: string[];
}

export interface CreateSpecies extends SpeciesSummary {
  traits: CreateTrait[];
  /** e.g. "Elven Lineage"; empty when the species has no lineages */
  lineageLabel: string;
  lineages: CreateLineage[];
}

export interface BackgroundSummary {
  index: string;
  name: string;
  abilities: AbilityKey[];
  feat: Pick & { note?: string };
  skills: string[];
}

export interface CreateBackground extends BackgroundSummary {
  feat: CreateText & { note?: string };
  tools: string[];
  toolChoice: NameChoice | null;
  equipment: EquipOption[];
}

export interface CreateOptions {
  classes: ClassSummary[];
  species: SpeciesSummary[];
  backgrounds: BackgroundSummary[];
  originFeats: CreateText[];
  alignments: { name: string; description: string }[];
}
