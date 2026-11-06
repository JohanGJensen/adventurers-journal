import { describe, expect, test } from 'bun:test';
import { createApp } from './app';
import { openDb } from './db';
import { seedIfEmpty } from './seed';

function setup() {
  const db = openDb(':memory:');
  seedIfEmpty(db);
  const app = createApp(db);
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.fetch(new Request(`http://x/api${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) }));
    return { status: res.status, body: (await res.json()) as any };
  };
  return { db, call };
}

describe('events', () => {
  test('POST logs client events; GET pages newest first with a cursor', async () => {
    const { call } = setup();
    const many = Array.from({ length: 7 }, (_, i) => ({ type: i % 2 ? 'roll' : 'damage', summary: `e${i}`, data: { i } }));
    expect((await call('POST', '/characters/1/events', many)).status).toBe(201);
    const p1 = (await call('GET', '/characters/1/events?limit=3')).body;
    expect(p1.events.map((e: any) => e.summary)).toEqual(['e6', 'e5', 'e4']);
    expect(p1.events[0].data).toEqual({ i: 6 });
    const p2 = (await call('GET', `/characters/1/events?limit=3&before=${encodeURIComponent(p1.next)}`)).body;
    expect(p2.events.map((e: any) => e.summary)).toEqual(['e3', 'e2', 'e1']);
    const p3 = (await call('GET', `/characters/1/events?limit=3&before=${encodeURIComponent(p2.next)}`)).body;
    expect(p3).toMatchObject({ next: null });
    expect(p3.events.map((e: any) => e.summary)).toEqual(['e0']);
  });

  test('type filter and validation', async () => {
    const { call } = setup();
    await call('POST', '/characters/1/events', [{ type: 'roll', summary: 'r' }, { type: 'heal', summary: 'h' }]);
    expect((await call('GET', '/characters/1/events?type=roll')).body.events.map((e: any) => e.summary)).toEqual(['r']);
    expect((await call('GET', '/characters/1/events?type=bogus')).status).toBe(400);
    expect((await call('POST', '/characters/1/events', { type: 'bogus', summary: 'x' })).status).toBe(400);
    expect((await call('GET', '/characters/1/events?before=garbage')).status).toBe(400);
  });
});
