import { describe, expect, test } from 'bun:test';
import faelan from '../src/data/faelan.json';
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

const otherSheet = () => {
  const s = structuredClone((faelan as any)[0]);
  s.characterName = 'Bramble';
  return s;
};

describe('characters', () => {
  test('import a sheet (object or array form), without Faelan extras', async () => {
    const { call } = setup();
    const r = await call('POST', '/characters', { sheet: [otherSheet()] });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ id: 2, name: 'Bramble', extras: {}, seedKey: null });
    const list = (await call('GET', '/characters')).body;
    expect(list.map((c: any) => [c.name, c.portrait])).toEqual([
      ['Faelan Mosswalker', '/faelanmosswalker.png'],
      ['Bramble', null],
    ]);
    // Bramble's fresh play state has no Faelan bonus cantrips counted as chosen
    expect((await call('GET', '/characters/2/play')).status).toBe(200);
  });

  test('invalid sheets are 400', async () => {
    const { call } = setup();
    expect((await call('POST', '/characters', { sheet: { userChoices: [] } })).status).toBe(400);
    const wizard = otherSheet();
    wizard.userChoices.find((c: any) => c.type === 'class').value = 'wizard';
    const r = await call('POST', '/characters', { sheet: wizard });
    expect(r.status).toBe(400);
    expect(r.body.error).toContain('No rules for class "wizard"');
  });

  test('rename, assign campaign, edit extras, delete cascades', async () => {
    const { call, db } = setup();
    const camp = (await call('POST', '/campaigns', { name: 'Curse of the Moss' })).body;
    let r = await call('PATCH', '/characters/1', { name: 'Faelan', campaignId: camp.id, extras: { bonusCantrips: 2 } });
    expect(r.body).toMatchObject({ name: 'Faelan', campaignId: camp.id, extras: { bonusCantrips: 2 } });
    expect((await call('PATCH', '/characters/1', { campaignId: 999 })).status).toBe(404);
    expect((await call('PATCH', '/characters/1', { extras: { bonusSpells: [{ name: 'X', level: 12, source: 'Class' }] } })).status).toBe(400);
    await call('DELETE', `/campaigns/${camp.id}`);
    expect((await call('GET', '/characters/1')).body.campaignId).toBeNull();
    await call('PUT', '/characters/1/coins', { cp: 0, sp: 0, ep: 0, gp: 1, pp: 0 });
    expect((await call('DELETE', '/characters/1')).status).toBe(200);
    expect(db.query('SELECT count(*) AS n FROM events').get()).toEqual({ n: 0 });
    expect((await call('GET', '/characters/1')).status).toBe(404);
  });

  test('campaign CRUD', async () => {
    const { call } = setup();
    expect((await call('POST', '/campaigns', { name: ' ' })).status).toBe(400);
    const c = (await call('POST', '/campaigns', { name: 'B' })).body;
    await call('POST', '/campaigns', { name: 'a' });
    expect((await call('PATCH', `/campaigns/${c.id}`, { name: 'C' })).body.name).toBe('C');
    expect((await call('GET', '/campaigns')).body.map((x: any) => x.name)).toEqual(['a', 'C']);
  });
});
