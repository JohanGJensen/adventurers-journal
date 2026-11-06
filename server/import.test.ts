import { describe, expect, test } from 'bun:test';
import { createApp } from './app';
import { openDb } from './db';
import { importLocalData } from './import';
import { readInventory } from './inventory';
import { readPlay } from './play';
import { seedIfEmpty } from './seed';

const payload = (over: Record<string, unknown> = {}) => ({
  format: 'dnd-tool/local-export',
  version: 1,
  exportedAt: '2026-11-01T00:00:00Z',
  playState: { hp: 4, tempHp: 2, slotsUsed: [1], conditions: ['Prone'] },
  inventory: { coins: { gp: 15 }, items: [{ id: 'a', name: 'Rope', qty: 2, equipped: false }] },
  ...over,
});

function setup() {
  const db = openDb(':memory:');
  seedIfEmpty(db);
  return db;
}
const opts = { characterId: 1, source: 'cli' as const };
const count = (db: ReturnType<typeof openDb>, sql: string) => (db.query(sql).get() as { n: number }).n;

describe('importLocalData', () => {
  test('fresh import writes state, items, an event and an imports row', () => {
    const db = setup();
    const r = importLocalData(db, payload(), opts);
    expect(r.status).toBe('imported');
    expect(readPlay(db, 1).state).toMatchObject({ hp: 4, tempHp: 2, conditions: ['Prone'] });
    const inv = readInventory(db, 1);
    expect(inv.coins).toEqual({ cp: 0, sp: 0, ep: 0, gp: 15, pp: 0 });
    expect(inv.items).toEqual([{ id: 'a', name: 'Rope', qty: 2, equipped: false }]);
    expect(count(db, "SELECT count(*) AS n FROM events WHERE type='import'")).toBe(1);
    expect(count(db, 'SELECT count(*) AS n FROM imports')).toBe(1);
  });

  test('old payloads missing fields get defaults', () => {
    const db = setup();
    importLocalData(db, payload(), opts);
    const s = readPlay(db, 1).state;
    expect(s.deathSaves).toEqual({ success: 0, fail: 0 });
    expect(s.chosenCantrips.length).toBeGreaterThan(0);
    expect(s.goodberryUsed).toBe(false);
  });

  test('same payload again is "already" (exportedAt ignored)', () => {
    const db = setup();
    importLocalData(db, payload(), opts);
    expect(importLocalData(db, payload({ exportedAt: 'later' }), opts).status).toBe('already');
    expect(count(db, 'SELECT count(*) AS n FROM imports')).toBe(1);
  });

  test('conflict without force changes nothing; force overwrites', () => {
    const db = setup();
    importLocalData(db, payload(), opts);
    const other = payload({ playState: { hp: 9 } });
    expect(importLocalData(db, other, opts).status).toBe('conflict');
    expect(readPlay(db, 1).state.hp).toBe(4);
    expect(importLocalData(db, other, { ...opts, force: true }).status).toBe('imported');
    expect(readPlay(db, 1).state.hp).toBe(9);
  });

  test('lazily seeded inventory alone is not a conflict', () => {
    const db = setup();
    readInventory(db, 1);
    expect(importLocalData(db, payload(), opts).status).toBe('imported');
  });

  test('dry run reports but writes nothing', () => {
    const db = setup();
    const r = importLocalData(db, payload(), { ...opts, dryRun: true });
    expect(r.status).toBe('imported');
    expect(r.after.hp).toBe(4);
    expect(count(db, 'SELECT count(*) AS n FROM play_state')).toBe(0);
    expect(count(db, 'SELECT count(*) AS n FROM imports')).toBe(0);
  });

  test('invalid payloads throw 400', () => {
    const db = setup();
    expect(() => importLocalData(db, { format: 'x' }, opts)).toThrow(/local export/);
    expect(() => importLocalData(db, payload({ version: 2 }), opts)).toThrow(/version/);
  });

  test('POST /api/import/local maps statuses', async () => {
    const db = setup();
    const app = createApp(db);
    const post = (b: unknown) =>
      app.fetch(new Request('http://x/api/import/local', { method: 'POST', body: JSON.stringify(b) }));
    expect((await post({ characterId: 1, payload: payload() })).status).toBe(200);
    expect(((await (await post({ characterId: 1, payload: payload() })).json()) as any).already).toBe(true);
    expect((await post({ characterId: 1, payload: payload({ playState: { hp: 1 } }) })).status).toBe(409);
    expect((await post({ characterId: 1, payload: payload({ playState: { hp: 1 } }), force: true })).status).toBe(200);
  });
});
