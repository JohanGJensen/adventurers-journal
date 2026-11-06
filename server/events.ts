import type { Database } from 'bun:sqlite';
import type { EventIn } from '../src/shared/types';

export function logEvents(db: Database, characterId: number, events: EventIn[]) {
  const q = db.query('INSERT INTO events (character_id, type, summary, data_json) VALUES (?, ?, ?, ?)');
  for (const e of events) q.run(characterId, e.type, e.summary, e.data === undefined ? null : JSON.stringify(e.data));
}
