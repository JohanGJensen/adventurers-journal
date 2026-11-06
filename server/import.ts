// The one localStorage import code path, used by POST /api/import/local and scripts/import-local.ts.
import { createHash } from 'node:crypto';
import type { Db } from './sqlite';
import { newId, normalizeInventory, normalizePlayState } from '../src/shared/state';
import type { Inventory, LocalExport, PlayState } from '../src/shared/types';
import { deriveCharacter } from './characters';
import { logEvents } from './events';
import { HttpError } from './http';
import { readInventory, writeCoins, writeItems } from './inventory';
import { readPlay, writePlay } from './play';
import { isObj } from './validate';

export interface StateSummary {
  hp: number;
  tempHp: number;
  slotsUsed: number[];
  conditions: string[];
  items: number;
  units: number;
  coins: Inventory['coins'];
}

export interface ImportResult {
  status: 'imported' | 'already' | 'conflict';
  hash: string;
  before: StateSummary;
  after: StateSummary;
}

export interface ImportOpts {
  characterId: number;
  force?: boolean;
  dryRun?: boolean;
  source: 'browser' | 'cli';
}

const summarize = (p: PlayState, inv: Inventory): StateSummary => ({
  hp: p.hp,
  tempHp: p.tempHp,
  slotsUsed: p.slotsUsed,
  conditions: p.conditions,
  items: inv.items.length,
  units: inv.items.reduce((n, x) => n + x.qty, 0),
  coins: inv.coins,
});

/** JSON with sorted keys, so equal payloads hash equally. */
const canonical = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(canonical).join(',')}]`
    : isObj(v)
      ? `{${Object.keys(v)
          .sort()
          .filter((k) => v[k] !== undefined)
          .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
          .join(',')}}`
      : JSON.stringify(v);

export function validateExport(payload: unknown): LocalExport {
  if (!isObj(payload) || payload.format !== 'dnd-tool/local-export')
    throw new HttpError(400, 'Not a dnd-tool local export (format must be "dnd-tool/local-export")');
  if (payload.version !== 1) throw new HttpError(400, `Unsupported export version ${String(payload.version)}`);
  if (payload.playState !== undefined && !isObj(payload.playState)) throw new HttpError(400, 'playState must be an object');
  if (payload.inventory !== undefined && !isObj(payload.inventory)) throw new HttpError(400, 'inventory must be an object');
  if (payload.playState === undefined && payload.inventory === undefined) throw new HttpError(400, 'Export contains no data');
  return payload as unknown as LocalExport;
}

export const payloadHash = (p: LocalExport) =>
  createHash('sha256').update(canonical({ playState: p.playState ?? null, inventory: p.inventory ?? null })).digest('hex');

/** True once the character has state a player made: saved play state or any logged event. */
const hasUserData = (db: Db, cid: number) =>
  !!db.query('SELECT 1 FROM play_state WHERE character_id = ?').get(cid) ||
  !!db.query('SELECT 1 FROM events WHERE character_id = ? LIMIT 1').get(cid);

class Rollback extends Error {}

export function importLocalData(db: Db, raw: unknown, opts: ImportOpts): ImportResult {
  const payload = validateExport(raw);
  const cid = opts.characterId;
  const c = deriveCharacter(db, cid);
  const hash = payloadHash(payload);

  const play = normalizePlayState(c, payload.playState);
  const current = readPlay(db, cid);
  const run = () => {
    const before = summarize(current.state, readInventory(db, cid));
    // A missing section keeps what the server has.
    const inv = payload.inventory ? normalizeInventory(c, payload.inventory, newId) : readInventory(db, cid);
    const after = summarize(payload.playState ? play : current.state, inv);
    if (db.query('SELECT 1 FROM imports WHERE character_id = ? AND payload_hash = ?').get(cid, hash))
      return { status: 'already' as const, hash, before, after };
    if (!opts.force && hasUserData(db, cid)) return { status: 'conflict' as const, hash, before, after };

    if (payload.playState) writePlay(db, cid, play, []);
    if (payload.inventory) {
      writeCoins(db, cid, inv.coins);
      writeItems(db, cid, inv.items);
    }
    logEvents(db, cid, [
      {
        type: 'import',
        summary: `Imported local data from ${opts.source === 'cli' ? 'a file' : 'this browser'}${opts.force ? ' (overwrote server data)' : ''}`,
        data: { hash, before, after, exportedAt: payload.exportedAt },
      },
    ]);
    db.query('INSERT INTO imports (character_id, source, payload_hash) VALUES (?, ?, ?)').run(cid, opts.source, hash);
    return { status: 'imported' as const, hash, before, after };
  };

  if (!opts.dryRun) return db.transaction(run)();
  let result!: ImportResult;
  try {
    db.transaction(() => {
      result = run();
      throw new Rollback();
    })();
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  return result;
}
