import type { Database } from 'bun:sqlite';
import { normalizePlayState } from '../src/shared/state';
import type { EventIn, PlayState } from '../src/shared/types';
import { deriveCharacter } from './characters';
import { parseJson } from './db';
import { logEvents } from './events';

export function readPlay(db: Database, characterId: number): { state: PlayState; version: number; stored: boolean } {
  const c = deriveCharacter(db, characterId);
  const row = db.query('SELECT state_json, version FROM play_state WHERE character_id = ?').get(characterId) as
    | { state_json: string; version: number }
    | null;
  if (!row) return { state: normalizePlayState(c), version: 0, stored: false };
  return { state: normalizePlayState(c, parseJson(row.state_json, {})), version: row.version, stored: true };
}

/** Upserts play state at version+1 and logs events. Call inside a transaction. */
export function writePlay(db: Database, characterId: number, state: PlayState, events: EventIn[]): number {
  const row = db
    .query(
      `INSERT INTO play_state (character_id, state_json, version) VALUES (?, ?, 1)
       ON CONFLICT (character_id) DO UPDATE SET state_json = excluded.state_json, version = version + 1, updated_at = datetime('now')
       RETURNING version`,
    )
    .get(characterId, JSON.stringify(state)) as { version: number };
  logEvents(db, characterId, events);
  return row.version;
}
