import { afterEach, describe, expect, mock, test } from 'bun:test';
import { createApp } from './app';
import { openDb } from './db';
import { seedIfEmpty } from './seed';

// Faelan at level 1: CON 14 (+2), 10 max HP, d8 hit die, slots [2].
function setup() {
  const db = openDb(':memory:');
  seedIfEmpty(db);
  const app = createApp(db);
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.fetch(new Request(`http://x/api${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) }));
    return { status: res.status, body: (await res.json()) as any };
  };
  const levelUp = (level: number, extra: Record<string, unknown> = {}, body: Record<string, unknown> = {}) =>
    call('POST', '/characters/1/levels', { choice: { level, hp: { method: 'fixed', die: 5 }, features: [], ...extra }, ...body });
  return { db, call, levelUp };
}

describe('level-up', () => {
  test('1 → 2 → 3 adds fixed HP to max and current, and pads slots', async () => {
    const { call, levelUp } = setup();
    let r = await levelUp(2);
    expect(r.status).toBe(200);
    expect(r.body.character.levels).toHaveLength(1);
    expect(r.body.play.state.hp).toBe(17); // 10 + 5 + 2
    r = await levelUp(3, { subclass: { index: 'circle-of-the-land', name: 'Circle of the Land' } }, { variant: 'Arid' });
    expect(r.body.play.state.hp).toBe(24);
    expect(r.body.play.state.slotsUsed).toEqual([0, 0]);
    expect(r.body.play.state.variant).toBe('Arid');
    const play = (await call('GET', '/characters/1/play')).body;
    expect(play.state.hp).toBe(24);
    expect(play.version).toBe(r.body.play.version);
    const list = (await call('GET', '/characters')).body;
    expect(list[0].subtitle).toContain('Druid 3');
  });

  test('wrong level, bad HP die and bad ASI totals are 400', async () => {
    const { levelUp, call } = setup();
    expect((await levelUp(3)).status).toBe(400);
    expect((await call('POST', '/characters/1/levels', { choice: { level: 2, hp: { method: 'roll', die: 9 } } })).status).toBe(400);
    expect((await levelUp(2, { asi: { kind: 'scores', plus: { WIS: 1 } } })).status).toBe(400);
    expect((await levelUp(2, {}, { spells: { chosenCantrips: ['a', 'b', 'c', 'd'], prepared: [] } })).status).toBe(400);
    expect((await call('GET', '/characters/1')).body.levels).toEqual([]);
  });

  test('a CON increase raises max HP for every level', async () => {
    const { levelUp } = setup();
    await levelUp(2);
    await levelUp(3);
    const r = await levelUp(4, { asi: { kind: 'scores', plus: { CON: 2 } } });
    // CON 16 (+3): 10 + 1 (level 1 retroactive) + 3 × (5 + 3) = 35, up from 24
    expect(r.body.play.state.hp).toBe(35);
  });

  test('undo restores the level below, clamping HP and trimming slots and spells', async () => {
    const { call, levelUp } = setup();
    await levelUp(2);
    await levelUp(3);
    const { state, version } = (await call('GET', '/characters/1/play')).body;
    await call('PUT', '/characters/1/play', { state: { ...state, slotsUsed: [4, 2], prepared: ['a', 'b', 'c', 'd', 'e', 'f'] }, version });
    const r = await call('DELETE', '/characters/1/levels/last');
    expect(r.status).toBe(200);
    expect(r.body.character.levels).toHaveLength(1);
    expect(r.body.play.state).toMatchObject({ hp: 17, slotsUsed: [3], prepared: ['a', 'b', 'c', 'd', 'e'] });
    await call('DELETE', '/characters/1/levels/last');
    expect((await call('DELETE', '/characters/1/levels/last')).status).toBe(400);
  });

  test('reset play state keeps the levels', async () => {
    const { call, levelUp } = setup();
    await levelUp(2);
    const r = await call('POST', '/characters/1/play/reset');
    expect(r.body.state.hp).toBe(17);
    expect((await call('GET', '/characters/1')).body.levels).toHaveLength(1);
  });
});

describe('SRD level-up info', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test('features with text, subclasses of the class only, cached for offline use', async () => {
    const { call } = setup();
    const upstream: Record<string, unknown> = {
      '/2024/classes/druid/levels': [{ level: 3, features: [{ index: 'druid-subclass' }] }],
      '/2024/features/druid-subclass': { index: 'druid-subclass', name: 'Druid Subclass', description: 'Pick one.' },
      '/2024/subclasses': { results: [{ index: 'circle-of-the-land' }, { index: 'champion' }] },
      '/2024/subclasses/circle-of-the-land': { index: 'circle-of-the-land', name: 'Circle of the Land', class: { index: 'druid' }, description: 'Land.' },
      '/2024/subclasses/champion': { index: 'champion', name: 'Champion', class: { index: 'fighter' }, description: 'Hit.' },
    };
    const fn = mock(async (input: string | URL | Request) => {
      const path = String(input).replace('https://www.dnd5eapi.co/api', '');
      return path in upstream ? Response.json(upstream[path]) : new Response('nope', { status: 404 });
    });
    globalThis.fetch = fn as unknown as typeof fetch;
    const r = await call('GET', '/srd/levelup/druid/3');
    expect(r.status).toBe(200);
    expect(r.body.features).toEqual([{ index: 'druid-subclass', name: 'Druid Subclass', description: 'Pick one.', source: 'Druid 3' }]);
    expect(r.body.subclasses.map((s: any) => s.name)).toEqual(['Circle of the Land']);
    const calls = fn.mock.calls.length;
    expect((await call('GET', '/srd/levelup/druid/3')).body).toEqual(r.body);
    expect(fn.mock.calls.length).toBe(calls);
  });
});
