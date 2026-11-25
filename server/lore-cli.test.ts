import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultDbPath, runLore } from '../scripts/lore';
import { FAELAN_LORE } from '../src/data/faelan-lore';
import { openDb } from './db';
import { seedIfEmpty } from './seed';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

/** A journal on disk with Faelan (seeded with lore) and Bramble (none). */
function journal() {
  const dir = mkdtempSync(join(tmpdir(), 'lore-cli-'));
  dirs.push(dir);
  const path = join(dir, 'dnd.sqlite');
  const db = openDb(path);
  seedIfEmpty(db);
  db.query("INSERT INTO characters (name, sheet_json) SELECT 'Bramble', sheet_json FROM characters WHERE id = 1").run();
  db.close();
  const file = (name: string, data: unknown) => {
    const p = join(dir, name);
    writeFileSync(p, typeof data === 'string' ? data : JSON.stringify(data));
    return p;
  };
  const run = (...args: string[]) => {
    const r = runLore([...args, '--db', path]);
    return { code: r.code, body: JSON.parse(r.out) };
  };
  return { dir, path, file, run };
}

const doc = { sections: [{ id: 'origin', title: 'Origin', body: 'Born under a toadstool.' }], traits: { personality: ['Curious: pokes at everything.'] } };

describe('lore CLI', () => {
  test('list and show', () => {
    const { run } = journal();
    const list = run('list');
    expect(list.code).toBe(0);
    expect(list.body.map((c: any) => [c.id, c.hasLore])).toEqual([[1, true], [2, false]]);
    const show = run('show', '1');
    expect(show.body).toMatchObject({ name: 'Faelan Mosswalker', class: 'Druid', subrace: 'forest', alignment: 'True Neutral' });
    expect(show.body.spells.join()).toContain('Goodberry');
    expect(new Set(show.body.spells).size).toBe(show.body.spells.length);
    expect(show.body.lore.sections).toEqual(FAELAN_LORE.sections);
    expect(run('show', '9').code).toBe(1);
  });

  test('write: new lore, refuses to overwrite without --replace, backs up first', () => {
    const { dir, file, run } = journal();
    const w = run('write', '2', file('a.json', doc));
    expect(w.code).toBe(0);
    expect(w.body.saved.traits.personality).toEqual(['Curious: pokes at everything.']);
    expect(existsSync(w.body.backup)).toBe(true);
    expect(w.body.backup.startsWith(join(dir, 'backups'))).toBe(true);

    const again = run('write', '1', file('b.json', doc));
    expect(again.code).toBe(1);
    expect(again.body.error).toContain('--replace');
    expect(run('show', '1').body.lore.sections).toEqual(FAELAN_LORE.sections);
    expect(run('write', '1', file('b.json', doc), '--replace').body.saved.sections).toEqual(doc.sections);
  });

  test('write: invalid files and arguments', () => {
    const { file, run } = journal();
    expect(run('write', '2', file('bad.json', '{ nope')).body.error).toContain('Invalid lore file');
    expect(run('write', '2', file('shape.json', { sections: 'x', traits: {} })).body.error).toContain('sections must be an array');
    expect(run('write', '2').code).toBe(2);
    expect(run('frobnicate').code).toBe(2);
    expect(runLore(['list', '--db', '/nonexistent/dnd.sqlite']).code).toBe(1);
  });

  test('defaultDbPath follows the app', () => {
    expect(defaultDbPath({ DND_DB: '/x.sqlite' }, 'darwin')).toBe('/x.sqlite');
    expect(defaultDbPath({}, 'darwin')).toEndWith(join('Library', 'Application Support', 'adventurers-journal', 'dnd.sqlite'));
    expect(defaultDbPath({ XDG_CONFIG_HOME: '/cfg' }, 'linux')).toBe(join('/cfg', 'adventurers-journal', 'dnd.sqlite'));
    expect(defaultDbPath({ APPDATA: 'C:\\AppData' }, 'win32')).toBe(join('C:\\AppData', 'adventurers-journal', 'dnd.sqlite'));
  });
});
