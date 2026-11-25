import { describe, expect, test } from 'bun:test';
import { createApp } from './app';
import { openDb } from './db';
import { seedIfEmpty } from './seed';
import { MIGRATIONS } from './migrations';

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

describe('journey map', () => {
  test('hexes upsert, chart and delete; negative coordinates work', async () => {
    const { call } = setup();
    expect((await call('GET', '/characters/1/map')).body).toEqual({ hexes: [], paths: [], marks: [] });
    expect((await call('GET', '/characters/9/map')).status).toBe(404);
    expect((await call('PUT', '/characters/1/map/hexes', { q: 0, r: 0, terrain: 'lava' })).status).toBe(400);
    expect((await call('PUT', '/characters/1/map/hexes', { q: 1.5, r: 0, terrain: 'forest' })).status).toBe(400);

    const h = await call('PUT', '/characters/1/map/hexes', { q: -2, r: 3, terrain: 'forest', label: ' Neverwinter Wood ' });
    expect(h.body).toEqual({ q: -2, r: 3, terrain: 'forest', state: 'sketched', label: 'Neverwinter Wood', noteId: null });
    await call('PUT', '/characters/1/map/hexes', { ...h.body, state: 'charted' });
    const map = (await call('GET', '/characters/1/map')).body;
    expect(map.hexes).toHaveLength(1);
    expect(map.hexes[0].state).toBe('charted');

    expect((await call('DELETE', '/characters/1/map/hexes?q=-2&r=3')).status).toBe(200);
    expect((await call('DELETE', '/characters/1/map/hexes?q=-2&r=3')).status).toBe(404);
    expect((await call('DELETE', '/characters/1/map/hexes?q=&r=3')).status).toBe(400);
  });

  test("a hex links to the character's own place note, and survives the note's deletion", async () => {
    const { call } = setup();
    const note = (await call('POST', '/notes', { title: 'Old Owl Well', kind: 'place', characterId: 1 })).body;
    expect((await call('PUT', '/characters/1/map/hexes', { q: 0, r: 0, terrain: 'ruin', noteId: 999 })).status).toBe(404);
    const camp = (await call('POST', '/campaigns', { name: 'Phandelver' })).body;
    const other = (await call('POST', '/notes', { title: 'Elsewhere', campaignId: camp.id })).body;
    expect((await call('PUT', '/characters/1/map/hexes', { q: 0, r: 0, terrain: 'ruin', noteId: other.id })).status).toBe(400);

    expect((await call('PUT', '/characters/1/map/hexes', { q: 0, r: 0, terrain: 'ruin', noteId: note.id })).body.noteId).toBe(note.id);
    await call('DELETE', `/notes/${note.id}`);
    expect((await call('GET', '/characters/1/map')).body.hexes[0]).toMatchObject({ terrain: 'ruin', noteId: null });
  });

  test('freehand paths keep their points in order, rounded to 0.1', async () => {
    const { call } = setup();
    expect((await call('POST', '/characters/1/map/paths', { kind: 'river', points: [[0, 0]] })).status).toBe(400);
    expect((await call('POST', '/characters/1/map/paths', { kind: 'canal', points: [[0, 0], [1, 1]] })).status).toBe(400);
    expect((await call('POST', '/characters/1/map/paths', { kind: 'river', points: [[0, 0], [1e9, 1]] })).status).toBe(400);
    const p = await call('POST', '/characters/1/map/paths', { kind: 'river', points: [[0, 0], [10.04, -5.26], [20, -8]] });
    expect(p.status).toBe(201);
    expect(p.body).toEqual({ id: p.body.id, kind: 'river', points: [[0, 0], [10, -5.3], [20, -8]] });
    expect((await call('GET', '/characters/1/map')).body.paths).toEqual([p.body]);
    expect((await call('DELETE', `/characters/1/map/paths/${p.body.id}`)).status).toBe(200);
    expect((await call('DELETE', `/characters/1/map/paths/${p.body.id}`)).status).toBe(404);
  });

  test('marks are placed, moved, relabelled and removed', async () => {
    const { call } = setup();
    expect((await call('POST', '/characters/1/map/marks', { kind: 'dragon', x: 0, y: 0 })).status).toBe(400);
    expect((await call('POST', '/characters/1/map/marks', { kind: 'camp', x: 'a', y: 0 })).status).toBe(400);
    const m = (await call('POST', '/characters/1/map/marks', { kind: 'camp', x: 12.34, y: -40, label: ' Night one ' })).body;
    expect(m).toEqual({ id: m.id, kind: 'camp', x: 12.3, y: -40, label: 'Night one', noteId: null });
    expect((await call('PATCH', `/characters/1/map/marks/${m.id}`, { x: 100, y: 50 })).body).toMatchObject({ x: 100, y: 50, label: 'Night one' });
    expect((await call('PATCH', `/characters/1/map/marks/${m.id}`, { kind: 'text' })).body.kind).toBe('text');
    expect((await call('PATCH', '/characters/1/map/marks/999', { x: 1 })).status).toBe(404);
    expect((await call('DELETE', `/characters/1/map/marks/${m.id}`)).status).toBe(200);
    expect((await call('GET', '/characters/1/map')).body.marks).toEqual([]);
  });
});

describe('migration 005', () => {
  test('old hex trails become trail paths through the hex centres', () => {
    const db = openDb(':memory:');
    seedIfEmpty(db);
    // Replay the end state of migration 4 with one trail, then run migration 5 on it.
    db.exec(`DROP TABLE map_paths; DROP TABLE map_marks;
      CREATE TABLE map_trails (id INTEGER PRIMARY KEY, character_id INTEGER NOT NULL, points_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
      INSERT INTO map_trails (character_id, points_json) VALUES (1, '[[0,0],[1,0],[0,2]]');`);
    db.exec(MIGRATIONS.find((m) => m.n === 5)!.sql);
    const row = db.query('SELECT kind, points_json FROM map_paths').get() as { kind: string; points_json: string };
    expect(row.kind).toBe('trail');
    expect(JSON.parse(row.points_json)).toEqual([[0, 0], [69.3, 0], [69.3, 120]]);
    expect(db.query("SELECT name FROM sqlite_master WHERE name = 'map_trails'").get()).toBeNull();
  });
});
