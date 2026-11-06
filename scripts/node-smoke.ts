// Runs the bundled server code on Node (Electron's own Node via `bun run desktop:smoke`), to check
// that what the desktop app ships works: migrations embedded as text, node:sqlite, the API, imports.
import assert from 'node:assert/strict';
import { createApp } from '../server/app';
import { openDb } from '../server/db';
import { importLocalData } from '../server/import';
import { seedIfEmpty } from '../server/seed';

assert.ok(!process.versions.bun, 'run this under Node/Electron, not Bun');
const db = openDb(':memory:');
assert.equal(seedIfEmpty(db), 1);
const app = createApp(db, [], { origin: 'app://dnd' });
const call = async (method: string, path: string, body?: unknown) => {
  const res = await app.fetch(
    new Request(`app://dnd/api${path}`, {
      method,
      headers: { origin: 'app://dnd' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  return { status: res.status, body: (await res.json()) as any };
};

const list = await call('GET', '/characters');
assert.equal(list.status, 200);
assert.equal(list.body[0].name, 'Faelan Mosswalker');

const { state } = (await call('GET', '/characters/1/play')).body;
assert.deepEqual(await call('PUT', '/characters/1/play', { state: { ...state, hp: 3 }, version: 0 }), {
  status: 200,
  body: { version: 1 },
});
assert.equal((await call('GET', '/characters/1/play')).body.state.hp, 3);

const payload = {
  format: 'dnd-tool/local-export',
  version: 1,
  exportedAt: '2026-11-01T00:00:00Z',
  playState: { hp: 4 },
  inventory: { coins: { gp: 15 }, items: [{ id: 'a', name: 'Rope', qty: 2, equipped: true }] },
} as const;
const opts = { characterId: 1, source: 'cli' as const, force: true };
assert.equal(importLocalData(db, payload as any, opts).status, 'imported');
assert.equal(importLocalData(db, payload as any, opts).status, 'already');
assert.deepEqual((await call('GET', '/characters/1/inventory')).body.items, [{ id: 'a', name: 'Rope', qty: 2, equipped: true }]);

console.log(`node-smoke ok (node ${process.versions.node}${process.versions.electron ? `, electron ${process.versions.electron}` : ''})`);
