// Character creation data: 2024 SRD classes, species and backgrounds from dnd5eapi.co, normalised for the
// creation wizard and cached in srd_cache (so once fetched, creation works offline).
import type { Db } from './sqlite';
import { CLASSES, SKILLS } from '../src/lib/rules';
import {
  ABILITY_KEYS,
  type AbilityKey,
  type BackgroundSummary,
  type ClassSummary,
  type CreateBackground,
  type CreateClass,
  type CreateLineage,
  type CreateOptions,
  type CreateSpecies,
  type CreateSpell,
  type CreateTrait,
  type EquipItem,
  type EquipOption,
  type NameChoice,
  type SpeciesSummary,
} from '../src/shared/types';
import { cachedFetch, features, feats, getDetail, indexList, levelTable, slugify, text } from './srd';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** "Skill: Arcana" / "Tool: Thieves' Tools" -> "Arcana" / "Thieves' Tools" */
const strip = (name: string) => name.replace(/^(Skill|Tool|Saving Throw|Musical Instrument):\s*/i, '').trim();

const abilityKey = (name: string): AbilityKey | null => {
  const k = name.slice(0, 3).toUpperCase();
  return (ABILITY_KEYS as readonly string[]).includes(k) ? (k as AbilityKey) : null;
};
const abilityKeys = (refs: any[] | undefined): AbilityKey[] =>
  (refs ?? []).map((r) => abilityKey(String(r.name ?? r.index))).filter((k): k is AbilityKey => !!k);

/** All names in an option set, flattening nested choices (Monk: artisan's tools or a musical instrument). */
function optionNames(from: any): string[] {
  return (from?.options ?? []).flatMap((o: any) =>
    o.option_type === 'reference' ? [strip(o.item?.name ?? '')] : o.option_type === 'choice' ? optionNames(o.choice?.from) : [],
  );
}

const nameChoice = (c: any): NameChoice => ({ choose: c.choose ?? 1, desc: c.desc ?? '', from: optionNames(c.from) });
const isSkillChoice = (c: NameChoice) => c.from.length > 0 && c.from.every((n) => n in SKILLS);

/** Starting equipment packages. The 2024 data has one "choose 1" set of (A)/(B)/(C) options. */
export function equipOptions(sets: any[] | undefined): EquipOption[] {
  const set = sets?.[0];
  if (!set) return [];
  return (set.from?.options ?? []).map((o: any, i: number): EquipOption => {
    const out: EquipOption = { label: String.fromCharCode(65 + i), items: [], gold: 0 };
    const add = (x: any) => {
      switch (x.option_type) {
        case 'multiple':
          (x.items ?? []).forEach(add);
          break;
        case 'money':
          out.gold += x.unit === 'gp' ? x.count : x.unit === 'sp' ? x.count / 10 : x.unit === 'cp' ? x.count / 100 : x.count;
          break;
        case 'counted_reference':
          out.items.push({ name: x.of.name + (x.of.note ? ` (${x.of.note})` : ''), qty: x.count ?? 1 });
          break;
        case 'choice': {
          const c = x.choice ?? {};
          const name = c.desc ?? c.from?.equipment_category?.name ?? 'Item';
          out.items.push({ name: `${name} (your choice)`, qty: c.choose ?? 1, choice: true } satisfies EquipItem);
          break;
        }
      }
    };
    add(o);
    return out;
  });
}

const classSummary = (d: any): ClassSummary & { raw: any } => ({
  index: d.index,
  name: d.name,
  hitDie: d.hit_die,
  primary: d.primary_ability?.desc ?? '',
  saves: abilityKeys(d.saving_throws),
  spellAbility: CLASSES[d.index]?.spellAbility ?? null,
  raw: {
    proficiency_choices: d.proficiency_choices ?? [],
    proficiencies: d.proficiencies ?? [],
    starting_equipment_options: d.starting_equipment_options ?? [],
  },
});

const fetchClass = (db: Db, cls: string) => cachedFetch(db, 'create-class', cls, `/2024/classes/${cls}`, classSummary);

export async function getCreateClass(db: Db, cls: string): Promise<CreateClass | null> {
  const rules = CLASSES[cls];
  const c = await fetchClass(db, cls);
  if (!c || !rules) return null;
  const choices = (c.raw.proficiency_choices as any[]).map(nameChoice);
  const table = await levelTable(db, 'classlevels', cls, `/2024/classes/${cls}/levels`);
  const level1 = table?.find((l) => l.level === 1)?.features ?? [];
  const { raw, ...summary } = c;
  return {
    ...summary,
    skills: choices.find(isSkillChoice) ?? { choose: 0, desc: '', from: [] },
    toolChoices: choices.filter((x) => !isSkillChoice(x) && x.from.length),
    proficiencies: (raw.proficiencies as any[]).map((p) => String(p.name)).filter((n) => !/^Saving Throw/i.test(n)),
    equipment: equipOptions(raw.starting_equipment_options),
    features: (await features(db, level1)).map(({ index, name, description }) => ({ index, name, description })),
    cantrips: rules.cantripsKnown[1] ?? 0,
    prepared: rules.preparedCount[1] ?? 0,
  };
}

/* Species */

type RawSpecies = SpeciesSummary & { traitIndices: string[]; subspecies: string[] };

const fetchSpecies = (db: Db, sp: string) =>
  cachedFetch(db, 'create-species', sp, `/2024/species/${sp}`, (d: any): RawSpecies => ({
    index: d.index,
    name: d.name,
    speed: d.speed ?? 30,
    sizes: d.size ? [d.size] : (d.size_options?.from?.options ?? []).map((o: any) => String(o.size)),
    traitNames: (d.traits ?? []).map((t: any) => String(t.name)),
    traitIndices: (d.traits ?? []).map((t: any) => String(t.index)),
    subspecies: (d.subspecies ?? []).map((s: any) => String(s.index)),
  }));

type RawTrait = Omit<CreateTrait, 'spells'> & { spellSlugs: string[] };

const fetchTrait = (db: Db, index: string) =>
  cachedFetch(db, 'trait', index, `/2024/traits/${index}`, (d: any): RawTrait => {
    const t = text(d);
    const choice = d.proficiency_choices ? nameChoice(d.proficiency_choices) : null;
    return {
      ...t,
      ...(choice && isSkillChoice(choice) ? { skills: choice } : {}),
      ...(typeof d.speed === 'number' ? { speed: d.speed } : {}),
      // The API states this in prose only.
      ...(/origin feat of your choice/i.test(t.description) ? { originFeat: true } : {}),
      spellSlugs: (d.spells ?? []).map((s: any) => String(s.spell?.index ?? slugify(s.spell?.name ?? ''))).filter(Boolean),
    };
  });

async function trait(db: Db, index: string): Promise<CreateTrait | null> {
  const t = await fetchTrait(db, index);
  if (!t) return null;
  const { spellSlugs, ...rest } = t;
  const spells = await Promise.all(
    spellSlugs.map(async (slug): Promise<CreateSpell | null> => {
      const d = await getDetail(db, 'spells', slug);
      return d ? { name: d.name, level: d.spell?.level ?? 0 } : null;
    }),
  );
  return { ...rest, spells: spells.filter((s): s is CreateSpell => !!s) };
}

const traits = async (db: Db, indices: string[]) =>
  (await Promise.all(indices.map((i) => trait(db, i)))).filter((t): t is CreateTrait => !!t);

/** "Elven Lineage: Wood Elf" -> ["Elven Lineage", "Wood"]; "Draconic Ancestor: Red" -> ["Draconic Ancestor", "Red"] */
function splitLineage(name: string, species: string): [string, string] {
  const [group, rest = name] = name.split(/:\s*/, 2);
  const label = rest.replace(new RegExp(`\\s+${species}$`, 'i'), '').trim();
  return [group, label];
}

type RawLineage = { index: string; name: string; level1: string[] };

const fetchLineage = (db: Db, index: string) =>
  cachedFetch(db, 'subspecies', index, `/2024/subspecies/${index}`, (d: any): RawLineage => ({
    index: d.index,
    name: d.name,
    level1: (d.traits ?? []).filter((t: any) => (t.level ?? 1) <= 1).map((t: any) => String(t.index)),
  }));

export async function getCreateSpecies(db: Db, sp: string): Promise<CreateSpecies | null> {
  const s = await fetchSpecies(db, sp);
  if (!s) return null;
  const { traitIndices, subspecies, ...summary } = s;
  const raw = (await Promise.all(subspecies.map((i) => fetchLineage(db, i)))).filter((l): l is RawLineage => !!l);
  const lineages: CreateLineage[] = await Promise.all(
    raw.map(async (l) => ({ index: l.index, name: l.name, label: splitLineage(l.name, s.name)[1], traits: await traits(db, l.level1) })),
  );
  return {
    ...summary,
    traits: await traits(db, traitIndices),
    lineageLabel: raw.length ? splitLineage(raw[0].name, s.name)[0] : '',
    lineages,
  };
}

/* Backgrounds */

type RawBackground = Omit<CreateBackground, 'feat'> & { feat: { index: string; name: string; note?: string } };

const fetchBackground = (db: Db, bg: string) =>
  cachedFetch(db, 'create-background', bg, `/2024/backgrounds/${bg}`, (d: any): RawBackground => {
    const profs = (d.proficiencies ?? []).map((p: any) => String(p.name));
    const choice = (d.proficiency_choices ?? []).map(nameChoice)[0] ?? null;
    return {
      index: d.index,
      name: d.name,
      abilities: abilityKeys(d.ability_scores),
      feat: { index: d.feat?.index ?? '', name: d.feat?.name ?? '', ...(d.feat?.note ? { note: d.feat.note } : {}) },
      skills: profs.filter((n: string) => /^Skill:/i.test(n)).map(strip),
      tools: profs.filter((n: string) => !/^Skill:/i.test(n)).map(strip),
      toolChoice: choice,
      equipment: equipOptions(d.equipment_options),
    };
  });

const fetchFeat = (db: Db, index: string) => cachedFetch(db, 'feat', `${index}:text`, `/2024/feats/${index}`, text);

export async function getCreateBackground(db: Db, bg: string): Promise<CreateBackground | null> {
  const b = await fetchBackground(db, bg);
  if (!b) return null;
  const feat = b.feat.index ? await fetchFeat(db, b.feat.index) : null;
  return { ...b, feat: { ...(feat ?? { index: b.feat.index, name: b.feat.name, description: '' }), ...(b.feat.note ? { note: b.feat.note } : {}) } };
}

/* Everything the first wizard steps list */

const fetchAlignment = (db: Db, index: string) =>
  cachedFetch(db, 'alignment', index, `/2024/alignments/${index}`, (d: any) => ({ name: String(d.name), description: String(d.description ?? d.desc ?? '') }));

export async function getCreateOptions(db: Db): Promise<CreateOptions> {
  const list = (kind: string) => cachedFetch(db, 'srdlist', kind, `/2024/${kind}`, indexList).then((x) => x ?? []);
  const [classIdx, speciesIdx, bgIdx, alignIdx, allFeats] = await Promise.all([
    list('classes'),
    list('species'),
    list('backgrounds'),
    list('alignments'),
    feats(db),
  ]);
  const [classes, species, backgrounds, alignments] = await Promise.all([
    Promise.all(classIdx.filter((c) => CLASSES[c]).map((c) => fetchClass(db, c))),
    Promise.all(speciesIdx.map((s) => fetchSpecies(db, s))),
    Promise.all(bgIdx.map((b) => fetchBackground(db, b))),
    Promise.all(alignIdx.map((a) => fetchAlignment(db, a))),
  ]);
  return {
    classes: classes.filter((c) => !!c).map(({ raw: _raw, ...c }) => c),
    species: species.filter((s) => !!s).map(({ traitIndices: _t, subspecies: _s, ...s }) => s),
    backgrounds: backgrounds
      .filter((b) => !!b)
      .map(({ index, name, abilities, feat, skills }): BackgroundSummary => ({ index, name, abilities, feat, skills })),
    originFeats: allFeats.filter((f) => f.type === 'origin').map(({ index, name, description }) => ({ index, name, description })),
    alignments: alignments.filter((a) => !!a),
  };
}
