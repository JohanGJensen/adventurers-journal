// Character creation: the wizard's draft, and turning it into a sheet in the same `userChoices` format as an
// imported export, so buildCharacter and the rest of the app treat created and imported characters alike.
import {
  ABILITY_KEYS,
  type AbilityKey,
  type CharacterExtras,
  type CreateBackground,
  type CreateClass,
  type CreateSpecies,
  type CreateText,
  type CreateTrait,
  type EquipOption,
  type NameChoice,
  type SpellEntry,
} from '../shared/types';
import { CLASSES, modifier, SKILLS } from './rules';

export type ScoreMethod = 'array' | 'pointbuy';
export type BonusMode = '2-1' | '1-1-1';
export type MagicInitiateList = 'cleric' | 'druid' | 'wizard';
/** Where an origin feat came from: the background, or the Human's Versatile trait. */
export type FeatSource = 'background' | 'species';

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;
export const POINT_BUY_BUDGET = 27;
const POINT_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const pointCost = (score: number) => POINT_COST[score] ?? Infinity;
export const MAGIC_INITIATE_LISTS: MagicInitiateList[] = ['cleric', 'druid', 'wizard'];
export const CUSTOM_BACKGROUND = 'custom';

export interface MagicInitiatePick {
  list: MagicInitiateList | '';
  cantrips: string[];
  spell: string;
}

export interface CustomBackground {
  name: string;
  abilities: AbilityKey[];
  skills: string[];
  tool: string;
  feat: string;
}

export interface CreateDraft {
  classIndex: string;
  speciesIndex: string;
  /** subspecies index (Elven Lineage, Draconic Ancestor …) */
  lineage: string;
  size: string;
  /** skill picks asked for by species traits, by trait index */
  speciesSkills: Record<string, string[]>;
  /** origin feat from the Human's Versatile trait */
  speciesFeat: string;
  backgroundIndex: string;
  custom: CustomBackground;
  method: ScoreMethod;
  /** standard array: the value put in each ability */
  array: Partial<Record<AbilityKey, number>>;
  pointBuy: Record<AbilityKey, number>;
  bonusMode: BonusMode;
  plus2: AbilityKey | '';
  plus1: AbilityKey | '';
  classSkills: string[];
  /** picks for the Skilled origin feat */
  featSkills: string[];
  /** picks for each of the class's tool choices, in order */
  classTools: string[][];
  bgTool: string;
  classEquip: string;
  bgEquip: string;
  cantrips: string[];
  prepared: string[];
  magicInitiate: Partial<Record<FeatSource, MagicInitiatePick>>;
  name: string;
  alignment: string;
  portrait: string;
}

const eights = () => Object.fromEntries(ABILITY_KEYS.map((k) => [k, 8])) as Record<AbilityKey, number>;

export const emptyDraft = (): CreateDraft => ({
  classIndex: '',
  speciesIndex: '',
  lineage: '',
  size: '',
  speciesSkills: {},
  speciesFeat: '',
  backgroundIndex: '',
  custom: { name: '', abilities: [], skills: [], tool: '', feat: '' },
  method: 'array',
  array: {},
  pointBuy: eights(),
  bonusMode: '2-1',
  plus2: '',
  plus1: '',
  classSkills: [],
  featSkills: [],
  classTools: [],
  bgTool: '',
  classEquip: '',
  bgEquip: '',
  cantrips: [],
  prepared: [],
  magicInitiate: {},
  name: '',
  alignment: '',
  portrait: '',
});

/** The loaded SRD details the draft refers to. */
export interface CreateData {
  cls: CreateClass | null;
  species: CreateSpecies | null;
  /** the SRD background, or the custom one dressed up as one (see customBackground) */
  background: CreateBackground | null;
  originFeats: CreateText[];
  alignments: { name: string; description: string }[];
}

/** The custom background as a CreateBackground: 50 GP instead of an equipment package. */
export function customBackground(c: CustomBackground, originFeats: CreateText[]): CreateBackground {
  const feat = originFeats.find((f) => f.index === c.feat) ?? { index: c.feat, name: '', description: '' };
  return {
    index: CUSTOM_BACKGROUND,
    name: c.name.trim() || 'Custom background',
    abilities: c.abilities,
    feat,
    skills: c.skills,
    tools: c.tool.trim() ? [c.tool.trim()] : [],
    toolChoice: null,
    equipment: [{ label: 'A', items: [], gold: 50 }],
  };
}

/* Ability scores */

export function baseScores(d: CreateDraft): Partial<Record<AbilityKey, number>> {
  return d.method === 'array' ? d.array : d.pointBuy;
}

export const pointsSpent = (scores: Record<AbilityKey, number>) => ABILITY_KEYS.reduce((n, k) => n + pointCost(scores[k]), 0);

export function backgroundBonus(d: CreateDraft, bg: CreateBackground | null): Partial<Record<AbilityKey, number>> {
  if (!bg) return {};
  if (d.bonusMode === '1-1-1') return Object.fromEntries(bg.abilities.map((k) => [k, 1]));
  const out: Partial<Record<AbilityKey, number>> = {};
  if (d.plus2) out[d.plus2] = 2;
  if (d.plus1 && d.plus1 !== d.plus2) out[d.plus1] = 1;
  return out;
}

/** Final scores (base + background), 8 where nothing is assigned yet; the cap at level 1 is 20. */
export function finalScores(d: CreateDraft, bg: CreateBackground | null): Record<AbilityKey, number> {
  const base = baseScores(d);
  const plus = backgroundBonus(d, bg);
  return Object.fromEntries(ABILITY_KEYS.map((k) => [k, Math.min(20, (base[k] ?? 8) + (plus[k] ?? 0))])) as Record<
    AbilityKey,
    number
  >;
}

/* Choices that depend on the picks so far */

/** Species traits in effect: the species' own plus the chosen lineage's level-1 traits. */
export function speciesTraits(d: CreateDraft, species: CreateSpecies | null): CreateTrait[] {
  if (!species) return [];
  const lineage = species.lineages.find((l) => l.index === d.lineage);
  return [...species.traits, ...(lineage?.traits ?? [])];
}

/** Origin feats the character gets, with where each came from. */
export function originFeats(d: CreateDraft, data: CreateData): { source: FeatSource; feat: CreateText & { note?: string } }[] {
  const out: { source: FeatSource; feat: CreateText & { note?: string } }[] = [];
  if (data.background?.feat.index) out.push({ source: 'background', feat: data.background.feat });
  if (speciesTraits(d, data.species).some((t) => t.originFeat) && d.speciesFeat) {
    const f = data.originFeats.find((x) => x.index === d.speciesFeat);
    if (f) out.push({ source: 'species', feat: f });
  }
  return out;
}

/** Skills granted without a choice by the background. */
export const grantedSkills = (data: CreateData) => data.background?.skills ?? [];

/** Skills chosen through species traits. */
export const speciesSkillPicks = (d: CreateDraft, data: CreateData) =>
  speciesTraits(d, data.species).flatMap((t) => (t.skills ? (d.speciesSkills[t.index] ?? []) : []));

/** How many skills the Skilled feat(s) grant (3 per copy; the 2024 feat also allows tools, we offer skills). */
export const featSkillCount = (d: CreateDraft, data: CreateData) =>
  originFeats(d, data).filter((f) => f.feat.index === 'skilled').length * 3;

/** Skills the character already has before the class pick, so the class list can't repeat them. */
export const skillsBeforeClass = (d: CreateDraft, data: CreateData) =>
  new Set([...grantedSkills(data), ...speciesSkillPicks(d, data), ...d.featSkills]);

export const magicInitiateSources = (d: CreateDraft, data: CreateData): { source: FeatSource; note?: string }[] =>
  originFeats(d, data)
    .filter((f) => f.feat.index === 'magic-initiate')
    .map((f) => ({ source: f.source, note: f.feat.note }));

/** The Magic Initiate list a background suggests ("Cleric" for Acolyte), if any. */
export const defaultMiList = (note?: string): MagicInitiateList | '' => {
  const n = (note ?? '').toLowerCase();
  return (MAGIC_INITIATE_LISTS as string[]).includes(n) ? (n as MagicInitiateList) : '';
};

const choiceDone = (picked: string[] | undefined, c: NameChoice) => (picked?.length ?? 0) === Math.min(c.choose, c.from.length);

/* Steps */

export type Step = 'class' | 'species' | 'background' | 'abilities' | 'skills' | 'equipment' | 'spells' | 'details' | 'review';

export const STEP_LABEL: Record<Step, string> = {
  class: 'Class',
  species: 'Species',
  background: 'Background',
  abilities: 'Ability scores',
  skills: 'Skills & tools',
  equipment: 'Equipment',
  spells: 'Spells',
  details: 'Details',
  review: 'Review',
};

/** The steps for this draft: Spells only when the class casts or a Magic Initiate feat asks for spells. */
export function stepsFor(d: CreateDraft, data: CreateData): Step[] {
  const caster = !!data.cls?.spellAbility || magicInitiateSources(d, data).length > 0;
  return ['class', 'species', 'background', 'abilities', 'skills', 'equipment', ...(caster ? (['spells'] as const) : []), 'details', 'review'];
}

/** What still blocks each step, as short sentences; an empty list means the step is done. */
export function stepIssues(d: CreateDraft, data: CreateData): Record<Step, string[]> {
  const { cls, species, background } = data;
  const out: Record<Step, string[]> = {
    class: [], species: [], background: [], abilities: [], skills: [], equipment: [], spells: [], details: [], review: [],
  };

  if (!d.classIndex) out.class.push('Choose a class.');
  else if (!cls) out.class.push('Loading the class…');

  if (!d.speciesIndex) out.species.push('Choose a species.');
  else if (!species) out.species.push('Loading the species…');
  else {
    if (species.lineages.length && !d.lineage) out.species.push(`Choose a ${species.lineageLabel || 'lineage'}.`);
    if (species.sizes.length > 1 && !d.size) out.species.push('Choose a size.');
    for (const t of speciesTraits(d, species)) {
      if (t.skills && !choiceDone(d.speciesSkills[t.index], t.skills)) out.species.push(`${t.name}: choose ${t.skills.choose} skill(s).`);
      if (t.originFeat && !d.speciesFeat) out.species.push(`${t.name}: choose an origin feat.`);
    }
  }

  if (!d.backgroundIndex) out.background.push('Choose a background.');
  else if (d.backgroundIndex === CUSTOM_BACKGROUND) {
    const c = d.custom;
    if (!c.name.trim()) out.background.push('Name your background.');
    if (c.abilities.length !== 3) out.background.push('Pick three abilities.');
    if (c.skills.length !== 2) out.background.push('Pick two skills.');
    if (!c.feat) out.background.push('Pick an origin feat.');
  } else if (!background) out.background.push('Loading the background…');

  if (d.method === 'array') {
    const used = ABILITY_KEYS.map((k) => d.array[k]).filter((v) => v !== undefined);
    if (used.length < 6) out.abilities.push('Assign every number of the standard array.');
  } else {
    const spent = pointsSpent(d.pointBuy);
    if (spent > POINT_BUY_BUDGET) out.abilities.push(`That costs ${spent} points; you have ${POINT_BUY_BUDGET}.`);
  }
  if (!background) out.abilities.push('Choose a background first: it raises your scores.');
  else if (d.bonusMode === '2-1') {
    if (!d.plus2 || !d.plus1) out.abilities.push('Choose which ability gets +2 and which gets +1.');
    else if (d.plus2 === d.plus1) out.abilities.push('The +2 and +1 must go to different abilities.');
    else if (!background.abilities.includes(d.plus2) || !background.abilities.includes(d.plus1))
      out.abilities.push(`The bonuses must go to ${background.abilities.join(', ')}.`);
  }

  if (cls) {
    if (!choiceDone(d.classSkills, cls.skills)) out.skills.push(`Choose ${cls.skills.choose} class skills.`);
    const before = skillsBeforeClass(d, data);
    const dupes = d.classSkills.filter((s) => before.has(s));
    if (dupes.length) out.skills.push(`You already have ${dupes.join(', ')}; choose other class skills.`);
    cls.toolChoices.forEach((c, i) => {
      if (!choiceDone(d.classTools[i], c)) out.skills.push(`${c.desc || 'Choose a tool'}.`);
    });
  } else out.skills.push('Choose a class first.');
  if (background?.toolChoice && !d.bgTool) out.skills.push(`${background.toolChoice.desc || 'Choose a tool'}.`);
  const featSkills = featSkillCount(d, data);
  if (d.featSkills.length !== featSkills) out.skills.push(`Skilled: choose ${featSkills} skills.`);

  if (cls && cls.equipment.length && !cls.equipment.some((e) => e.label === d.classEquip)) out.equipment.push('Choose your class equipment.');
  if (background && background.equipment.length > 1 && !background.equipment.some((e) => e.label === d.bgEquip))
    out.equipment.push('Choose your background equipment.');

  if (cls) {
    if (d.cantrips.length !== cls.cantrips) out.spells.push(`Learn ${cls.cantrips} cantrips (${d.cantrips.length} so far).`);
    if (d.prepared.length !== cls.prepared) out.spells.push(`Prepare ${cls.prepared} level 1 spells (${d.prepared.length} so far).`);
  }
  for (const { source } of magicInitiateSources(d, data)) {
    const mi = d.magicInitiate[source];
    if (!mi?.list) out.spells.push('Magic Initiate: choose a spell list.');
    else if (mi.cantrips.length !== 2 || !mi.spell) out.spells.push('Magic Initiate: choose two cantrips and one level 1 spell.');
  }

  if (!d.name.trim()) out.details.push('Give your character a name.');
  if (!d.alignment) out.details.push('Choose an alignment.');
  return out;
}

/* The sheet */

const equipOf = (options: EquipOption[] | undefined, label: string) =>
  options?.find((e) => e.label === label) ?? (options?.length === 1 ? options[0] : undefined);

/** Unarmored AC at level 1: Barbarian and Monk Unarmored Defense, otherwise 10 + DEX. */
function unarmoredAc(cls: string, mods: Record<AbilityKey, number>) {
  if (cls === 'barbarian') return 10 + mods.DEX + mods.CON;
  if (cls === 'monk') return 10 + mods.DEX + mods.WIS;
  return 10 + mods.DEX;
}

const ALIGN_FALLBACK = '';

/**
 * Builds the sheet (and extras) for a finished draft. Throws if a needed detail isn't loaded.
 * Unfinished choices are left empty, so the Review step can preview a half-done character too.
 */
export function buildSheet(d: CreateDraft, data: CreateData): { sheet: unknown; extras: CharacterExtras } {
  const { cls, species, background } = data;
  if (!cls || !species || !background) throw new Error('Choose a class, species and background first');
  const rules = CLASSES[cls.index];
  if (!rules) throw new Error(`No rules for class "${cls.index}"`);

  const scores = finalScores(d, background);
  const base = baseScores(d);
  const mods = Object.fromEntries(ABILITY_KEYS.map((k) => [k, modifier(scores[k])])) as Record<AbilityKey, number>;
  const feats = originFeats(d, data);
  const traits = speciesTraits(d, species);
  const lineage = species.lineages.find((l) => l.index === d.lineage);

  // Skills: class picks are the export's "skills"; the rest carry their own source.
  const other = [
    ...traits.flatMap((t) => (t.skills ? (d.speciesSkills[t.index] ?? []).map((name) => ({ name, source: species.name })) : [])),
    ...d.featSkills.map((name) => ({ name, source: 'Skilled' })),
  ].filter((s) => s.name in SKILLS);

  const tools = [
    ...background.tools.map((name) => ({ name, description: `${background.name} proficiency` })),
    ...(d.bgTool ? [{ name: d.bgTool, description: `${background.name} proficiency` }] : []),
    ...d.classTools.flat().map((name) => ({ name, description: `${cls.name} proficiency`, source: cls.name })),
  ];

  const classEquip = equipOf(cls.equipment, d.classEquip);
  const bgEquip = equipOf(background.equipment, d.bgEquip);
  const backpack = [classEquip, bgEquip].flatMap((e) =>
    (e?.items ?? []).flatMap((i) => Array.from({ length: Math.max(1, Math.min(i.qty, 99)) }, () => i.name)),
  );
  const gold = (classEquip?.gold ?? 0) + (bgEquip?.gold ?? 0);

  const speed = traits.reduce((s, t) => t.speed ?? s, species.speed);
  const toughness = traits.some((t) => t.index === 'dwarven-toughness') ? 1 : 0;
  const hitPoints = Math.max(1, rules.hitDie + mods.CON + toughness);
  const alert = feats.some((f) => f.feat.index === 'alert');
  const align = data.alignments.find((a) => a.name === d.alignment);

  const training = cls.proficiencies.length
    ? [{ name: 'Training', description: `Proficient with: ${cls.proficiencies.join(', ')}.` }]
    : [];
  const speciesFeat = feats.find((f) => f.source === 'species');

  const sheet = {
    characterName: d.name.trim(),
    userChoices: [
      {
        type: 'race',
        value: species.index,
        ...(lineage && species.index !== 'goliath' ? { subrace: lineage.label.toLowerCase() } : {}),
        ...(d.size ? { size: d.size } : {}),
        traits: [
          ...traits.map((t) => ({ name: t.name, description: t.description })),
          ...(speciesFeat ? [{ name: `Origin feat: ${speciesFeat.feat.name}`, description: speciesFeat.feat.description }] : []),
        ],
      },
      { type: 'class', value: cls.index, features: [...cls.features.map(({ name, description }) => ({ name, description })), ...training] },
      { type: 'skills', value: d.classSkills, other },
      {
        type: 'background',
        value: background.index === CUSTOM_BACKGROUND ? background.name.toLowerCase() : background.index,
        bonuses: {
          abilityScores: background.abilities,
          originFeat: feats.filter((f) => f.source === 'background').map((f) => ({ name: f.feat.name, description: f.feat.description })),
          skills: background.skills.map((name) => ({ name, description: '' })),
          tools,
        },
      },
      {
        type: 'attributes',
        value: ABILITY_KEYS.map((k) => scores[k]),
        baseValues: ABILITY_KEYS.map((k) => base[k] ?? 8),
        bonuses: backgroundBonus(d, background),
        level: 1,
        hitPoints,
        armorClass: unarmoredAc(cls.index, mods),
        initiative: mods.DEX + (alert ? 2 : 0),
        speed,
      },
      { type: 'alignment', value: d.alignment || ALIGN_FALLBACK, description: align?.description ?? '' },
      { type: 'spells', cantrips: d.cantrips, spells: d.prepared, value: d.prepared },
      { type: 'equipment', value: { equipped: {}, backpack, gold } },
    ],
    preparedSpells: [],
    createdWith: 'adventurers-journal',
  };

  const bonusSpells: SpellEntry[] = [
    ...traits.flatMap((t) =>
      t.spells.map((s): SpellEntry => ({ name: s.name, level: s.level, source: 'Species', note: `${t.name}: always known` })),
    ),
    ...magicInitiateSources(d, data).flatMap(({ source }) => {
      const mi = d.magicInitiate[source];
      if (!mi?.list) return [];
      return [
        ...mi.cantrips.map((name): SpellEntry => ({ name, level: 0, source: 'Magic Initiate' })),
        ...(mi.spell ? [{ name: mi.spell, level: 1, source: 'Magic Initiate', note: 'Once per long rest without a slot' } as SpellEntry] : []),
      ];
    }),
  ];
  const seen = new Set<string>();
  const extras: CharacterExtras = {
    ...(d.portrait.trim() ? { portrait: d.portrait.trim() } : {}),
    bonusSpells: bonusSpells.filter((s) => {
      const k = s.name.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }),
  };
  return { sheet, extras };
}
