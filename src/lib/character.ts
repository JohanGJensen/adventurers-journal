import { CLASS_FEATURES, LAND_SUBCLASS, LAND_TYPES, type Feature } from '../data/supplement';
import {
  homebrewIndex,
  type AbilityBonus,
  type CharacterExtras,
  type HomebrewSubclass,
  type LevelChoice,
  type Pick,
  type SpellEntry,
} from '../shared/types';
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
  /** null for classes without Spellcasting; save DC and attack are then 0 */
  spellAbility: Ability | null;
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
  /** the level in the sheet export; levels above it come from `levels` */
  exportLevel: number;
  /** level-ups locked in past the export */
  levels: LevelChoice[];
  subclass: Pick | null;
  /** Wild Shape uses per rest (0 before level 2) */
  wildShapeUses: number;
  /** AC bonus on top of armor (homebrew buffs) */
  acBonus: number;
  /** limited-use resources, e.g. from a homebrew subclass */
  resources: Resource[];
  /** a subclass choice that changes on long rests (Circle of the Land's land type, homebrew variants) */
  variants: { label: string; options: { name: string; description: string }[] } | null;
  /** always-prepared spells per variant, at the current level */
  variantSpells: Record<string, SpellEntry[]>;
  equipment: string[];
  gold: number;
}

export interface Resource {
  key: string;
  name: string;
  max: number;
  recharge: 'short' | 'long';
}

function find(choices: Choice[], type: string): Choice {
  const c = choices.find((x) => x.type === type);
  if (!c) throw new Error(`Character JSON is missing "${type}"`);
  return c;
}

/** Applies a bonus to scores in place, each capped at `cap`. */
function addScores(scores: Record<Ability, number>, plus: AbilityBonus | undefined, cap: number) {
  for (const k of ABILITIES) {
    const n = plus?.[k];
    if (n) scores[k] = Math.min(cap, scores[k] + n);
  }
}

const bonusText = (plus: AbilityBonus | undefined) =>
  ABILITIES.filter((k) => plus?.[k]).map((k) => `${k} +${plus![k]}`).join(', ');

/** Features gained from locked-in level-ups, in level order. */
function levelFeatures(levels: LevelChoice[], className: string, homebrew: HomebrewSubclass | null): Feature[] {
  const out: Feature[] = [];
  for (const l of levels) {
    const at = `${className} ${l.level}`;
    if (l.subclass) {
      const hb = homebrew && l.subclass.index === homebrewIndex(homebrew.id) ? homebrew : null;
      out.push({
        name: hb?.name ?? l.subclass.name,
        source: hb ? `${at} homebrew subclass` : l.subclass.custom ? 'Custom subclass' : `${at} subclass`,
        description: hb?.description ?? l.subclass.description ?? l.subclass.notes ?? '',
      });
    }
    out.push(...l.features);
    if (l.asi?.kind === 'scores')
      out.push({ name: 'Ability Score Improvement', source: at, description: bonusText(l.asi.plus) });
    else if (l.asi?.kind === 'feat') {
      const plus = bonusText(l.asi.plus);
      out.push({
        name: l.asi.name,
        source: l.asi.custom ? 'Custom feat' : `${at} feat`,
        description: [plus && `Ability Score Increase: ${plus}.`, l.asi.description ?? l.asi.notes].filter(Boolean).join(' '),
      });
    }
    if (l.option) out.push({ name: `${l.option.feature}: ${l.option.choice}`, source: at, description: l.option.description ?? '' });
    if (l.boon) {
      const plus = bonusText(l.boon.plus);
      out.push({
        name: l.boon.name,
        source: l.boon.custom ? 'Custom boon' : `${at} epic boon`,
        description: [plus && `Ability Score Increase: ${plus}.`, l.boon.description ?? l.boon.notes].filter(Boolean).join(' '),
      });
    }
  }
  return out;
}

/**
 * Derives the sheet. `data` is one character export (or the `[character]` array form);
 * `levels` are level-ups locked in past the export's level.
 */
export function buildCharacter(
  data: any,
  extras: CharacterExtras = {},
  levels: LevelChoice[] = [],
  homebrew: HomebrewSubclass | null = null,
): Character {
  if (Array.isArray(data)) data = data[0];
  if (!data || !Array.isArray(data.userChoices)) throw new Error('Character JSON is missing "userChoices"');
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
  const exportLevel: number = attrs.level;
  const level = exportLevel + levels.length;
  const profBonus = proficiencyBonus(level);

  const subclass = [...levels].reverse().find((l) => l.subclass)?.subclass ?? null;
  // A homebrew subclass applies only while it is the character's subclass; its levels up to the current one count.
  const hb = homebrew && subclass?.index === homebrewIndex(homebrew.id) ? homebrew : null;
  const hbLevels = hb?.levels.filter((l) => l.level <= level) ?? [];
  const buffs = hbLevels.map((l) => l.buffs);
  const sum = (k: 'ac' | 'speed' | 'initiative' | 'hpPerLevel' | 'cantrips') => buffs.reduce((n, b) => n + (b[k] ?? 0), 0);
  const hbSaves = new Set(buffs.flatMap((b) => b.saves ?? []));

  const exportScores = Object.fromEntries(ABILITIES.map((k, i) => [k, attrs.value[i] as number])) as Record<Ability, number>;
  const scores = { ...exportScores };
  for (const l of levels) {
    addScores(scores, l.asi?.plus, 20);
    addScores(scores, l.boon?.plus, 30);
  }
  for (const b of buffs) addScores(scores, b.abilities, 20);

  const mods = {} as Record<Ability, number>;
  const abilities = ABILITIES.map((key, i) => {
    const score = scores[key];
    const mod = modifier(score);
    mods[key] = mod;
    const saveProf = rules.saves.includes(key) || hbSaves.has(key);
    return { key, score, base: attrs.baseValues[i], mod, saveProf, save: mod + (saveProf ? profBonus : 0) };
  });

  const profSources = new Map<string, string>();
  const skillChoice = find(choices, 'skills');
  for (const s of skillChoice.value as string[]) profSources.set(s, 'Class');
  for (const s of bg.bonuses.skills as { name: string }[]) profSources.set(s.name, 'Background');
  // Skills from species traits or origin feats (sheets made by the creation wizard).
  for (const s of (skillChoice.other ?? []) as { name: string; source: string }[]) if (!profSources.has(s.name)) profSources.set(s.name, s.source);
  for (const s of buffs.flatMap((b) => b.skills ?? [])) if (!profSources.has(s)) profSources.set(s, 'Subclass');

  const bonusSpells: SpellEntry[] = [...(extras.bonusSpells ?? [])];
  for (const sp of hbLevels.flatMap((l) => l.spells)) {
    if (!bonusSpells.some((x) => x.name.toLowerCase() === sp.name.toLowerCase()))
      bonusSpells.push({ name: sp.name, level: sp.level, source: 'Subclass', note: `${hb!.name}: always prepared` });
  }

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
  const bgLabel = titleCase(bg.value);
  // Sheets made by the creation wizard carry their level-1 class features; imported exports fall back to the supplement.
  const classFeatures: Feature[] = Array.isArray(cls.features)
    ? (cls.features as { name: string; description: string }[]).map((f) => ({ ...f, source: `${titleCase(cls.value)} 1` }))
    : (CLASS_FEATURES[cls.value] ?? []);
  const features: Feature[] = [
    ...(race.traits as { name: string; description: string }[]).map((t) => ({ ...t, source: raceLabel })),
    ...(bg.bonuses.originFeat as { name: string; description: string }[]).map((t) => ({
      ...t,
      source: `${bgLabel} (origin feat)`,
    })),
    ...classFeatures,
    ...levelFeatures(levels, titleCase(cls.value), hb),
    ...hbLevels.flatMap((l) => l.features.map((f) => ({ ...f, source: `${hb!.name} ${l.level}` }))),
  ];
  const profText = [
    ...[...hbSaves].map((k) => `${k} saving throws`),
    ...buffs.flatMap((b) => b.skills ?? []),
    ...buffs.flatMap((b) => b.proficiencies ?? []),
  ];
  if (profText.length) features.push({ name: 'Proficiencies', source: hb!.name, description: profText.join(', ') });

  // Export values already include the export's modifiers; shift them by how much the modifier changed.
  // HP is recomputed so a CON increase applies to every level, as the rules say.
  const conMod = mods.CON;
  const conDelta = conMod - modifier(exportScores.CON);
  const dexDelta = mods.DEX - modifier(exportScores.DEX);
  const hitPoints =
    attrs.hitPoints +
    conDelta * exportLevel +
    levels.reduce((n, l) => n + Math.max(1, l.hp.die + conMod), 0) +
    sum('hpPerLevel') * level;

  const resources: Resource[] = hbLevels.flatMap((l) =>
    l.resources.map((r, i) => ({
      key: `${l.level}:${i}:${r.name}`,
      name: r.name,
      recharge: r.recharge,
      max: typeof r.uses === 'number' ? r.uses : r.uses === 'prof' ? profBonus : Math.max(1, mods[r.uses]),
    })),
  );

  let variants: Character['variants'] = null;
  const variantSpells: Record<string, SpellEntry[]> = {};
  if (hb?.variants) {
    variants = { label: hb.variants.label, options: hb.variants.options.map(({ name, description }) => ({ name, description })) };
    for (const o of hb.variants.options)
      variantSpells[o.name] = o.spells
        .filter((x) => x.atLevel <= level)
        .map((x) => ({ name: x.name, level: x.level, source: 'Subclass' as const, note: `${hb.variants!.label}: ${o.name}` }));
  } else if (subclass?.index === LAND_SUBCLASS) {
    variants = { label: 'Land type', options: LAND_TYPES.map((name) => ({ name, description: '' })) };
  }

  return {
    name: data.characterName,
    portrait: extras.portrait ?? null,
    race: raceLabel,
    className: titleCase(cls.value),
    classKey: cls.value,
    level,
    background: bgLabel,
    alignment: align.value,
    alignmentDescription: align.description,
    rules,
    profBonus,
    abilities,
    mods,
    skills,
    hitPoints,
    armorClass: attrs.armorClass + dexDelta,
    initiative: attrs.initiative + dexDelta + sum('initiative'),
    speed: attrs.speed + sum('speed'),
    spellAbility: rules.spellAbility,
    spellSaveDC: rules.spellAbility ? 8 + profBonus + mods[rules.spellAbility] : 0,
    spellAttack: rules.spellAbility ? profBonus + mods[rules.spellAbility] : 0,
    slots: rules.slots[level] ?? [],
    maxSpellLevel: maxSpellLevel(rules, level),
    cantripCap: (rules.cantripsKnown[level] ?? 0) + (extras.bonusCantrips ?? 0) + sum('cantrips'),
    preparedCap: rules.preparedCount[level] ?? 0,
    spells,
    bonusSpells,
    extraClassSpells: extras.extraClassSpells ?? [],
    features,
    tools: (bg.bonuses.tools as { name: string; description: string; source?: string }[]).map((t) => ({ ...t, source: t.source ?? bgLabel })),
    equipment: [...Object.values(equip.value.equipped ?? {}), ...equip.value.backpack] as string[],
    gold: equip.value.gold ?? 0,
    exportLevel,
    levels,
    subclass: subclass
      ? { index: subclass.index, name: hb?.name ?? subclass.name, custom: subclass.custom, homebrew: subclass.homebrew }
      : null,
    wildShapeUses: rules.wildShapeUses[level] ?? 0,
    acBonus: sum('ac'),
    resources,
    variants,
    variantSpells,
  };
}

/** Spells the character currently has: chosen class cantrips, prepared class spells and always-known ones. */
export function knownSpells(
  c: Character,
  chosen: { chosenCantrips: string[]; prepared: string[]; variant?: string | null },
  levelOf: (name: string) => number | undefined = () => undefined,
): SpellEntry[] {
  const fromExport = new Map(c.spells.map((s) => [s.name.toLowerCase(), s.level]));
  const lvl = (name: string, fallback: number) => levelOf(name) ?? fromExport.get(name.toLowerCase()) ?? fallback;
  const out: SpellEntry[] = [
    ...chosen.chosenCantrips.map((name) => ({ name, level: 0, source: 'Class' as const })),
    ...chosen.prepared.map((name) => ({ name, level: lvl(name, 1), source: 'Class' as const })),
  ];
  for (const s of [...c.bonusSpells, ...(chosen.variant ? (c.variantSpells[chosen.variant] ?? []) : [])]) {
    if (!out.some((x) => x.name.toLowerCase() === s.name.toLowerCase())) out.push(s);
  }
  return out.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}
