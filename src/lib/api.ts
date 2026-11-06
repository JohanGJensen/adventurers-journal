import { LOCAL_DETAILS } from '../data/supplement';

const BASE = 'https://www.dnd5eapi.co/api';

export type Kind = 'spells' | 'equipment';

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

/** "Healer's Kit" / "Cartographer’s Tools" -> "healers-kit" / "cartographers-tools" */
export const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const memory = new Map<string, Detail | null>();

function readCache(key: string): Detail | null | undefined {
  if (memory.has(key)) return memory.get(key);
  try {
    const v = localStorage.getItem(key);
    if (v !== null) return JSON.parse(v);
  } catch {
    /* storage unavailable */
  }
  return undefined;
}

function writeCache(key: string, value: Detail | null) {
  memory.set(key, value);
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

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

async function fetchVersion(kind: Kind, slug: string, version: '2024' | '2014'): Promise<Detail | null> {
  const res = await fetch(`${BASE}/${version}/${kind}/${slug}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API returned ${res.status}`);
  const d = await res.json();
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

/** Looks up 2024 SRD first, then 2014, then local fallback. Returns null when nothing is known. */
export async function lookup(kind: Kind, name: string): Promise<Detail | null> {
  const slug = slugify(name);
  const local = LOCAL_DETAILS[slug];
  if (local) return { ...local, source: 'Local' };

  const key = `dnd-api:v3:${kind}:${slug}`;
  const cached = readCache(key);
  if (cached !== undefined) return cached;

  const result = (await fetchVersion(kind, slug, '2024')) ?? (await fetchVersion(kind, slug, '2014'));
  writeCache(key, result);
  return result;
}

export interface ClassSpell {
  index: string;
  name: string;
  level: number;
}

const listMemory = new Map<string, ClassSpell[]>();

/** The class's spell list from the SRD (2024, falling back to 2014). Cached; falls back to a stale cache when offline. */
export async function fetchClassSpellList(cls: string): Promise<ClassSpell[]> {
  const key = `dnd-api:classlist:${cls}`;
  const mem = listMemory.get(key);
  if (mem) return mem;
  let stored: ClassSpell[] | null = null;
  try {
    const v = localStorage.getItem(key);
    if (v) stored = JSON.parse(v);
  } catch {
    /* storage unavailable */
  }
  if (stored) {
    listMemory.set(key, stored);
    return stored;
  }
  let res = await fetch(`${BASE}/2024/classes/${cls}/spells`);
  if (res.status === 404) res = await fetch(`${BASE}/2014/classes/${cls}/spells`);
  if (!res.ok) throw new Error(`API returned ${res.status}`);
  const data = await res.json();
  const list: ClassSpell[] = (data.results ?? []).map((r: any) => ({ index: r.index, name: r.name, level: r.level }));
  listMemory.set(key, list);
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
  return list;
}

/** Spell level from an already-fetched class list, if known. */
export function cachedSpellLevel(cls: string, name: string): number | undefined {
  const key = `dnd-api:classlist:${cls}`;
  let list = listMemory.get(key);
  if (!list) {
    try {
      const v = localStorage.getItem(key);
      if (v) listMemory.set(key, (list = JSON.parse(v) as ClassSpell[]));
    } catch {
      /* storage unavailable */
    }
  }
  return list?.find((s) => s.name.toLowerCase() === name.toLowerCase())?.level;
}
