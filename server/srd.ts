// dnd5eapi.co lookups, normalized for the UI and cached in srd_cache.
import type { Db } from './sqlite';
import { LOCAL_DETAILS } from '../src/data/supplement';
import type { ClassSpell, Detail, EquipmentInfo, Kind, LevelUpInfo, Pick } from '../src/shared/types';
import { parseJson } from './db';

const BASE = 'https://www.dnd5eapi.co/api';

export const KINDS: Kind[] = ['spells', 'equipment'];

/** "Healer's Kit" / "Cartographer’s Tools" -> "healers-kit" / "cartographers-tools" */
export const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const toList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split(/\n+/) : [];

/* eslint-disable @typescript-eslint/no-explicit-any */
function normalizeSpell(d: any): [string, string][] {
  const level = d.level === 0 ? `${d.school?.name ?? ''} cantrip` : `Level ${d.level} ${d.school?.name ?? ''}`;
  const comps = (d.components ?? []).join(', ') + (d.material ? ` (${d.material})` : '');
  return [
    ['Level', level.trim()],
    ['Casting time', d.casting_time],
    ['Range', d.range],
    ['Components', comps],
    ['Duration', (d.concentration && !/concentration/i.test(d.duration) ? 'Concentration, ' : '') + d.duration],
    ...(d.ritual ? ([['Ritual', 'Yes']] as [string, string][]) : []),
    ...(d.damage?.damage_type ? ([['Damage type', d.damage.damage_type.name]] as [string, string][]) : []),
  ].filter(([, v]) => v) as [string, string][];
}

function normalizeEquipment(d: any): [string, string][] {
  const meta: [string, string][] = [];
  const cats = (d.equipment_categories ?? (d.equipment_category ? [d.equipment_category] : []))
    .map((c: any) => c.name)
    .slice(0, 3);
  if (cats.length) meta.push(['Category', cats.join(', ')]);
  if (d.cost) meta.push(['Cost', `${d.cost.quantity} ${d.cost.unit}`]);
  if (d.weight) meta.push(['Weight', `${d.weight} lb`]);
  if (d.damage) meta.push(['Damage', `${d.damage.damage_dice} ${d.damage.damage_type?.name ?? ''}`]);
  if (d.two_handed_damage) meta.push(['Two-handed', `${d.two_handed_damage.damage_dice}`]);
  if (d.armor_class) meta.push(['Armor class', `${d.armor_class.base}${d.armor_class.dex_bonus ? ' + Dex' : ''}`]);
  if (d.properties?.length) meta.push(['Properties', d.properties.map((p: any) => p.name).join(', ')]);
  if (d.mastery) meta.push(['Mastery', d.mastery.name]);
  if (d.contents?.length)
    meta.push(['Contents', d.contents.map((c: any) => `${c.quantity}× ${c.item?.name ?? c.item?.index}`).join(', ')]);
  return meta;
}

function equipmentInfo(d: any): EquipmentInfo | undefined {
  const damage = d.damage?.damage_dice
    ? `${d.damage.damage_dice} ${(d.damage.damage_type?.name ?? '').toLowerCase()}`.trim()
    : undefined;
  let ac: string | undefined;
  if (d.armor_class) {
    const isShield = d.index === 'shield' || /shield/i.test(d.armor_category ?? '');
    if (isShield) ac = `+${d.armor_class.base} AC`;
    else
      ac = `AC ${d.armor_class.base}${d.armor_class.dex_bonus ? ` + DEX${d.armor_class.max_bonus != null ? ` (max ${d.armor_class.max_bonus})` : ''}` : ''}`;
  }
  if (!damage && !ac) return undefined;
  return {
    damage,
    versatile: d.two_handed_damage?.damage_dice,
    ac,
    properties: (d.properties ?? []).map((p: any) => String(p.name)).filter((n: string) => n !== 'Versatile'),
  };
}

export class UpstreamError extends Error {}

async function fetchVersion(kind: Kind, slug: string, version: '2024' | '2014'): Promise<Detail | null> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/${version}/${kind}/${slug}`);
  } catch (e) {
    throw new UpstreamError(`dnd5eapi.co unreachable: ${e instanceof Error ? e.message : e}`);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new UpstreamError(`dnd5eapi.co returned ${res.status}`);
  const d: any = await res.json();
  const paragraphs = [...toList(d.description ?? d.desc), ...toList(d.higher_level)].filter((p) => p.trim());
  return {
    name: d.name,
    spell:
      kind === 'spells'
        ? {
            level: d.level,
            school: d.school?.name ?? '',
            concentration: !!d.concentration,
            ritual: !!d.ritual,
            castingTime: d.casting_time ?? '',
            range: d.range ?? '',
          }
        : undefined,
    equipment: kind === 'equipment' ? equipmentInfo(d) : undefined,
    meta: kind === 'spells' ? normalizeSpell(d) : normalizeEquipment(d),
    paragraphs,
    source: version === '2024' ? '2024 SRD' : '2014 SRD',
  };
}

const readCache = (db: Db, kind: string, slug: string) =>
  db.query('SELECT data_json FROM srd_cache WHERE kind = ? AND slug = ?').get(kind, slug) as { data_json: string | null } | null;

const writeCache = (db: Db, kind: string, slug: string, value: unknown) =>
  db
    .query(
      `INSERT INTO srd_cache (kind, slug, data_json) VALUES (?, ?, ?)
       ON CONFLICT (kind, slug) DO UPDATE SET data_json = excluded.data_json, fetched_at = datetime('now')`,
    )
    .run(kind, slug, value == null ? null : JSON.stringify(value));

/** Local fallback → DB cache → 2024 SRD → 2014 SRD. Null when nothing is known (cached as a known miss). */
export async function getDetail(db: Db, kind: Kind, slug: string): Promise<Detail | null> {
  const local = LOCAL_DETAILS[slug];
  if (local) return { ...local, source: 'Local' };
  const cached = readCache(db, kind, slug);
  if (cached) return parseJson<Detail | null>(cached.data_json, null);
  const result = (await fetchVersion(kind, slug, '2024')) ?? (await fetchVersion(kind, slug, '2014'));
  writeCache(db, kind, slug, result);
  return result;
}

/**
 * GET `${BASE}${path}`, mapped and cached in srd_cache under (kind, slug). A 404 is cached as a known miss (null).
 * Cached entries are served without the network, so anything fetched once works offline.
 */
async function cachedFetch<T>(db: Db, kind: string, slug: string, path: string, map: (d: any) => T): Promise<T | null> {
  const cached = readCache(db, kind, slug);
  if (cached) return parseJson<T | null>(cached.data_json, null);
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`);
  } catch (e) {
    throw new UpstreamError(`dnd5eapi.co unreachable: ${e instanceof Error ? e.message : e}`);
  }
  if (res.status === 404) {
    writeCache(db, kind, slug, null);
    return null;
  }
  if (!res.ok) throw new UpstreamError(`dnd5eapi.co returned ${res.status}`);
  const value = map(await res.json());
  writeCache(db, kind, slug, value);
  return value;
}

/** The class's SRD spell list (2024, falling back to 2014). */
export async function getClassSpellList(db: Db, cls: string): Promise<ClassSpell[] | null> {
  const toSpells = (data: any): ClassSpell[] =>
    (data.results ?? []).map((r: any) => ({ index: r.index, name: r.name, level: r.level }));
  const cached = readCache(db, 'classlist', cls);
  if (cached) return parseJson<ClassSpell[] | null>(cached.data_json, null);
  const list =
    (await cachedFetch(db, 'classlist-2024', cls, `/2024/classes/${cls}/spells`, toSpells)) ??
    (await cachedFetch(db, 'classlist-2014', cls, `/2014/classes/${cls}/spells`, toSpells));
  writeCache(db, 'classlist', cls, list);
  return list;
}

type Text = { index: string; name: string; description: string };
const text = (d: any): Text => ({
  index: d.index,
  name: d.name,
  description: toList(d.description ?? d.desc).filter((p) => p.trim()).join('\n'),
});

/** Feature indices per level, from the 2024 class or subclass level table. */
const levelTable = (db: Db, kind: 'classlevels' | 'subclasslevels', slug: string, path: string) =>
  cachedFetch(db, kind, slug, path, (d: any[]): { level: number; features: string[] }[] =>
    d.map((l) => ({ level: l.level, features: (l.features ?? []).map((f: any) => f.index) })),
  );

const indexList = (d: any): string[] => (d.results ?? []).map((r: any) => r.index);

const features = (db: Db, indices: string[]) =>
  Promise.all(indices.map((i) => cachedFetch(db, 'feature', i, `/2024/features/${i}`, text))).then((xs) =>
    xs.filter((x): x is Text => !!x),
  );

const asPicks = (xs: (Text | null)[]): (Pick & { description: string })[] =>
  xs.filter((x): x is Text => !!x).map((x) => ({ index: x.index, name: x.name, description: x.description }));

type FeatRow = Text & { type: string; minLevel: number };

async function feats(db: Db): Promise<FeatRow[]> {
  const list = (await cachedFetch(db, 'srdlist', 'feats', '/2024/feats', indexList)) ?? [];
  const rows = await Promise.all(
    list.map((i) =>
      cachedFetch(db, 'feat', i, `/2024/feats/${i}`, (d): FeatRow => {
        const t = text(d);
        const pre = d.prerequisite_options?.desc;
        return {
          ...t,
          description: pre ? `Prerequisite: ${pre}.\n${t.description}` : t.description,
          type: d.type ?? '',
          minLevel: d.prerequisites?.minimum_level ?? 0,
        };
      }),
    ),
  );
  return rows.filter((x): x is FeatRow => !!x);
}

/**
 * Everything the level-up wizard needs for reaching `level`: class (and subclass) features with text,
 * and the options for whatever that level asks for. Which features ask for a choice is decided by the client
 * (LEVEL_CHOICES); this returns subclasses / feats / boons when the level has the matching feature.
 */
export async function getLevelUpInfo(db: Db, cls: string, level: number, subclass?: string): Promise<LevelUpInfo | null> {
  const table = await levelTable(db, 'classlevels', cls, `/2024/classes/${cls}/levels`);
  if (!table) return null;
  const indices = table.find((l) => l.level === level)?.features ?? [];
  const label = `${cls.charAt(0).toUpperCase()}${cls.slice(1)} ${level}`;
  const out: LevelUpInfo = { level, features: (await features(db, indices)).map((f) => ({ ...f, source: label })) };

  if (subclass) {
    const sub = await cachedFetch(db, 'subclass', subclass, `/2024/subclasses/${subclass}`, text);
    const subTable = sub && (await levelTable(db, 'subclasslevels', subclass, `/2024/subclasses/${subclass}/levels`));
    const subIdx = subTable?.find((l) => l.level === level)?.features ?? [];
    out.features.push(...(await features(db, subIdx)).map((f) => ({ ...f, source: `${sub!.name} ${level}` })));
  } else if (indices.includes(`${cls}-subclass`)) {
    const all =
(await cachedFetch(db, 'srdlist', 'subclasses', '/2024/subclasses', indexList)) ?? [];
    const details = await Promise.all(
      all.map((i) => cachedFetch(db, 'subclass', i, `/2024/subclasses/${i}`, (d) => ({ ...text(d), cls: d.class?.index as string }))),
    );
    out.subclasses = asPicks(details.filter((d) => d?.cls === cls));
  }

  if (indices.some((i) => i.endsWith('-ability-score-improvement'))) {
    out.feats = (await feats(db))
      .filter((f) => (f.type === 'general' || f.type === 'origin') && f.minLevel <= level && f.index !== 'ability-score-improvement')
      .map(({ index, name, description }) => ({ index, name, description }));
  }
  if (indices.some((i) => i.endsWith('-epic-boon'))) {
    out.boons = (await feats(db)).filter((f) => f.type === 'epic-boon').map(({ index, name, description }) => ({ index, name, description }));
  }
  return out;
}
