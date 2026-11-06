// Locking in and undoing level-ups. Each runs in one transaction with the matching play-state change.
import type { Db } from './sqlite';
import { buildCharacter, type Character } from '../src/lib/character';
import { MAX_LEVEL } from '../src/lib/rules';
import { homebrewId, type CharacterDto, type HomebrewSubclass, type LevelChoice, type PlayState } from '../src/shared/types';
import { findHomebrew } from './homebrew';
import { deriveDto, getCharacter, homebrewFor } from './characters';
import { HttpError } from './http';
import { readPlay, writePlay } from './play';
import { asLevelChoice, bad, isObj } from './validate';

export interface LevelResult {
  character: CharacterDto;
  play: { state: PlayState; version: number };
}

const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 100 && v.every((x) => typeof x === 'string');

function derive(dto: CharacterDto, levels: LevelChoice[], homebrew: HomebrewSubclass | null): Character {
  try {
    return buildCharacter(dto.sheet, dto.extras, levels, homebrew);
  } catch (e) {
    throw new HttpError(400, `Level-up doesn't fit the sheet: ${e instanceof Error ? e.message : e}`);
  }
}

const saveLevels = (db: Db, id: number, levels: LevelChoice[]) =>
  db.query(`UPDATE characters SET levels_json = ?, updated_at = datetime('now') WHERE id = ?`).run(JSON.stringify(levels), id);

/** Keeps play state inside what the (new) level allows. */
const fit = (s: PlayState, c: Character): PlayState => ({
  ...s,
  hp: Math.max(0, Math.min(c.hitPoints, s.hp)),
  hitDiceUsed: Math.min(c.level, s.hitDiceUsed),
  wildShapeUsed: Math.min(c.wildShapeUses, s.wildShapeUsed),
  chosenCantrips: s.chosenCantrips.slice(0, c.cantripCap),
  prepared: s.prepared.slice(0, c.preparedCap),
  variant: c.subclass ? s.variant : null,
  resourcesUsed: Object.fromEntries(
    c.resources.map((r) => [r.key, Math.min(r.max, s.resourcesUsed[r.key] ?? 0)]).filter(([, n]) => n),
  ),
});

/**
 * Body: { choice: LevelChoice, spells?: { chosenCantrips, prepared }, variant?: string | null }.
 * Appends the level, adds the max-HP gain to current HP, and sets the spell picks made in the wizard.
 */
export function levelUp(db: Db, id: number, body: unknown): LevelResult {
  if (!isObj(body)) bad('Body must be { choice, spells?, variant? }');
  const b = body as Record<string, unknown>;
  return db.transaction(() => {
    const dto = getCharacter(db, id);
    const before = deriveDto(dto);
    if (before.level >= MAX_LEVEL) bad(`Already level ${MAX_LEVEL}`);
    const choice = asLevelChoice(b.choice, before.level + 1, before.rules.hitDie);
    let homebrew: HomebrewSubclass | null = dto.homebrew;
    if (choice.subclass) {
      const hid = homebrewId(choice.subclass.index);
      homebrew = hid === null ? null : findHomebrew(db, hid);
      if (hid === null && choice.subclass.homebrew) bad('A homebrew subclass index must be homebrew-<id>');
      if (hid !== null) {
        if (!homebrew) bad(`No homebrew subclass ${hid}`);
        const h = homebrew!;
        if (h.classKey !== before.classKey) bad(`${h.name} is a ${h.classKey} subclass, not ${before.classKey}`);
        choice.subclass = { index: choice.subclass.index, name: h.name, homebrew: true };
      }
    }
    const levels = [...dto.levels, choice];
    const after = derive(dto, levels, homebrew);
    saveLevels(db, id, levels);

    const { state } = readPlay(db, id); // normalized to the new level: slots padded
    let next: PlayState = { ...state, hp: state.hp + (after.hitPoints - before.hitPoints) };
    if (b.spells !== undefined) {
      const sp = b.spells;
      if (!isObj(sp) || !isStrArr(sp.chosenCantrips) || !isStrArr(sp.prepared)) bad('spells must be { chosenCantrips, prepared }');
      const { chosenCantrips, prepared } = sp as { chosenCantrips: string[]; prepared: string[] };
      if (chosenCantrips.length > after.cantripCap) bad(`At most ${after.cantripCap} cantrips at level ${after.level}`);
      if (prepared.length > after.preparedCap) bad(`At most ${after.preparedCap} prepared spells at level ${after.level}`);
      next = { ...next, chosenCantrips, prepared };
    }
    if (b.variant !== undefined) {
      if (b.variant !== null && (typeof b.variant !== 'string' || b.variant.length > 60)) bad('variant must be a string or null');
      next.variant = b.variant as string | null;
    }
    next = fit(next, after);
    const version = writePlay(db, id, next, [
      {
        type: 'level',
        summary: `Reached level ${after.level} (max HP ${before.hitPoints} → ${after.hitPoints})`,
        data: choice,
      },
    ]);
    return { character: getCharacter(db, id), play: { state: next, version } };
  })();
}

/** Removes the most recent level-up and fits play state to the level below. */
export function undoLevel(db: Db, id: number): LevelResult {
  return db.transaction(() => {
    const dto = getCharacter(db, id);
    if (!dto.levels.length) bad('No level-ups to undo');
    const removed = dto.levels.at(-1)!;
    const levels = dto.levels.slice(0, -1);
    const before = deriveDto(dto);
    const after = derive(dto, levels, homebrewFor(db, levels));
    saveLevels(db, id, levels);
    const { state } = readPlay(db, id);
    const next = fit({ ...state, hp: state.hp - (before.hitPoints - after.hitPoints) }, after);
    const version = writePlay(db, id, next, [
      { type: 'level', summary: `Undid level ${removed.level} (back to level ${after.level})`, data: removed },
    ]);
    return { character: getCharacter(db, id), play: { state: next, version } };
  })();
}
