import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runNote } from '../scripts/note';
import { openDb } from './db';
import { seedIfEmpty } from './seed';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

/** A journal on disk with Faelan in "The Mire" (which has one place note) and Bramble in no campaign. */
function journal() {
  const dir = mkdtempSync(join(tmpdir(), 'note-cli-'));
  dirs.push(dir);
  const path = join(dir, 'dnd.sqlite');
  const db = openDb(path);
  seedIfEmpty(db);
  db.query("INSERT INTO campaigns (name) VALUES ('The Mire')").run();
  db.query('UPDATE characters SET campaign_id = 1 WHERE id = 1').run();
  db.query("INSERT INTO characters (name, sheet_json) SELECT 'Bramble', sheet_json FROM characters WHERE id = 1").run();
  db.query("INSERT INTO notes (campaign_id, kind, title, aliases) VALUES (1, 'place', 'Saltmarsh', 'The Marsh')").run();
  db.close();
  const file = (name: string, data: unknown) => {
    const p = join(dir, name);
    writeFileSync(p, typeof data === 'string' ? data : JSON.stringify(data));
    return p;
  };
  const run = (...args: string[]) => {
    const r = runNote([...args, '--db', path]);
    return { code: r.code, body: JSON.parse(r.out) };
  };
  const backups = () => (existsSync(join(dir, 'backups')) ? readdirSync(join(dir, 'backups')) : []);
  return { file, run, backups };
}

const npc = {
  kind: 'npc',
  title: 'Old Wren',
  body: 'Keeps the ferry at [[Saltmarsh]].\n\n- Wants: a quiet river.',
  aliases: ['Wren'],
  tags: ['Ferry'],
  fields: { role: 'Ferrywoman', attitude: 'friendly', location: 'Saltmarsh' },
};

describe('note CLI', () => {
  test('list, kinds and show', () => {
    const { run } = journal();
    expect(run('list').body.map((c: any) => [c.id, c.campaign])).toEqual([
      [1, 'The Mire'],
      [2, null],
    ]);
    const npcKind = run('kinds').body.find((k: any) => k.kind === 'npc');
    expect(npcKind.fields.find((f: any) => f.key === 'attitude').options).toContain('hostile');
    expect(npcKind.fields.find((f: any) => f.key === 'location').ref).toBe('place');
    const show = run('show', '1').body;
    expect(show).toMatchObject({ name: 'Faelan Mosswalker', campaign: { id: 1, name: 'The Mire' } });
    expect(show.notes.map((n: any) => [n.kind, n.title, n.aliases])).toEqual([['place', 'Saltmarsh', ['The Marsh']]]);
    expect(run('show', '2').body).toMatchObject({ campaign: null, notes: [] });
  });

  test('write: saves into the character’s campaign, after a backup', () => {
    const { file, run, backups } = journal();
    const w = run('write', '1', file('wren.json', npc));
    expect(w.code).toBe(0);
    expect(w.body.saved).toMatchObject({ campaignId: 1, kind: 'npc', title: 'Old Wren', aliases: ['Wren'], tags: ['ferry'], fields: npc.fields });
    expect(w.body.saved.image).toBeUndefined();
    expect(existsSync(w.body.backup)).toBe(true);
    expect(backups()).toHaveLength(1);
    expect(run('show', '1').body.notes.map((n: any) => n.title)).toContain('Old Wren');
  });

  test('write: refuses a name already used in the campaign, unless --force', () => {
    const { file, run } = journal();
    const clash = run('write', '1', file('a.json', { kind: 'place', title: 'the  marsh' }));
    expect(clash.code).toBe(1);
    expect(clash.body.error).toContain('Saltmarsh');
    expect(run('write', '1', file('b.json', { kind: 'lore', title: 'Tides', aliases: ['Saltmarsh'] })).body.error).toContain('--force');
    expect(run('write', '1', file('a.json', { kind: 'place', title: 'The Marsh' }), '--force').code).toBe(0);
  });

  test('write: invalid input saves nothing and leaves no backup', () => {
    const { file, run, backups } = journal();
    expect(run('write', '1', file('bad.json', '{ nope')).body.error).toContain('Invalid note file');
    expect(run('write', '1', file('arr.json', [])).body.error).toContain('Invalid note file');
    expect(run('write', '1', file('notitle.json', { kind: 'npc' })).body.error).toContain('title');
    expect(run('write', '1', file('kind.json', { kind: 'dragon', title: 'X' })).body.error).toContain('kind must be one of');
    expect(run('write', '1', file('att.json', { ...npc, fields: { attitude: 'smitten' } })).body.error).toContain('Attitude must be one of');
    expect(run('write', '2', file('wren.json', npc)).body.error).toContain("isn't in a campaign");
    expect(backups()).toEqual([]);
    expect(run('show', '1').body.notes).toHaveLength(1);
    expect(run('write', '1').code).toBe(2);
    expect(run('show', 'x').code).toBe(2);
    expect(run('frobnicate').code).toBe(2);
    expect(runNote(['list', '--db', '/nonexistent/dnd.sqlite']).code).toBe(1);
  });
});
