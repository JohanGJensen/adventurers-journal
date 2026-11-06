import type { Db } from './sqlite';
import { buildCharacter, type Character } from '../src/lib/character';
import { homebrewId, type CharacterDto, type CharacterExtras, type CharacterSummary, type LevelChoice } from '../src/shared/types';
import { findHomebrew } from './homebrew';
import { parseJson } from './db';
import { HttpError } from './http';

interface Row {
  id: number;
  campaign_id: number | null;
  name: string;
  sheet_json: string;
  extras_json: string;
  levels_json: string;
  seed_key: string | null;
}

/** The homebrew subclass the levels link to (the latest subclass pick wins), at its current version. */
export function homebrewFor(db: Db, levels: LevelChoice[]) {
  const id = homebrewId([...levels].reverse().find((l) => l.subclass)?.subclass?.index);
  return id === null ? null : findHomebrew(db, id);
}

const toDto = (db: Db, r: Row): CharacterDto => {
  const levels = parseJson<LevelChoice[]>(r.levels_json, []);
  return {
    id: r.id,
    name: r.name,
    campaignId: r.campaign_id,
    seedKey: r.seed_key,
    sheet: JSON.parse(r.sheet_json),
    extras: parseJson<CharacterExtras>(r.extras_json, {}),
    levels,
    homebrew: homebrewFor(db, levels),
  };
};

/** Derives the sheet from a stored character. */
export const deriveDto = (dto: CharacterDto): Character => buildCharacter(dto.sheet, dto.extras, dto.levels, dto.homebrew);

export function getCharacter(db: Db, id: number): CharacterDto {
  const r = db.query('SELECT * FROM characters WHERE id = ?').get(id) as Row | null;
  if (!r) throw new HttpError(404, `No character ${id}`);
  return toDto(db, r);
}

/** The derived sheet, for server-side defaults (fresh play state, seeded inventory). */
export function deriveCharacter(db: Db, id: number): Character {
  return deriveDto(getCharacter(db, id));
}

export function listCharacters(db: Db): CharacterSummary[] {
  const rows = db.query('SELECT * FROM characters ORDER BY id').all() as Row[];
  return rows.map((r) => {
    const dto = toDto(db, r);
    let subtitle = '';
    try {
      const c = deriveDto(dto);
      subtitle = `${c.race} · ${c.className} ${c.level}`;
    } catch {
      subtitle = 'Invalid sheet';
    }
    return { id: r.id, name: r.name, campaignId: r.campaign_id, seedKey: r.seed_key, portrait: dto.extras.portrait ?? null, subtitle };
  });
}

/** Adds a character from a sheet export. Throws 400 if buildCharacter can't derive it. */
export function insertCharacter(
  db: Db,
  sheet: unknown,
  opts: { campaignId?: number | null; extras?: CharacterExtras; seedKey?: string } = {},
): number {
  const one = Array.isArray(sheet) ? sheet[0] : sheet;
  let c: Character;
  try {
    c = buildCharacter(one, opts.extras ?? {});
  } catch (e) {
    throw new HttpError(400, `Invalid character sheet: ${e instanceof Error ? e.message : String(e)}`);
  }
  const row = db
    .query(
      `INSERT INTO characters (campaign_id, name, sheet_json, extras_json, seed_key)
       VALUES (?, ?, ?, ?, ?) RETURNING id`,
    )
    .get(opts.campaignId ?? null, c.name || 'Unnamed', JSON.stringify(one), JSON.stringify(opts.extras ?? {}), opts.seedKey ?? null) as {
    id: number;
  };
  return row.id;
}

/** Resolves "--character 3" or "--character Faelan". */
export function findCharacter(db: Db, ref: string): number | null {
  if (/^\d+$/.test(ref)) {
    const r = db.query('SELECT id FROM characters WHERE id = ?').get(Number(ref)) as { id: number } | null;
    return r?.id ?? null;
  }
  const rows = db.query('SELECT id FROM characters WHERE lower(name) LIKE ?').all(`%${ref.toLowerCase()}%`) as { id: number }[];
  return rows.length === 1 ? rows[0].id : null;
}
