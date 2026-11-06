// bun scripts/import-local.ts <export.json> --character <id|name> [--force] [--dry-run] [--db data/dnd.sqlite]
// Exit codes: 0 imported, 2 already imported, 3 conflict without --force, 1 invalid input.
import { existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { backup } from '../server/backup';
import { findCharacter } from '../server/characters';
import { defaultDbPath, openDb } from '../server/db';
import { HttpError } from '../server/http';
import { importLocalData, type StateSummary } from '../server/import';

const die = (msg: string, code = 1): never => {
  console.error(msg);
  process.exit(code);
};

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: { character: { type: 'string', short: 'c' }, force: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, db: { type: 'string' } },
  });
} catch (e) {
  die(e instanceof Error ? e.message : String(e));
}
const { values, positionals } = parsed!;
const file = positionals[0];
if (!file || !values.character)
  die('Usage: bun scripts/import-local.ts <export.json> --character <id|name> [--force] [--dry-run] [--db path]');
if (!existsSync(file!)) die(`No such file: ${file}`);

let payload: unknown;
try {
  payload = JSON.parse(readFileSync(file!, 'utf8'));
} catch (e) {
  die(`Could not parse ${file}: ${e instanceof Error ? e.message : e}`);
}

const dbPath = values.db ?? defaultDbPath();
const db = openDb(dbPath);
const characterId = findCharacter(db, values.character!) ?? die(`No single character matches "${values.character}"`);
const dryRun = !!values['dry-run'];
const force = !!values.force;

const fmt = (s: StateSummary) =>
  [
    `HP ${s.hp}${s.tempHp ? ` (+${s.tempHp} temp)` : ''}`,
    `slots used [${s.slotsUsed.join(', ')}]`,
    `conditions ${s.conditions.length ? s.conditions.join(', ') : 'none'}`,
    `${s.items} item rows (${s.units} units)`,
    `coins ${Object.entries(s.coins).map(([k, v]) => `${v}${k}`).join(' ')}`,
  ].join('\n    ');

try {
  if (force && !dryRun) console.log(`Backup: ${backup(db, dbPath)}`);
  const r = importLocalData(db, payload, { characterId, force, dryRun, source: 'cli' });
  console.log(`Character ${characterId}${dryRun ? ' (dry run, nothing written)' : ''}`);
  console.log(`  before:\n    ${fmt(r.before)}`);
  console.log(`  after:\n    ${fmt(r.after)}`);
  if (r.status === 'already') {
    console.log('Already imported (same payload hash); nothing to do.');
    process.exit(2);
  }
  if (r.status === 'conflict') {
    console.error('The server already has data for this character. Re-run with --force to overwrite (a backup is made first).');
    process.exit(3);
  }
  console.log(dryRun ? 'Would import.' : 'Imported.');
  process.exit(0);
} catch (e) {
  die(e instanceof HttpError ? e.message : String(e));
}
