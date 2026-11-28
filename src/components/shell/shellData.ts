// What the sidebar needs to know, fetched once and shared by every character page: the list of characters (for the
// switcher) and whether this character can keep a journey map. Pages call refreshShell() after changing a character
// (a new portrait, a level) so the sidebar catches up.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { api } from '../../lib/client';
import { buildCharacter } from '../../lib/character';
import { hasTool } from '../../data/tools';
import type { CharacterDto, CharacterSummary } from '../../shared/types';

const cache = new Map<string, Promise<unknown>>();
let version = 0;
const listeners = new Set<() => void>();

const get = <T,>(url: string): Promise<T | null> => {
  let p = cache.get(url) as Promise<T | null> | undefined;
  if (!p) {
    p = api<T>('GET', url).then((r) => r.data ?? null);
    cache.set(url, p);
  }
  return p;
};

/** Forget what the sidebar fetched, so it loads fresh. */
export function refreshShell() {
  cache.clear();
  version++;
  listeners.forEach((l) => l());
}

const useVersion = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );

export function useCharacters(): CharacterSummary[] | null {
  const v = useVersion();
  const [list, setList] = useState<CharacterSummary[] | null>(null);
  useEffect(() => {
    let live = true;
    get<CharacterSummary[]>('/characters').then((l) => live && setList(l));
    return () => {
      live = false;
    };
  }, [v]);
  return list;
}

/** What decides the sidebar's links for this character: a Journey map (Cartographer's Tools, the map page's own
 * check) and a Spells tab (any spells at all, the sheet's own check). */
export function useCharacterFacts(id: number): { hasMap: boolean; hasSpells: boolean } {
  const v = useVersion();
  const [facts, setFacts] = useState({ hasMap: false, hasSpells: false });
  useEffect(() => {
    let live = true;
    get<CharacterDto>(`/characters/${id}`).then((dto) => {
      if (!live || !dto) return;
      try {
        const c = buildCharacter(dto.sheet, dto.extras, dto.levels, dto.homebrew);
        setFacts({
          hasMap: hasTool(c.tools, "Cartographer's Tools"),
          hasSpells: c.spellAbility !== null || c.spells.length > 0 || c.bonusSpells.length > 0,
        });
      } catch {
        setFacts({ hasMap: false, hasSpells: false });
      }
    });
    return () => {
      live = false;
    };
  }, [id, v]);
  return facts;
}
