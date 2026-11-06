// SRD lookups via the local server (which caches dnd5eapi.co in SQLite). Memoized per page load.
import { LOCAL_DETAILS } from '../data/supplement';
import type { ClassSpell, Detail, Kind } from '../shared/types';
import { api } from './client';

export type { ClassSpell, Detail, EquipmentInfo, Kind, SpellInfo } from '../shared/types';

/** "Healer's Kit" / "Cartographer’s Tools" -> "healers-kit" / "cartographers-tools" */
export const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const memory = new Map<string, Detail | null>();

/** Looks up 2024 SRD first, then 2014, then local fallback. Returns null when nothing is known. */
export async function lookup(kind: Kind, name: string): Promise<Detail | null> {
  const slug = slugify(name);
  const local = LOCAL_DETAILS[slug];
  if (local) return { ...local, source: 'Local' };
  const key = `${kind}:${slug}`;
  if (memory.has(key)) return memory.get(key)!;
  const r = await api<Detail>('GET', `/srd/${kind}/${slug}`);
  if (r.status === 404) {
    memory.set(key, null);
    return null;
  }
  if (r.error !== undefined) throw new Error(r.error);
  memory.set(key, r.data);
  return r.data;
}

const listMemory = new Map<string, ClassSpell[]>();

/** The class's spell list from the SRD (2024, falling back to 2014). */
export async function fetchClassSpellList(cls: string): Promise<ClassSpell[]> {
  const mem = listMemory.get(cls);
  if (mem) return mem;
  const r = await api<ClassSpell[]>('GET', `/srd/classlist/${cls}`);
  if (r.error !== undefined) throw new Error(r.error);
  listMemory.set(cls, r.data);
  return r.data;
}

/** Spell level from an already-fetched class list, if known. */
export function cachedSpellLevel(cls: string, name: string): number | undefined {
  return listMemory.get(cls)?.find((s) => s.name.toLowerCase() === name.toLowerCase())?.level;
}
