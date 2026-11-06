import { describe, expect, test } from 'bun:test';
import { createApp } from './app';
import { openDb } from './db';
import { seedIfEmpty } from './seed';

function setup() {
  const db = openDb(':memory:');
  seedIfEmpty(db);
  const app = createApp(db);
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.fetch(
      new Request(`http://x/api${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) }),
    );
    return { status: res.status, body: (await res.json()) as any };
  };
  return { db, call };
}

describe('play state', () => {
  test('GET returns fresh state at version 0 without inserting', async () => {
    const { db, call } = setup();
    const r = await call('GET', '/characters/1/play');
    expect(r.status).toBe(200);
    expect(r.body.version).toBe(0);
    expect(r.body.state.hp).toBeGreaterThan(0);
    expect(db.query('SELECT count(*) AS n FROM play_state').get()).toEqual({ n: 0 });
  });

  test('PUT bumps version and logs events; stale version is 409', async () => {
    const { db, call } = setup();
    const { state } = (await call('GET', '/characters/1/play')).body;
    const put = await call('PUT', '/characters/1/play', {
      state: { ...state, hp: 3 },
      version: 0,
      events: [{ type: 'damage', summary: 'Took 5 damage' }, { type: 'condition', summary: 'Gained Prone' }],
    });
    expect(put).toEqual({ status: 200, body: { version: 1 } });
    expect(db.query('SELECT type, summary FROM events ORDER BY id').all()).toEqual([
      { type: 'damage', summary: 'Took 5 damage' },
      { type: 'condition', summary: 'Gained Prone' },
    ]);
    const stale = await call('PUT', '/characters/1/play', { state: { ...state, hp: 1 }, version: 0 });
    expect(stale.status).toBe(409);
    expect(stale.body.version).toBe(1);
    expect(stale.body.state.hp).toBe(3);
    expect((await call('GET', '/characters/1/play')).body.state.hp).toBe(3);
  });

  test('PUT rejects malformed state and unknown characters', async () => {
    const { call } = setup();
    expect((await call('PUT', '/characters/1/play', { state: { hp: 'x' }, version: 0 })).status).toBe(400);
    expect((await call('GET', '/characters/99/play')).status).toBe(404);
  });

  test('reset writes fresh state', async () => {
    const { call } = setup();
    const { state } = (await call('GET', '/characters/1/play')).body;
    await call('PUT', '/characters/1/play', { state: { ...state, hp: 0 }, version: 0 });
    const r = await call('POST', '/characters/1/play/reset');
    expect(r.body.version).toBe(2);
    expect(r.body.state.hp).toBe(state.hp);
  });
});

describe('inventory', () => {
  test('first GET seeds from the sheet', async () => {
    const { call } = setup();
    const r = await call('GET', '/characters/1/inventory');
    expect(r.body.items.length).toBeGreaterThan(0);
    expect(r.body.items.every((x: any) => x.qty === 1 && !x.equipped)).toBe(true);
  });

  test('add merges into an unequipped same-named row, with client id for new rows', async () => {
    const { call, db } = setup();
    await call('GET', '/characters/1/inventory');
    let r = await call('POST', '/characters/1/items', { name: 'Rope', qty: 2, id: 'client-1' });
    expect(r.body.items.at(-1)).toEqual({ id: 'client-1', name: 'Rope', qty: 2, equipped: false });
    r = await call('POST', '/characters/1/items', { name: 'rope' });
    expect(r.body.items.filter((x: any) => x.name === 'Rope')).toEqual([{ id: 'client-1', name: 'Rope', qty: 3, equipped: false }]);
    expect((db.query("SELECT summary FROM events WHERE type='item'").all() as any[]).map((e) => e.summary)).toEqual([
      'Added Rope ×2',
      'Added rope',
    ]);
  });

  test('move: split, merge, last-unit merge removes source, last unit without dest flips', async () => {
    const { call } = setup();
    await call('POST', '/characters/1/inventory/reset');
    await call('POST', '/characters/1/items', { name: 'Dart', qty: 2, id: 'dart' });
    const darts = (items: any[]) => items.filter((x) => x.name === 'Dart').map(({ qty, equipped }) => ({ qty, equipped }));

    let r = await call('POST', '/characters/1/items/dart/move', { newId: 'dart-eq' }); // split
    expect(darts(r.body.items)).toEqual([{ qty: 1, equipped: false }, { qty: 1, equipped: true }]);
    r = await call('POST', '/characters/1/items/dart/move'); // last unit merges into the equipped row
    expect(darts(r.body.items)).toEqual([{ qty: 2, equipped: true }]);
    expect(r.body.items.some((x: any) => x.id === 'dart')).toBe(false);

    await call('PATCH', '/characters/1/items/dart-eq', { qty: 1 });
    r = await call('POST', '/characters/1/items/dart-eq/move'); // last unit, no dest: flips in place
    expect(r.body.items.find((x: any) => x.id === 'dart-eq')).toMatchObject({ qty: 1, equipped: false });
  });

  test('patch, delete, coins and 404s', async () => {
    const { call, db } = setup();
    await call('GET', '/characters/1/inventory');
    await call('POST', '/characters/1/items', { name: 'Torch', id: 't' });
    let r = await call('PATCH', '/characters/1/items/t', { qty: 5, name: '  ' });
    expect(r.body.items.find((x: any) => x.id === 't')).toEqual({ id: 't', name: 'Torch', qty: 5, equipped: false });
    r = await call('DELETE', '/characters/1/items/t');
    expect(r.body.items.some((x: any) => x.id === 't')).toBe(false);
    expect((await call('DELETE', '/characters/1/items/t')).status).toBe(404);
    r = await call('PUT', '/characters/1/coins', { cp: 1, sp: 0, ep: 0, gp: 20, pp: 0 });
    expect(r.body.coins).toEqual({ cp: 1, sp: 0, ep: 0, gp: 20, pp: 0 });
    expect((await call('PUT', '/characters/1/coins', { cp: -1, sp: 0, ep: 0, gp: 0, pp: 0 })).status).toBe(400);
    const last = db.query("SELECT summary FROM events WHERE type='coins'").get() as any;
    expect(last.summary).toContain('cp 0 → 1');
  });
});
