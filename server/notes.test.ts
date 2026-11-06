import { describe, expect, test } from 'bun:test';
import { createApp } from './app';
import { openDb } from './db';
import { ftsQuery } from './routes/notes';
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
const titles = (r: { body: any[] }) => r.body.map((n) => n.title);

describe('notes', () => {
  test('CRUD with owner checks', async () => {
    const { call } = setup();
    expect((await call('POST', '/notes', { title: 'x' })).status).toBe(400);
    expect((await call('POST', '/notes', { title: 'x', characterId: 9 })).status).toBe(404);
    const n = (await call('POST', '/notes', { title: 'Sildar', kind: 'npc', characterId: 1, body: 'Met at the inn' })).body;
    expect(n).toMatchObject({ title: 'Sildar', kind: 'npc', characterId: 1, campaignId: null });
    expect((await call('PATCH', `/notes/${n.id}`, { characterId: null })).status).toBe(400);
    expect((await call('PATCH', `/notes/${n.id}`, { kind: 'boss' })).status).toBe(400);
    const camp = (await call('POST', '/campaigns', { name: 'Phandelver' })).body;
    expect((await call('PATCH', `/notes/${n.id}`, { campaignId: camp.id, characterId: null })).body).toMatchObject({ campaignId: camp.id, characterId: null });
    expect(titles(await call('GET', `/notes?campaign=${camp.id}`))).toEqual(['Sildar']);
    expect(titles(await call('GET', '/notes?character=1'))).toEqual([]);
    expect((await call('DELETE', `/notes/${n.id}`)).status).toBe(200);
    expect((await call('DELETE', `/notes/${n.id}`)).status).toBe(404);
  });

  test('FTS search follows updates and deletes; odd input is safe', async () => {
    const { call } = setup();
    const a = (await call('POST', '/notes', { title: 'Cragmaw hideout', characterId: 1, body: 'Goblins and a wolf pen' })).body;
    await call('POST', '/notes', { title: 'Shopping', characterId: 1, body: 'Rope, rations' });
    expect(titles(await call('GET', '/notes?q=gobl'))).toEqual(['Cragmaw hideout']);
    await call('PATCH', `/notes/${a.id}`, { body: 'Bugbears only' });
    expect(titles(await call('GET', '/notes?q=goblins'))).toEqual([]);
    expect(titles(await call('GET', '/notes?q=bugbear'))).toEqual(['Cragmaw hideout']);
    await call('DELETE', `/notes/${a.id}`);
    expect(titles(await call('GET', '/notes?q=bugbear'))).toEqual([]);
    for (const q of ['"', 'AND OR NOT', '(*', 'rope"); DROP', 'ü']) expect((await call('GET', `/notes?q=${encodeURIComponent(q)}`)).status).toBe(200);
    expect(titles(await call('GET', `/notes?q=${encodeURIComponent('rope"); DROP')}`))).toEqual([]);
    expect(titles(await call('GET', '/notes?q=rope'))).toEqual(['Shopping']);
  });

  test('ftsQuery', () => {
    expect(ftsQuery('  ')).toBeNull();
    expect(ftsQuery('wolf "pen')).toBe('"wolf"* "pen"*');
  });
});
