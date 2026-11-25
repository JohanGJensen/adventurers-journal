import type { Db } from '../sqlite';
import { emptyLore, TRAIT_KINDS, type Lore } from '../../src/shared/types';
import { getCharacter } from '../characters';
import { parseJson } from '../db';
import { body, intParam, json, type Route } from '../http';
import { asLore } from '../validate';

/** The stored lore, or an empty document when the character has none yet. */
export function getLore(db: Db, characterId: number): Lore {
  const r = db.query('SELECT data_json, updated_at FROM character_lore WHERE character_id = ?').get(characterId) as
    | { data_json: string; updated_at: string }
    | null;
  const lore = emptyLore();
  if (!r) return lore;
  const d = parseJson<Partial<Lore>>(r.data_json, {});
  return {
    sections: d.sections ?? [],
    traits: Object.fromEntries(TRAIT_KINDS.map((k) => [k, d.traits?.[k] ?? []])) as Lore['traits'],
    updatedAt: r.updated_at,
  };
}

/** Replaces a character's lore (already validated) and returns what is stored. */
export function saveLore(db: Db, characterId: number, lore: Omit<Lore, 'updatedAt'>): Lore {
  db.query(
    `INSERT INTO character_lore (character_id, data_json) VALUES (?, ?)
     ON CONFLICT(character_id) DO UPDATE SET data_json = excluded.data_json, updated_at = datetime('now')`,
  ).run(characterId, JSON.stringify({ sections: lore.sections, traits: lore.traits }));
  return getLore(db, characterId);
}

/** Whether the character has any lore written (a saved but empty document doesn't count). */
export function hasLore(db: Db, characterId: number): boolean {
  const l = getLore(db, characterId);
  return l.sections.length > 0 || TRAIT_KINDS.some((k) => l.traits[k].length > 0);
}

export const loreRoutes: Route[] = [
  [
    'GET',
    '/api/characters/:id/lore',
    ({ db, params }) => {
      const id = getCharacter(db, intParam(params.id, 'character id')).id;
      return json(getLore(db, id));
    },
  ],
  [
    'PUT',
    '/api/characters/:id/lore',
    async ({ db, params, req }) => {
      const id = getCharacter(db, intParam(params.id, 'character id')).id;
      return json(saveLore(db, id, asLore(await body(req))));
    },
  ],
];
