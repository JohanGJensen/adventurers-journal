// bun scripts/import-character.ts <sheet.json> [--campaign <name>] [--extras extras.json] [--db data/dnd.sqlite]
// Adds a character from a sheet export (same format as src/data/faelan.json).
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { campaignByName } from '../server/campaigns';
import { getCharacter, insertCharacter } from '../server/characters';
import { defaultDbPath, openDb } from '../server/db';
import { HttpError } from '../server/http';
import { asExtras } from '../server/validate';

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { campaign: { type: 'string' }, extras: { type: 'string' }, db: { type: 'string' } },
  });
  if (!positionals[0]) throw new Error('Usage: bun scripts/import-character.ts <sheet.json> [--campaign <name>] [--extras extras.json] [--db path]');
  const sheet = JSON.parse(readFileSync(positionals[0], 'utf8'));
  const extras = values.extras ? asExtras(JSON.parse(readFileSync(values.extras, 'utf8'))) : {};
  const db = openDb(values.db ?? defaultDbPath());
  const id = db.transaction(() => {
    const campaignId = values.campaign ? campaignByName(db, values.campaign).id : null;
    return insertCharacter(db, sheet, { extras, campaignId });
  })();
  const c = getCharacter(db, id);
  console.log(`Added character ${id}: ${c.name}${values.campaign ? ` (campaign "${values.campaign}")` : ''}`);
} catch (e) {
  console.error(e instanceof HttpError || e instanceof Error ? e.message : String(e));
  process.exit(1);
}
