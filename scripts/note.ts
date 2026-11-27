// `bun scripts/note.ts <list | kinds | show <characterId> | write <characterId> <file.json> [--force]> [--db <path>]`
// Creates campaign notes (NPCs, places, lore…) straight in the journal database (the API is only reachable from
// inside the app), using the same server code as the app. Used by the /campaign-note skill. Output is JSON.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { backup } from '../server/backup';
import { getCampaign } from '../server/campaigns';
import { deriveCharacter, getCharacter, listCharacters } from '../server/characters';
import { openDb } from '../server/db';
import { createNote } from '../server/routes/notes';
import type { Db } from '../server/sqlite';
import { normName } from '../src/shared/noteLinks';
import { NOTE_FIELDS, NOTE_KIND_LABELS, NOTE_KINDS } from '../src/shared/types';
import { defaultDbPath } from './lore';

const USAGE = 'usage: bun scripts/note.ts <list | kinds | show <characterId> | write <characterId> <file.json> [--force]> [--db <path>]';

interface NoteRow {
  id: number;
  kind: string;
  title: string;
  body: string;
  aliases: string;
  fields_json: string;
}

const lines = (s: string) => (s ? s.split('\n') : []);

function campaignNotes(db: Db, campaignId: number) {
  const rows = db
    .query('SELECT id, kind, title, body, aliases, fields_json FROM notes WHERE campaign_id = ? ORDER BY kind, title COLLATE NOCASE')
    .all(campaignId) as NoteRow[];
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    aliases: lines(r.aliases),
    fields: JSON.parse(r.fields_json || '{}') as Record<string, string>,
    body: r.body.length > 300 ? `${r.body.slice(0, 300)}…` : r.body,
  }));
}

/** The note kinds and their fields, so the skill never hard-codes them. */
const kinds = () =>
  NOTE_KINDS.map((kind) => ({
    kind,
    label: NOTE_KIND_LABELS[kind],
    fields: NOTE_FIELDS[kind].map((f) => ({
      key: f.key,
      label: f.label,
      ...(f.options ? { options: f.options } : {}),
      ...(f.suggest ? { suggest: f.suggest } : {}),
      ...(f.ref ? { ref: f.ref } : {}),
    })),
  }));

/** What the interview is grounded in: who the character is, their campaign and everything already in it. */
function brief(db: Db, id: number) {
  const dto = getCharacter(db, id);
  const c = deriveCharacter(db, id);
  const campaign = dto.campaignId ? getCampaign(db, dto.campaignId) : null;
  return {
    id,
    name: c.name,
    race: c.race,
    class: c.className,
    subclass: c.subclass?.name ?? null,
    level: c.level,
    background: c.background,
    alignment: c.alignment,
    campaign: campaign && { id: campaign.id, name: campaign.name },
    notes: campaign ? campaignNotes(db, campaign.id) : [],
  };
}

/** Runs one command; returns the exit code and what to print. Exported for tests. */
export function runNote(argv: string[], env: NodeJS.ProcessEnv = process.env): { code: number; out: string } {
  const args = [...argv];
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i < 0 ? false : (args.splice(i, 1), true);
  };
  const option = (name: string) => {
    const i = args.indexOf(name);
    return i < 0 ? undefined : args.splice(i, 2)[1];
  };
  const force = flag('--force');
  const dbPath = option('--db') ?? defaultDbPath(env);
  const [cmd, idArg, file] = args;
  const fail = (msg: string, code = 1) => ({ code, out: JSON.stringify({ error: msg }) });
  const id = Number(idArg);

  if (cmd === 'kinds') return { code: 0, out: JSON.stringify(kinds(), null, 2) };
  if (!['list', 'show', 'write'].includes(cmd ?? '')) return fail(USAGE, 2);
  if (cmd !== 'list' && !(Number.isInteger(id) && id > 0)) return fail(`${USAGE}\n(character id must be a positive integer)`, 2);
  if (cmd === 'write' && !file) return fail(USAGE, 2);
  if (dbPath !== ':memory:' && !existsSync(dbPath)) return fail(`No journal database at ${dbPath}. Open the app once, or pass --db / DND_DB.`);

  const db = openDb(dbPath);
  try {
    if (cmd === 'list') {
      const out = listCharacters(db).map((c) => ({
        id: c.id,
        name: c.name,
        subtitle: c.subtitle,
        campaignId: c.campaignId,
        campaign: c.campaignId ? getCampaign(db, c.campaignId).name : null,
      }));
      return { code: 0, out: JSON.stringify(out, null, 2) };
    }
    if (cmd === 'show') return { code: 0, out: JSON.stringify(brief(db, id), null, 2) };

    const character = getCharacter(db, id);
    if (!character.campaignId) return fail(`${character.name} isn't in a campaign yet. Add them to one in the app first; notes belong to a campaign.`);
    let input: Record<string, unknown>;
    try {
      const parsed = JSON.parse(readFileSync(file!, 'utf8')) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('expected an object { kind, title, body, aliases?, tags?, fields? }');
      input = parsed as Record<string, unknown>;
    } catch (e) {
      return fail(`Invalid note file ${file}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (typeof input.title !== 'string' || !input.title.trim()) return fail('The note needs a title');
    if (!force) {
      const names = [input.title, ...(Array.isArray(input.aliases) ? input.aliases : [])].filter((x): x is string => typeof x === 'string').map(normName);
      const clash = campaignNotes(db, character.campaignId).find((n) => [n.title, ...n.aliases].some((x) => names.includes(normName(x))));
      if (clash) return fail(`"${clash.title}" (${clash.kind}, id ${clash.id}) already uses that name in this campaign. Pick another title, or pass --force to add it anyway.`);
    }
    const note = { ...input, campaignId: character.campaignId, characterId: undefined };
    // Validate with a dry run that's rolled back, so a bad file never leaves a backup behind.
    const DRY = new Error('dry run');
    try {
      db.transaction(() => {
        createNote(db, note);
        throw DRY;
      })();
    } catch (e) {
      if (e !== DRY) throw e;
    }
    let backupPath: string | null = null;
    if (dbPath !== ':memory:') {
      backupPath = join(dirname(dbPath), 'backups', `before-note-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
      backup(db, backupPath);
    }
    const { image: _, ...saved } = createNote(db, note);
    return { code: 0, out: JSON.stringify({ saved, backup: backupPath }, null, 2) };
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  } finally {
    db.close();
  }
}

if (import.meta.main) {
  const { code, out } = runNote(process.argv.slice(2));
  (code ? console.error : console.log)(out);
  process.exit(code);
}
