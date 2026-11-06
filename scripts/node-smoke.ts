// Runs the bundled server code on Node (Electron's own Node via `bun run desktop:smoke`), to check
// that what the desktop app ships works: migrations embedded as text, node:sqlite, the API, backups.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { APP_ORIGIN, createApp } from '../server/app';
import { backup } from '../server/backup';
import { openDb } from '../server/db';
import { seedIfEmpty } from '../server/seed';

assert.ok(!process.versions.bun, 'run this under Node/Electron, not Bun');
const db = openDb(':memory:');
assert.equal(seedIfEmpty(db), 1);
const app = createApp(db);
const call = async (method: string, path: string, body?: unknown, origin = APP_ORIGIN) => {
  const res = await app.fetch(
    new Request(`${APP_ORIGIN}/api${path}`, {
      method,
      headers: { origin },
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

assert.equal((await call('GET', '/characters', undefined, 'https://evil.example')).status, 403);

// A backup is a complete, openable DB, and writing it again replaces the old file.
const dir = mkdtempSync(join(tmpdir(), 'dnd-smoke-'));
try {
  const out = join(dir, 'backup.sqlite');
  backup(db, out);
  backup(db, out);
  const copy = openDb(out);
  assert.equal((copy.query('SELECT name FROM characters').get() as { name: string }).name, 'Faelan Mosswalker');
  copy.close();
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`node-smoke ok (node ${process.versions.node}${process.versions.electron ? `, electron ${process.versions.electron}` : ''})`);
