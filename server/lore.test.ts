import { describe, expect, test } from 'bun:test';
import faelan from '../src/data/faelan.json';
import { FAELAN_LORE } from '../src/data/faelan-lore';
import { createApp } from './app';
import { openDb } from './db';
import { seedIfEmpty, seedLore } from './seed';

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

const addCharacter = async (call: ReturnType<typeof setup>['call']) => {
  const s = structuredClone((faelan as any)[0]);
  s.characterName = 'Bramble';
  return (await call('POST', '/characters', { sheet: [s] })).body.id as number;
};

const doc = {
  sections: [{ id: 'origin', title: 'Origin', body: 'Born under a toadstool.' }],
  traits: { personality: ['Curious'], ideals: [], bonds: ['Her sister'], flaws: [] },
};

describe('lore', () => {
  test('Faelan is seeded with his lore', async () => {
    const { call } = setup();
    const r = await call('GET', '/characters/1/lore');
    expect(r.status).toBe(200);
    expect(r.body.sections).toEqual(FAELAN_LORE.sections);
    expect(r.body.traits).toEqual(FAELAN_LORE.traits);
    expect(r.body.updatedAt).toBeString();
  });

  test('a new character starts empty; PUT replaces and GET reads it back', async () => {
    const { call } = setup();
    const id = await addCharacter(call);
    expect((await call('GET', `/characters/${id}/lore`)).body).toEqual({
      sections: [],
      traits: { personality: [], ideals: [], bonds: [], flaws: [] },
      updatedAt: null,
    });
    const put = await call('PUT', `/characters/${id}/lore`, doc);
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject(doc);
    expect(put.body.updatedAt).toBeString();
    expect((await call('GET', `/characters/${id}/lore`)).body).toMatchObject(doc);
    // Missing trait lists default to empty.
    const partial = await call('PUT', `/characters/${id}/lore`, { sections: [], traits: { flaws: ['Stubborn'] } });
    expect(partial.body.traits).toEqual({ personality: [], ideals: [], bonds: [], flaws: ['Stubborn'] });
  });

  test('rejects bad bodies and unknown characters', async () => {
    const { call } = setup();
    expect((await call('GET', '/characters/99/lore')).status).toBe(404);
    expect((await call('PUT', '/characters/99/lore', doc)).status).toBe(404);
    for (const bad of [
      null,
      [],
      { sections: 'x', traits: {} },
      { sections: [], traits: null },
      { sections: [{ title: 'No id', body: '' }], traits: {} },
      { sections: [{ id: 'a', title: 'x'.repeat(201), body: '' }], traits: {} },
      { sections: [], traits: { flaws: [1] } },
      { sections: [], traits: { flaws: ['x'.repeat(1001)] } },
    ])
      expect((await call('PUT', '/characters/1/lore', bad)).status).toBe(400);
  });

  test('re-seeding never overwrites edited lore', async () => {
    const { db, call } = setup();
    await call('PUT', '/characters/1/lore', doc);
    seedLore(db);
    seedIfEmpty(db);
    expect((await call('GET', '/characters/1/lore')).body).toMatchObject(doc);
  });

  test('seedLore backfills an existing Faelan without lore', async () => {
    const { db, call } = setup();
    db.query('DELETE FROM character_lore').run();
    seedLore(db);
    expect((await call('GET', '/characters/1/lore')).body.sections).toEqual(FAELAN_LORE.sections);
  });

  test('deleting a character deletes its lore', async () => {
    const { db, call } = setup();
    expect((await call('DELETE', '/characters/1')).status).toBe(200);
    expect(db.query('SELECT count(*) AS n FROM character_lore').get()).toEqual({ n: 0 });
  });
});
