import { CLASS_FEATURES, type Feature } from '../data/supplement';
import type { CharacterExtras, SpellEntry } from '../shared/types';
import {
  ABILITIES,
  CLASSES,
  maxSpellLevel,
  SKILLS,
  modifier,
  proficiencyBonus,
  titleCase,
  type Ability,
  type ClassRules,
} from './rules';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Choice = { type: string; [k: string]: any };

export interface AbilityScore {
  key: Ability;
  score: number;
  base: number;
  mod: number;
  saveProf: boolean;
  save: number;
}

export interface Skill {
  name: string;
  ability: Ability;
  proficient: boolean;
  source?: string;
  bonus: number;
}

export interface Character {
  name: string;
  portrait: string | null;
  race: string;
  className: string;
  level: number;
  background: string;
  alignment: string;
  alignmentDescription: string;
  /** lowercase class id from the sheet, e.g. "druid" */
  classKey: string;
  rules: ClassRules;
  profBonus: number;
  abilities: AbilityScore[];
  mods: Record<Ability, number>;
  skills: Skill[];
  hitPoints: number;
  armorClass: number;
  initiative: number;
  speed: number;
  spellAbility: Ability;
  spellSaveDC: number;
  spellAttack: number;
  slots: number[];
  /** highest spell level castable at this character level */
  maxSpellLevel: number;
  /** class cantrips that can be chosen (incl. Primal Order bonus) */
  cantripCap: number;
  /** leveled class spells that can be prepared */
  preparedCap: number;
  /** spells as exported (class picks + always-known from the note); see knownSpells for live choices */
  spells: SpellEntry[];
  /** always-known spells from race, feats etc. (from the character's extras) */
  bonusSpells: SpellEntry[];
  /** class-list spells missing from the SRD list */
  extraClassSpells: { name: string; level: number }[];
  features: Feature[];
  tools: Feature[];
  equipment: string[];
  gold: number;
}

function find(choices: Choice[], type: string): Choice {
  const c = choices.find((x) => x.type === type);
  if (!c) throw new Error(`Character JSON is missing "${type}"`);
  return c;
}

/** Derives the sheet. `data` is one character export (or the `[character]` array form). */
export function buildCharacter(data: any, extras: CharacterExtras = {}): Character {
  if (Array.isArray(data)) data = data[0];
  if (!data || !Array.isArray(data.userChoices)) throw new Error('Character JSON is missing "userChoices"');
  const bonusSpells = extras.bonusSpells ?? [];
  const choices: Choice[] = data.userChoices;
  const race = find(choices, 'race');
  const cls = find(choices, 'class');
  const bg = find(choices, 'background');
  const attrs = find(choices, 'attributes');
  const align = find(choices, 'alignment');
  const spellChoice = find(choices, 'spells');
  const equip = find(choices, 'equipment');

  const rules = CLASSES[cls.value];
  if (!rules) throw new Error(`No rules for class "${cls.value}"`);
  const level: number = attrs.level;
  const profBonus = proficiencyBonus(level);

  const mods = {} as Record<Ability, number>;
  const abilities = ABILITIES.map((key, i) => {
    const score: number = attrs.value[i];
    const mod = modifier(score);
    mods[key] = mod;
    const saveProf = rules.saves.includes(key);
    return { key, score, base: attrs.baseValues[i], mod, saveProf, save: mod + (saveProf ? profBonus : 0) };
  });

  const profSources = new Map<string, string>();
  for (const s of find(choices, 'skills').value as string[]) profSources.set(s, 'Class');
  for (const s of bg.bonuses.skills as { name: string }[]) profSources.set(s.name, 'Background');

  const skills = Object.entries(SKILLS).map(([name, ability]) => {
    const source = profSources.get(name);
    return { name, ability, proficient: !!source, source, bonus: mods[ability] + (source ? profBonus : 0) };
  });

  // JSON spells are class spells; the extras add always-known ones (feats, race).
  const spells: SpellEntry[] = [
    ...(spellChoice.cantrips as string[]).map((name) => ({ name, level: 0, source: 'Class' as const })),
    ...(spellChoice.spells as string[]).map((name) => ({ name, level: 1, source: 'Class' as const })),
  ];
  for (const s of bonusSpells) {
    if (!spells.some((x) => x.name.toLowerCase() === s.name.toLowerCase())) spells.push(s);
  }
  spells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

  const raceLabel = titleCase([race.subrace, race.value].filter(Boolean).join(' '));
  const features: Feature[] = [
    ...(race.traits as { name: string; description: string }[]).map((t) => ({ ...t, source: raceLabel })),
    ...(bg.bonuses.originFeat as { name: string; description: string }[]).map((t) => ({
      ...t,
      source: 'Guide (origin feat)',
    })),
    ...(CLASS_FEATURES[cls.value] ?? []),
  ];

  return {
    name: data.characterName,
    portrait: extras.portrait ?? null,
    race: raceLabel,
    className: titleCase(cls.value),
    classKey: cls.value,
    level,
    background: titleCase(bg.value),
    alignment: align.value,
    alignmentDescription: align.description,
    rules,
    profBonus,
    abilities,
    mods,
    skills,
    hitPoints: attrs.hitPoints,
    armorClass: attrs.armorClass,
    initiative: attrs.initiative,
    speed: attrs.speed,
    spellAbility: rules.spellAbility,
    spellSaveDC: 8 + profBonus + mods[rules.spellAbility],
    spellAttack: profBonus + mods[rules.spellAbility],
    slots: rules.slots[level] ?? [],
    maxSpellLevel: maxSpellLevel(level),
    cantripCap: (rules.cantripsKnown[level] ?? 0) + (extras.bonusCantrips ?? 0),
    preparedCap: rules.preparedCount[level] ?? 0,
    spells,
    bonusSpells,
    extraClassSpells: extras.extraClassSpells ?? [],
    features,
    tools: (bg.bonuses.tools as { name: string; description: string }[]).map((t) => ({ ...t, source: 'Guide' })),
    equipment: [...Object.values(equip.value.equipped ?? {}), ...equip.value.backpack] as string[],
    gold: equip.value.gold ?? 0,
  };
}

/** Spells the character currently has: chosen class cantrips, prepared class spells and always-known ones. */
export function knownSpells(
  c: Character,
  chosen: { chosenCantrips: string[]; prepared: string[] },
  levelOf: (name: string) => number | undefined = () => undefined,
): SpellEntry[] {
  const fromExport = new Map(c.spells.map((s) => [s.name.toLowerCase(), s.level]));
  const lvl = (name: string, fallback: number) => levelOf(name) ?? fromExport.get(name.toLowerCase()) ?? fallback;
  const out: SpellEntry[] = [
    ...chosen.chosenCantrips.map((name) => ({ name, level: 0, source: 'Class' as const })),
    ...chosen.prepared.map((name) => ({ name, level: lvl(name, 1), source: 'Class' as const })),
  ];
  for (const s of c.bonusSpells) {
    if (!out.some((x) => x.name.toLowerCase() === s.name.toLowerCase())) out.push(s);
  }
  return out.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}
