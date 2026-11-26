import { describe, expect, test } from 'bun:test';
import { createApp } from './app';
import { openDb } from './db';
import { MIGRATIONS } from './migrations';
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
  // The seeded character (1) plays in campaign 1, which owns the notes below.
  db.exec("INSERT INTO campaigns (id, name) VALUES (1, 'Phandelver'); UPDATE characters SET campaign_id = 1 WHERE id = 1;");
  return { db, call };
}
const titles = (r: { body: any[] }) => r.body.map((n) => n.title);

describe('notes', () => {
  test('CRUD: every note belongs to a campaign', async () => {
    const { call, db } = setup();
    expect((await call('POST', '/notes', { title: 'x' })).status).toBe(400);
    expect((await call('POST', '/notes', { title: 'x', campaignId: 9 })).status).toBe(404);
    expect((await call('POST', '/notes', { title: 'x', characterId: 9 })).status).toBe(404);
    // a character id stands in for its campaign
    const n = (await call('POST', '/notes', { title: 'Sildar', kind: 'npc', characterId: 1, body: 'Met at the inn' })).body;
    expect(n).toMatchObject({ title: 'Sildar', kind: 'npc', campaignId: 1 });
    expect(n.characterId).toBeUndefined();
    expect((await call('PATCH', `/notes/${n.id}`, { campaignId: null })).status).toBe(400);
    expect((await call('PATCH', `/notes/${n.id}`, { kind: 'boss' })).status).toBe(400);
    const camp = (await call('POST', '/campaigns', { name: 'Storm King' })).body;
    expect((await call('PATCH', `/notes/${n.id}`, { campaignId: camp.id })).body).toMatchObject({ campaignId: camp.id });
    expect(titles(await call('GET', `/notes?campaign=${camp.id}`))).toEqual(['Sildar']);
    expect(titles(await call('GET', '/notes?campaign=1'))).toEqual([]);
    db.exec('UPDATE characters SET campaign_id = NULL');
    expect((await call('POST', '/notes', { title: 'x', characterId: 1 })).body.error).toContain('campaign');
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

  test('aliases, tags and kind fields: validation, round-trip, search', async () => {
    const { call } = setup();
    expect((await call('POST', '/notes', { title: 'x', characterId: 1, kind: 'quest', fields: { status: 'lost' } })).status).toBe(400);
    expect((await call('POST', '/notes', { title: 'x', characterId: 1, tags: 'a,b' })).status).toBe(400);
    const city = (
      await call('POST', '/notes', { title: 'Neverwinter', kind: 'place', characterId: 1, aliases: [' City of  Skilled Hands ', 'city of skilled hands'], tags: ['Sword Coast', 'city'], fields: { type: 'city', bogus: 'x' } })
    ).body;
    expect(city).toMatchObject({ aliases: ['City of Skilled Hands'], tags: ['sword coast', 'city'], fields: { type: 'city' } });
    expect(titles(await call('GET', '/notes?q=skilled'))).toEqual(['Neverwinter']);
    expect(titles(await call('GET', `/notes?tag=${encodeURIComponent('Sword Coast')}`))).toEqual(['Neverwinter']);
    expect(titles(await call('GET', '/notes?tag=sword'))).toEqual([]);
    // changing kind drops fields the new kind doesn't have, and bad pick-list values, instead of failing
    const npc = (await call('POST', '/notes', { title: 'Gundren', kind: 'npc', characterId: 1, fields: { status: 'missing', role: 'Dwarf' } })).body;
    expect((await call('PATCH', `/notes/${npc.id}`, { kind: 'quest' })).body.fields).toEqual({});
    const idx = (await call('GET', '/notes/index?campaign=1')).body;
    expect(idx.map((r: any) => r.title).sort()).toEqual(['Gundren', 'Neverwinter']);
    expect(idx[0].body).toBeUndefined();
    expect((await call('GET', `/notes/${city.id}`)).body).toMatchObject({ title: 'Neverwinter', tags: ['sword coast', 'city'] });
    expect((await call('GET', '/notes/999')).status).toBe(404);
  });

  test('backlinks and renames', async () => {
    const { call } = setup();
    const city = (await call('POST', '/notes', { title: 'Neverwinter', kind: 'place', characterId: 1, aliases: ['City of Skilled Hands'] })).body;
    const mk = async (title: string, body: string, extra = {}) => (await call('POST', '/notes', { title, body, characterId: 1, ...extra })).body;
    const a = await mk('Explicit', 'Head to [[neverwinter|the city]].');
    await mk('Auto', 'Back in the city of skilled hands we rested.');
    await mk('Field', '', { kind: 'quest', fields: { location: 'Neverwinter', status: 'active' } });
    await mk('Neverwinter Wood', '', { kind: 'place' });
    await mk('Nope', 'Neverwinter Wood is spooky. Neverwinters.');
    const back = async () => titles(await call('GET', `/notes/${city.id}/backlinks`)).sort();
    expect(await back()).toEqual(['Auto', 'Explicit', 'Field']);
    const renamed = (await call('PATCH', `/notes/${city.id}`, { title: 'Waterdeep' })).body;
    expect(renamed.aliases).toEqual(['City of Skilled Hands', 'Neverwinter']);
    expect((await call('GET', '/notes?q=explicit')).body[0].body).toBe('Head to [[Waterdeep|the city]].');
    expect(await back()).toEqual(['Auto', 'Explicit', 'Field']);
    expect((await call('GET', `/notes/${a.id}/backlinks`)).body).toEqual([]);
  });

  test('links, backlinks and renames stay inside a campaign', async () => {
    const { call } = setup();
    const other = (await call('POST', '/campaigns', { name: 'Elsewhere' })).body;
    const city = (await call('POST', '/notes', { title: 'Neverwinter', campaignId: 1 })).body;
    const there = (await call('POST', '/notes', { title: 'Far', campaignId: other.id, body: 'See [[Neverwinter]].' })).body;
    expect((await call('GET', `/notes/${city.id}/backlinks`)).body).toEqual([]);
    await call('PATCH', `/notes/${city.id}`, { title: 'Waterdeep' });
    expect((await call('GET', `/notes/${there.id}`)).body.body).toBe('See [[Neverwinter]].');
  });

  test('migration 8 moves character notes to their campaign, giving campaign-less characters one', () => {
    const db = openDb(':memory:');
    seedIfEmpty(db);
    db.exec(`INSERT INTO characters (id, name, sheet_json) VALUES (2, 'Bree', '{}'), (3, 'Cole', '{}');
      INSERT INTO campaigns (id, name) VALUES (5, 'Coast');
      UPDATE characters SET campaign_id = 5 WHERE id = 2;
      INSERT INTO notes (campaign_id, character_id, title) VALUES (NULL, 2, 'in campaign'), (NULL, 3, 'orphan'), (5, NULL, 'already'), (NULL, 3, 'orphan 2');`);
    db.exec(MIGRATIONS.find((m) => m.n === 8)!.sql);
    const notes = db.query('SELECT title, campaign_id AS k, character_id AS c FROM notes ORDER BY id').all() as { title: string; k: number; c: null }[];
    const cole = db.query('SELECT campaign_id AS k FROM characters WHERE id = 3').get() as { k: number };
    expect(cole.k).toBe(6);
    expect((db.query('SELECT name FROM campaigns WHERE id = 6').get() as { name: string }).name).toBe("Cole's adventures");
    expect(notes).toEqual([
      { title: 'in campaign', k: 5, c: null },
      { title: 'orphan', k: 6, c: null },
      { title: 'already', k: 5, c: null },
      { title: 'orphan 2', k: 6, c: null },
    ]);
    // Faelan (no notes) is left out of any campaign
    expect((db.query('SELECT campaign_id AS k FROM characters WHERE id = 1').get() as { k: null }).k).toBeNull();
  });

  test('player notes: fields, and an item held by a player links back to them', async () => {
    const { call } = setup();
    expect((await call('POST', '/notes', { title: 'x', campaignId: 1, kind: 'player', fields: { status: 'asleep' } })).status).toBe(400);
    const anna = (
      await call('POST', '/notes', {
        title: 'Brynja',
        kind: 'player',
        campaignId: 1,
        fields: { player: 'Anna', race: 'Half-elf', class: 'Bard', level: '5', status: 'active', bond: 'Owes me a favour', attitude: 'x' },
      })
    ).body;
    expect(anna.fields).toEqual({ player: 'Anna', race: 'Half-elf', class: 'Bard', level: '5', status: 'active', bond: 'Owes me a favour' });
    await call('POST', '/notes', { title: 'Lute of Echoes', kind: 'item', campaignId: 1, fields: { holder: 'Brynja' } });
    await call('POST', '/notes', { title: 'Old map', kind: 'item', campaignId: 1, fields: { holder: 'Faelan' } });
    expect(titles(await call('GET', `/notes/${anna.id}/backlinks`))).toEqual(['Lute of Echoes']);
  });

  test('a note image: stored, only on single-note responses, removable, validated, not searchable', async () => {
    const { call } = setup();
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const n = (await call('POST', '/notes', { title: 'Brynja', kind: 'player', campaignId: 1 })).body;
    expect(n.image).toBeNull();
    expect((await call('PATCH', `/notes/${n.id}`, { image: 'https://example.com/x.png' })).status).toBe(400);
    expect((await call('PATCH', `/notes/${n.id}`, { image: png })).body.image).toBe(png);
    // a text edit keeps the image
    expect((await call('PATCH', `/notes/${n.id}`, { body: 'Sings badly' })).body.image).toBe(png);
    expect((await call('GET', `/notes/${n.id}`)).body.image).toBe(png);
    expect((await call('GET', '/notes?campaign=1')).body[0].image).toBeUndefined();
    expect((await call('GET', '/notes/index?campaign=1')).body[0].image).toBeUndefined();
    expect(titles(await call('GET', '/notes?q=iVBORw0KGgo'))).toEqual([]);
    expect((await call('PATCH', `/notes/${n.id}`, { image: null })).body.image).toBeNull();
  });

  test('ftsQuery', () => {
    expect(ftsQuery('  ')).toBeNull();
    expect(ftsQuery('wolf "pen')).toBe('"wolf"* "pen"*');
  });
});
