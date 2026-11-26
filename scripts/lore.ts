// `bun scripts/lore.ts <list | show <id> | write <id> <file.json> [--replace]> [--db <path>]`
// Reads and writes character lore straight in the journal database (the API is only reachable from inside
// the app), using the same server code as the app. Used by the /character-lore skill. Output is JSON.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { backup } from '../server/backup';
import { deriveCharacter, getCharacter, listCharacters } from '../server/characters';
import { openDb } from '../server/db';
import { hasInventory, readInventory } from '../server/inventory';
import { getLore, hasLore, saveLore } from '../server/routes/lore';
import type { Db } from '../server/sqlite';
import { asLore } from '../server/validate';

const USAGE = 'usage: bun scripts/lore.ts <list | show <id> | write <id> <file.json> [--replace]> [--db <path>]';

/** Where the desktop app keeps its database (see electron/main.ts: appData/adventurers-journal/dnd.sqlite). */
export function defaultDbPath(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string {
  if (env.DND_DB) return env.DND_DB;
  const appData =
    platform === 'darwin'
      ? join(homedir(), 'Library', 'Application Support')
      : platform === 'win32'
        ? (env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'))
        : (env.XDG_CONFIG_HOME ?? join(homedir(), '.config'));
  return join(appData, 'adventurers-journal', 'dnd.sqlite');
}

/** What the interview is grounded in: the derived sheet, gear, their campaign's notes and any existing lore. */
function brief(db: Db, id: number) {
  const dto = getCharacter(db, id);
  const c = deriveCharacter(db, id);
  const choices = ((Array.isArray(dto.sheet) ? dto.sheet[0] : dto.sheet) as { userChoices?: { type: string; subrace?: string }[] })?.userChoices ?? [];
  const notes = db
    .query('SELECT kind, title, body FROM notes WHERE campaign_id = ? ORDER BY updated_at DESC LIMIT 30')
    .all(dto.campaignId ?? -1) as { kind: string; title: string; body: string }[];
  return {
    id,
    name: c.name,
    race: c.race,
    subrace: choices.find((x) => x.type === 'race')?.subrace ?? null,
    class: c.className,
    subclass: c.subclass?.name ?? null,
    level: c.level,
    background: c.background,
    alignment: c.alignment,
    abilities: Object.fromEntries(c.abilities.map((a) => [a.key, a.score])),
    skills: c.skills.filter((s) => s.proficient).map((s) => s.name),
    tools: c.tools.map((t) => t.name),
    features: c.features.map((f) => `${f.name} (${f.source})`),
    spells: c.spells.map((s) => `${s.name} (${s.level ? `level ${s.level}` : 'cantrip'}, ${s.source})`),
    equipment: hasInventory(db, id) ? readInventory(db, id).items.map((x) => (x.qty > 1 ? `${x.name} ×${x.qty}` : x.name)) : c.equipment,
    notes: notes.map((n) => ({ kind: n.kind, title: n.title, body: n.body.length > 600 ? `${n.body.slice(0, 600)}…` : n.body })),
    lore: getLore(db, id),
  };
}

/** Runs one command; returns the exit code and what to print. Exported for tests. */
export function runLore(argv: string[], env: NodeJS.ProcessEnv = process.env): { code: number; out: string } {
  const args = [...argv];
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i < 0 ? false : (args.splice(i, 1), true);
  };
  const option = (name: string) => {
    const i = args.indexOf(name);
    return i < 0 ? undefined : args.splice(i, 2)[1];
  };
  const replace = flag('--replace');
  const dbPath = option('--db') ?? defaultDbPath(env);
  const [cmd, idArg, file] = args;
  const fail = (msg: string, code = 1) => ({ code, out: JSON.stringify({ error: msg }) });
  const id = Number(idArg);

  if (!['list', 'show', 'write'].includes(cmd ?? '')) return fail(USAGE, 2);
  if (cmd !== 'list' && !(Number.isInteger(id) && id > 0)) return fail(`${USAGE}\n(character id must be a positive integer)`, 2);
  if (cmd === 'write' && !file) return fail(USAGE, 2);
  if (dbPath !== ':memory:' && !existsSync(dbPath)) return fail(`No journal database at ${dbPath}. Open the app once, or pass --db / DND_DB.`);

  const db = openDb(dbPath);
  try {
    if (cmd === 'list')
      return { code: 0, out: JSON.stringify(listCharacters(db).map((c) => ({ id: c.id, name: c.name, subtitle: c.subtitle, hasLore: hasLore(db, c.id) })), null, 2) };
    if (cmd === 'show') return { code: 0, out: JSON.stringify(brief(db, id), null, 2) };

    getCharacter(db, id);
    let lore;
    try {
      lore = asLore(JSON.parse(readFileSync(file!, 'utf8')));
    } catch (e) {
      return fail(`Invalid lore file ${file}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (hasLore(db, id) && !replace) return fail(`Character ${id} already has lore. Pass --replace to overwrite it (a backup is made first).`);
    let backupPath: string | null = null;
    if (dbPath !== ':memory:') {
      backupPath = join(dirname(dbPath), 'backups', `before-lore-${id}-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
      backup(db, backupPath);
    }
    return { code: 0, out: JSON.stringify({ saved: saveLore(db, id, lore), backup: backupPath }, null, 2) };
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  } finally {
    db.close();
  }
}

if (import.meta.main) {
  const { code, out } = runLore(process.argv.slice(2));
  (code ? console.error : console.log)(out);
  process.exit(code);
}
