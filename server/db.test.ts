import { describe, expect, test } from 'bun:test';
import { APP_ORIGIN, createApp } from './app';
import { migrate, openDb } from './db';
import { seedIfEmpty } from './seed';

const ver = (db: ReturnType<typeof openDb>) => (db.query('PRAGMA user_version').get() as { user_version: number }).user_version;

describe('db', () => {
  test('migrations apply from empty and re-running is a no-op', () => {
    const db = openDb(':memory:');
    const v = ver(db);
    expect(v).toBeGreaterThanOrEqual(1);
    expect(migrate(db)).toBe(0);
    expect(ver(db)).toBe(v);
    const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all().map((r: any) => r.name);
    for (const t of ['characters', 'play_state', 'items', 'events', 'notes', 'srd_cache', 'imports']) expect(tables).toContain(t);
  });

  test('seed creates Faelan exactly once', () => {
    const db = openDb(':memory:');
    expect(seedIfEmpty(db)).toBe(1);
    expect(seedIfEmpty(db)).toBeNull();
    const rows = db.query('SELECT name, seed_key FROM characters').all();
    expect(rows).toEqual([{ name: 'Faelan Mosswalker', seed_key: 'faelan' }]);
  });

  test('GET /api/characters lists the seeded character', async () => {
    const db = openDb(':memory:');
    seedIfEmpty(db);
    const res = await createApp(db).fetch(new Request('http://x/api/characters'));
    expect(res.status).toBe(200);
    const list: any = await res.json();
    expect(list[0]).toMatchObject({ id: 1, name: 'Faelan Mosswalker', seedKey: 'faelan', portrait: '/faelanmosswalker.png' });
    expect(list[0].subtitle).toContain('Druid');
  });

  test('unknown route is 404 JSON', async () => {
    const res = await createApp(openDb(':memory:')).fetch(new Request('http://x/api/nope'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
  });

  test('only requests from the app origin (or with none) are allowed', async () => {
    const app = createApp(openDb(':memory:'));
    const req = (origin?: string) => new Request(`${APP_ORIGIN}/api/characters`, { headers: origin ? { origin } : {} });
    expect((await app.fetch(req())).status).toBe(200);
    expect((await app.fetch(req(APP_ORIGIN))).status).toBe(200);
    expect((await app.fetch(req('http://localhost:5173'))).status).toBe(403);
    expect((await app.fetch(req('null'))).status).toBe(403);
  });
});
