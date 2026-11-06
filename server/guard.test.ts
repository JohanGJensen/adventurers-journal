import { describe, expect, test } from 'bun:test';
import { createApp } from './app';
import { openDb } from './db';
import { seedIfEmpty } from './seed';

function setup() {
  const db = openDb(':memory:');
  seedIfEmpty(db);
  const app = createApp(db);
  const send = (path: string, init: RequestInit = {}) => app.fetch(new Request(`http://127.0.0.1:3000/api${path}`, init));
  return { db, send };
}

const noteCount = (db: ReturnType<typeof openDb>) => (db.query('SELECT count(*) AS n FROM notes').get() as { n: number }).n;

describe('request guard', () => {
  test('refuses a cross-site text/plain POST and writes nothing', async () => {
    const { db, send } = setup();
    const res = await send('/notes', {
      method: 'POST',
      headers: { host: '127.0.0.1:3000', origin: 'https://evil.example', 'content-type': 'text/plain' },
      body: JSON.stringify({ title: 'pwned', characterId: 1 }),
    });
    expect(res.status).toBe(403);
    expect(noteCount(db)).toBe(0);
  });

  test('refuses a cross-site bodyless reset', async () => {
    const { send } = setup();
    const res = await send('/characters/1/play/reset', { method: 'POST', headers: { host: '127.0.0.1:3000', origin: 'https://evil.example' } });
    expect(res.status).toBe(403);
  });

  test('refuses the opaque "null" origin', async () => {
    const { send } = setup();
    const res = await send('/characters/1/inventory/reset', { method: 'POST', headers: { host: 'localhost:3000', origin: 'null' } });
    expect(res.status).toBe(403);
  });

  test('refuses a rebound Host, even for reads', async () => {
    const { send } = setup();
    const res = await send('/characters', { headers: { host: 'rebind.evil.example:3000' } });
    expect(res.status).toBe(403);
  });

  test.each([
    ['prod, same origin', '127.0.0.1:3000', 'http://127.0.0.1:3000'],
    ['dev via Vite proxy', '127.0.0.1:3001', 'http://localhost:5173'],
    ['IPv6 loopback', '[::1]:3000', 'http://[::1]:3000'],
  ])('allows %s', async (_, host, origin) => {
    const { db, send } = setup();
    const res = await send('/notes', {
      method: 'POST',
      headers: { host, origin, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'ok', characterId: 1 }),
    });
    expect(res.status).toBe(201);
    expect(noteCount(db)).toBe(1);
  });

  test('allows CLI clients that send no Origin', async () => {
    const { send } = setup();
    const res = await send('/characters', { headers: { host: 'localhost:3000' } });
    expect(res.status).toBe(200);
  });
});
