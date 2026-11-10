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
  const levelUp = (level: number, extra: Record<string, unknown> = {}, body: Record<string, unknown> = {}) =>
    call('POST', '/characters/1/levels', { choice: { level, hp: { method: 'fixed', die: 5 }, features: [], ...extra }, ...body });
  return { db, call, levelUp };
}

const circle = (over: Record<string, unknown> = {}) => ({
  classKey: 'druid',
  name: 'Circle of Testing',
  description: 'Druids who test things.',
  levels: [
    {
      level: 3,
      features: [{ name: 'Test Sense', description: 'You notice bugs.' }],
      spells: [{ name: 'Detect Magic', level: 1 }, { name: 'Shield', level: 1 }],
      buffs: { ac: 1, speed: 10, hpPerLevel: 1, cantrips: 1, skills: ['Perception'], saves: ['CON'], abilities: { CON: 2 }, proficiencies: ['Shields'] },
      resources: [{ name: 'Test Surge', uses: 'WIS', recharge: 'long' }],
    },
    { level: 6, features: [{ name: 'Later', description: '' }], spells: [], buffs: {}, resources: [] },
  ],
  variants: { label: 'Season', options: [{ name: 'Spring', description: '', spells: [{ name: 'Goodberry', level: 1, atLevel: 3 }] }] },
  ...over,
});

describe('homebrew subclasses', () => {
  test('create, list by class, get, update, validation', async () => {
    const { call } = setup();
    const r = await call('POST', '/homebrew/subclasses', circle());
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ id: 1, name: 'Circle of Testing', usedBy: [] });
    expect((await call('GET', '/homebrew/subclasses?class=druid')).body).toHaveLength(1);
    expect((await call('GET', '/homebrew/subclasses?class=wizard')).body).toHaveLength(0);
    expect((await call('PUT', '/homebrew/subclasses/1', circle({ name: 'Circle of Tests' }))).body.name).toBe('Circle of Tests');
    expect((await call('POST', '/homebrew/subclasses', circle({ levels: [{ level: 4, features: [], spells: [], buffs: {}, resources: [] }] }))).status).toBe(400);
    expect((await call('POST', '/homebrew/subclasses', circle({ classKey: 'artificer' }))).status).toBe(400);
    expect((await call('POST', '/homebrew/subclasses', circle({ name: '' }))).status).toBe(400);
  });

  test('a character takes it: buffs, spells, features, resources, variants; delete is blocked; edits apply live', async () => {
    const { call, levelUp } = setup();
    await call('POST', '/homebrew/subclasses', circle());
    await levelUp(2);
    let r = await levelUp(3, { subclass: { index: 'homebrew-1', name: 'whatever', homebrew: true } }, { variant: 'Spring' });
    expect(r.status).toBe(200);
    expect(r.body.character.levels[1].subclass).toEqual({ index: 'homebrew-1', name: 'Circle of Testing', homebrew: true });
    expect(r.body.character.homebrew.id).toBe(1);
    // CON 14 → 16 (+3): 10 + 1 + 2 × (5 + 3) = 27, plus 1 HP per level × 3 = 30
    expect(r.body.play.state.hp).toBe(30);
    expect(r.body.play.state.variant).toBe('Spring');

    const { buildCharacter, knownSpells } = await import('../src/lib/character');
    const dto = (await call('GET', '/characters/1')).body;
    const c = buildCharacter(dto.sheet, dto.extras, dto.levels, dto.homebrew);
    expect(c.acBonus).toBe(1);
    expect(c.speed).toBe(40);
    expect(c.cantripCap).toBe(2 + 1 + 1); // druid 2 + Magician 1 + homebrew 1
    expect(c.skills.find((s) => s.name === 'Perception')).toMatchObject({ proficient: true, source: 'Subclass' });
    expect(c.abilities.find((a) => a.key === 'CON')!.saveProf).toBe(true);
    expect(c.features.map((f) => f.name)).toEqual(expect.arrayContaining(['Circle of Testing', 'Test Sense', 'Proficiencies']));
    expect(c.features.some((f) => f.name === 'Later')).toBe(false);
    expect(c.resources).toEqual([{ key: '3:0:Test Surge', name: 'Test Surge', max: 3, recharge: 'long' }]);
    const spells = knownSpells(c, { chosenCantrips: [], prepared: [], variant: 'Spring' }).map((s) => s.name);
    expect(spells).toEqual(expect.arrayContaining(['Detect Magic', 'Shield', 'Goodberry']));

    expect((await call('DELETE', '/homebrew/subclasses/1')).status).toBe(409);
    expect((await call('GET', '/homebrew/subclasses/1')).body.usedBy).toEqual(['Faelan Mosswalker']);

    // live link: a bigger HP buff shows up on the next derive
    const edited = circle();
    (edited.levels[0] as any).buffs.hpPerLevel = 2;
    await call('PUT', '/homebrew/subclasses/1', edited);
    const dto2 = (await call('GET', '/characters/1')).body;
    expect(buildCharacter(dto2.sheet, dto2.extras, dto2.levels, dto2.homebrew).hitPoints).toBe(33);

    r = await call('DELETE', '/characters/1/levels/last');
    expect(r.body.character.homebrew).toBeNull();
    expect(r.body.play.state.variant).toBeNull();
    expect((await call('DELETE', '/homebrew/subclasses/1')).status).toBe(200);
  });

  test('level-up rejects unknown or other-class homebrew', async () => {
    const { call, levelUp, db } = setup();
    await levelUp(2);
    expect((await levelUp(3, { subclass: { index: 'homebrew-9', name: 'X', homebrew: true } })).status).toBe(400);
    await call('POST', '/homebrew/subclasses', circle());
    db.query("UPDATE homebrew_subclasses SET data_json = json_set(data_json, '$.classKey', 'wizard') WHERE id = 1").run();
    expect((await levelUp(3, { subclass: { index: 'homebrew-1', name: 'X', homebrew: true } })).status).toBe(400);
  });
});
