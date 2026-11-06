import raw from '../data/faelan.json';
import { BONUS_CANTRIPS, CLASS_FEATURES, NOTE_SPELLS, type Feature, type SpellEntry } from '../data/supplement';
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
  portrait: string;
  race: string;
  className: string;
  level: number;
  background: string;
  alignment: string;
  alignmentDescription: string;
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

export function buildCharacter(data: any = raw[0]): Character {
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

  // JSON spells are class spells; the Obsidian note adds Magic Initiate and gnome spells.
  const spells: SpellEntry[] = [
    ...(spellChoice.cantrips as string[]).map((name) => ({ name, level: 0, source: 'Class' as const })),
    ...(spellChoice.spells as string[]).map((name) => ({ name, level: 1, source: 'Class' as const })),
  ];
  for (const s of NOTE_SPELLS) {
    if (!spells.some((x) => x.name.toLowerCase() === s.name.toLowerCase())) spells.push(s);
  }
  spells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

  const features: Feature[] = [
    ...(race.traits as { name: string; description: string }[]).map((t) => ({ ...t, source: 'Forest Gnome' })),
    ...(bg.bonuses.originFeat as { name: string; description: string }[]).map((t) => ({
      ...t,
      source: 'Guide (origin feat)',
    })),
    ...(CLASS_FEATURES[cls.value] ?? []),
  ];

  return {
    name: data.characterName,
    portrait: '/faelanmosswalker.png',
    race: `${titleCase(race.subrace)} ${titleCase(race.value)}`,
    className: titleCase(cls.value),
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
    cantripCap: (rules.cantripsKnown[level] ?? 0) + BONUS_CANTRIPS,
    preparedCap: rules.preparedCount[level] ?? 0,
    spells,
    features,
    tools: (bg.bonuses.tools as { name: string; description: string }[]).map((t) => ({ ...t, source: 'Guide' })),
    equipment: [...Object.values(equip.value.equipped ?? {}), ...equip.value.backpack] as string[],
    gold: equip.value.gold ?? 0,
  };
}

/** Spells Faelan currently has: chosen class cantrips, prepared class spells and always-known ones. */
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
  for (const s of NOTE_SPELLS) {
    if (!out.some((x) => x.name.toLowerCase() === s.name.toLowerCase())) out.push(s);
  }
  return out.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}
