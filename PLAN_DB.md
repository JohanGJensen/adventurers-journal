# PLAN_DB: move app state from localStorage to a local SQLite server

## Context
All state lives in the browser's localStorage, under these keys:

| Key | Written by | Contents |
|---|---|---|
| `faelan-play-state` | `src/hooks/usePlayState.ts` | HP, temp HP, slots, hit dice, conditions, concentration, death saves, prepared spells and cantrips |
| `faelan-inventory` | `src/hooks/useInventory.ts` | coins, items (name, qty, equipped) |
| `dnd-api:v3:<kind>:<slug>`, `dnd-api:classlist:<cls>` | `src/lib/api.ts` | dnd5eapi.co lookups cached per browser |
| `dice-cinematic` | `src/lib/dice.tsx` | UI preference |

The character is hardcoded: `buildCharacter()` in `src/lib/character.ts` reads `src/data/faelan.json`. That gives one character per browser, data that is easy to lose, no history, and nowhere to keep notes.

**Goal:** a local Bun server with SQLite that holds characters, play state, inventory, a history log, campaign notes and a shared SRD cache. The React client keeps its UI and reads and writes through a small JSON API.

**Decisions made**
- Single user, **localhost only**. The server binds to `127.0.0.1`. No auth.
- **Bun + `bun:sqlite`.** No native module build.
- In scope: multiple characters, history log, shared SRD cache, campaign notes.
- Migration: an **automatic one-time import** of existing localStorage data, plus a **re-runnable CLI script** that does the same import from a JSON file.
- The app is not a PWA today (no manifest or service worker), so nothing is lost there. It will need the server running to work.

## Architecture

```
browser (React, Vite) ──fetch /api/*──▶ Bun.serve (server/) ──▶ bun:sqlite  data/dnd.sqlite
                                              └──▶ dnd5eapi.co (SRD, cached in DB)
```

- **Dev:** `bun run dev` starts the API on `127.0.0.1:3001` (`bun --watch server/index.ts`) and Vite together. Vite proxies `/api` to 3001 through `server.proxy` in `vite.config.ts`.
- **Prod-ish:** `bun run start` runs `vite build`, then one Bun process on `127.0.0.1:3000` serves both `dist/` and `/api`.
- The DB file is `data/dnd.sqlite`, added to `.gitignore`. Path can be overridden with `DND_DB`. Run `PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;` on open.
- Shared types live in `src/shared/types.ts`, imported by both client and server: `PlayState`, `Item`, `Inventory`, `Detail`, DTOs.

### Layout
```
server/
  index.ts          Bun.serve: routes /api/*, serves dist/ in prod
  db.ts             open DB, pragmas, run migrations
  migrations/       001_init.sql, 002_….sql  (applied in order, tracked by PRAGMA user_version)
  routes/           characters.ts, play.ts, inventory.ts, events.ts, notes.ts, campaigns.ts, srd.ts, import.ts
  import.ts         importLocalData(db, payload, opts): the one import code path
  srd.ts            dnd5eapi fetch + normalize (moved from src/lib/api.ts) + DB cache
scripts/
  import-local.ts   CLI for the localStorage import (see Migration)
  import-character.ts  CLI to add a character from a sheet export JSON
data/               dnd.sqlite (gitignored)
```

## Schema (`server/migrations/001_init.sql`)

```sql
CREATE TABLE campaigns (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE characters (
  id          INTEGER PRIMARY KEY,
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  sheet_json  TEXT NOT NULL,          -- raw character export; client runs buildCharacter(sheet)
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE play_state (
  character_id INTEGER PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  state_json   TEXT NOT NULL,         -- PlayState; small, fixed-size, always read whole
  version      INTEGER NOT NULL DEFAULT 0,  -- optimistic concurrency between tabs
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE coins (
  character_id INTEGER PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  cp INTEGER NOT NULL DEFAULT 0, sp INTEGER NOT NULL DEFAULT 0, ep INTEGER NOT NULL DEFAULT 0,
  gp INTEGER NOT NULL DEFAULT 0, pp INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE items (
  id           TEXT PRIMARY KEY,      -- client-generated UUID (same as today)
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  qty          INTEGER NOT NULL CHECK (qty >= 0),
  equipped     INTEGER NOT NULL DEFAULT 0,
  sort         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX items_character ON items(character_id);

CREATE TABLE events (                 -- history log, append-only
  id           INTEGER PRIMARY KEY,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  type         TEXT NOT NULL,         -- roll | damage | heal | temp_hp | slot | rest | condition | item | coins | import
  summary      TEXT NOT NULL,         -- human-readable line, e.g. "Took 7 damage (22 → 15)"
  data_json    TEXT                   -- structured details (roll dice/results, before/after)
);
CREATE INDEX events_character_at ON events(character_id, at DESC);

CREATE TABLE notes (
  id           INTEGER PRIMARY KEY,
  campaign_id  INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
  character_id INTEGER REFERENCES characters(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL DEFAULT 'note',   -- note | session | npc | quest | place
  title        TEXT NOT NULL,
  body         TEXT NOT NULL DEFAULT '',       -- markdown
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (campaign_id IS NOT NULL OR character_id IS NOT NULL)
);
CREATE VIRTUAL TABLE notes_fts USING fts5(title, body, content='notes', content_rowid='id');
-- + insert/update/delete triggers keeping notes_fts in sync

CREATE TABLE srd_cache (
  kind       TEXT NOT NULL,             -- spells | equipment | classlist
  slug       TEXT NOT NULL,
  data_json  TEXT,                      -- NULL = known miss (404 in both SRD versions)
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (kind, slug)
);

CREATE TABLE imports (                -- audit of localStorage/CLI imports
  id           INTEGER PRIMARY KEY,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  source       TEXT NOT NULL,         -- 'browser' | 'cli'
  payload_hash TEXT NOT NULL,
  at           TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Why these shapes:
- **`play_state` stays one JSON row.** It is small, fixed in size, always read and written whole, and the client owns its rules (`src/lib/rules.ts`). Splitting it into columns would add churn without making anything easier to query. History goes to `events`.
- **Items are rows.** The list grows, and rows let single-item edits avoid rewriting everything.
- **The character sheet is kept as raw JSON** and derived on the client with the existing `buildCharacter(data)`, which already takes a data argument. A new export can be re-imported without a schema change.

## API (JSON; all under `/api`)

| Method & path | Purpose |
|---|---|
| `GET /characters` · `POST /characters` (body: sheet export) · `GET/PATCH/DELETE /characters/:id` | list, import, view, rename or assign campaign, delete |
| `GET /characters/:id/play` · `PUT /characters/:id/play` `{ state, version, event? }` | read or replace play state; a stale `version` returns 409; the optional `event` is logged in the same transaction |
| `POST /characters/:id/play/reset` | reset to fresh state (logged) |
| `GET /characters/:id/inventory` | coins + items |
| `PUT /characters/:id/coins` · `POST/PATCH/DELETE /characters/:id/items[/:itemId]` · `POST /characters/:id/items/:itemId/move` | the same operations `useInventory` has today; each one logs an event |
| `POST /characters/:id/inventory/reset` | reseed from the sheet |
| `GET /characters/:id/events?before=&limit=50&type=` · `POST /characters/:id/events` | history (paged), and client-only events such as dice rolls |
| `GET/POST /campaigns` · `PATCH/DELETE /campaigns/:id` | campaigns |
| `GET /notes?campaign=&character=&q=` · `POST /notes` · `PATCH/DELETE /notes/:id` | notes; `q` searches FTS5 |
| `GET /srd/:kind/:slug` · `GET /srd/classlist/:cls` | SRD proxy: DB cache → 2024 → 2014 → `LOCAL_DETAILS` |
| `POST /import/local` `{ characterId, payload, force? }` | localStorage import (see below) |

Validation: hand-written type guards in `server/routes/*` (no new dependency). Errors come back as `{ error }` with 400/404/409.

## Client changes

- **Routing:** `/` lists characters (pick, import a sheet, create a campaign). `/c/:id` is today's sheet. `/c/:id/log` shows history. `/notes` shows campaign notes. The router is a few lines on `location.pathname` and `popstate`, so there is no new dependency.
- **`src/lib/client.ts`:** a typed `fetch` wrapper that returns `{ data } | { error }`.
- **`usePlayState(characterId)`:** load from `GET /play`. Keep the current reducer-style updates, but persist with a debounced `PUT` (about 300 ms) carrying `version`. On 409, refetch and show a "changed in another tab" toast. The existing methods (`damage`, `heal`, `longRest` and so on) pass an `event` describing what happened.
- **`useInventory(characterId)`:** apply changes optimistically, call the matching endpoint, and roll back on error. `moveOne` logic moves to the server (inside a transaction) so merges stay consistent.
- **Dice:** `useDice().roll` also does `POST /events` with type `roll`, fire-and-forget.
- **`src/lib/api.ts` `lookup`/`fetchClassSpellList`:** call `/api/srd/...`. Drop the localStorage cache but keep the in-memory `Map`. `normalizeSpell`, `normalizeEquipment` and `equipmentInfo` move to `server/srd.ts`.
- **`dice-cinematic` stays in localStorage.** It is a per-device UI preference, not game data.
- New components: `CharacterList`, `HistoryLog` (grouped by day, filter by type), `Notes` (list, editor, search).
- A connection banner shows when `/api` is unreachable ("Server not running: `bun run start`").

## Migration

One code path, `importLocalData(db, payload, { characterId, force })` in `server/import.ts`, used by both entry points.

**Payload format** (`LocalExport`, versioned):
```json
{ "format": "dnd-tool/local-export", "version": 1, "exportedAt": "…",
  "playState": { …PlayState }, "inventory": { "coins": {…}, "items": [ … ] } }
```

Behaviour:
- Validate the payload, and fill in fields that older saves lack, the same way `load()` in each hook does today.
- In one transaction: upsert `play_state`, replace `coins` and `items`, write an `import` event and an `imports` row (with a sha256 of the payload).
- If the character already has play state or items and `force` is not set, abort with 409 and change nothing.
- Importing the same payload hash again is a no-op that reports "already imported".

**1. Automatic one-time import (browser).** On the first load of `/c/:id` after the switch:
- If `faelan-play-state` or `faelan-inventory` exists in localStorage, build a `LocalExport` and `POST /api/import/local`.
- On success, rename the keys to `*.migrated-<date>`. Don't delete them, so a re-run is always possible.
- On 409, show a dialog: "Server already has data for this character. Overwrite / Keep server data / Download local data".
- The first DB start seeds Faelan from `src/data/faelan.json` (via the same code as `import-character`), so there is a character to import into.

**2. Re-runnable script.**
```
bun scripts/import-local.ts <export.json> --character <id|name> [--force] [--dry-run] [--db data/dnd.sqlite]
```
- Opens the DB directly and does not need the server running.
- `--dry-run` prints what would change: HP, slots, and item counts before and after.
- Exit codes: 0 imported, 2 already imported, 3 conflict without `--force`, 1 invalid input.
- A browser can't hand localStorage to a script, so the app gets a **Settings → "Download local data"** button. It writes the same `LocalExport` JSON from whatever is in localStorage, including the `*.migrated-*` copies. That file is the script's input.

**Companion script:** `bun scripts/import-character.ts <sheet.json> [--campaign <name>]` adds characters from the same export format as `faelan.json`.

**Backup:** `bun scripts/backup.ts` uses SQLite's `VACUUM INTO 'data/backups/dnd-<timestamp>.sqlite'`. The import script runs it automatically before `--force`.

## Phases

1. **Server skeleton.** `server/index.ts`, `db.ts`, migration 001, seeding Faelan, `GET /characters`, the Vite proxy, and `bun run dev`/`start` scripts. Move dev tooling to Bun (`bun install`; keep `vite` and `tsc`).
2. **SRD proxy.** Move fetch and normalize code to `server/srd.ts`, back it with `srd_cache`, and point `src/lib/api.ts` at `/api/srd`. This is the lowest-risk first switch and proves the client/server wiring.
3. **Play state + inventory.** Add the endpoints, rewrite `usePlayState`/`useInventory` against them, and pass the character id through `App`.
4. **Migration.** Build `server/import.ts`, `POST /import/local`, the browser auto-import, the "Download local data" button, `scripts/import-local.ts` and `scripts/backup.ts`.
5. **Multiple characters.** Add the character list route, `import-character` (CLI and UI upload), and the campaign assignment.
6. **History log.** Write events from mutations and rolls, then build the `HistoryLog` view.
7. **Campaign notes.** Add the notes CRUD, FTS search and the `Notes` view.

Each phase ships on its own with the app working throughout. Phases 1–4 replace localStorage. Phases 5–7 add the new features.

## Verification

- **`bun test`** (new `server/*.test.ts`, using an in-memory DB via `DND_DB=:memory:`):
  - migrations apply from empty, and re-running is a no-op
  - `importLocalData`: a fresh import works; the same hash is a no-op; a conflict without `force` changes nothing; `force` overwrites; old payloads missing fields get defaults
  - item `move` merge rules match today's `moveOne`
  - `PUT /play` with a stale version returns 409
  - SRD cache: hit, miss, known-miss (`NULL`) row
- **Script:**
  - `bun scripts/import-local.ts sample.json --character 1 --dry-run` prints the changes and writes nothing
  - running without `--dry-run` imports and exits 0
  - running a second time exits 2
  - `--force` writes a backup to `data/backups/` first
- **Manual:**
  - with existing localStorage data, start `bun run start`; open `/c/1` → HP, slots and inventory match what was there before
  - the keys are renamed to `*.migrated-*`
  - reload → the data now comes from the server; clearing site data does not lose it
  - two tabs: edit HP in both → the second save gets the conflict toast
  - stop the server → the connection banner shows
  - the server is not reachable from another machine on the LAN, because it binds to `127.0.0.1`
- `bun run build` (`tsc -b && vite build`) passes.

## Open points (decide during implementation)
- Whether `events` should be pruned or archived after N entries. Not needed at single-user scale.
- Whether to store derived `Character` stats server-side for queries across characters. Not needed until something wants to query them.

## Implementation notes (where the code differs from the plan above)
- `PUT /play` takes `events: EventIn[]`, not a single `event`. The 300 ms debounce can merge several actions into one save.
- `characters` has two extra columns:
  - `extras_json` holds per-character data the sheet export lacks: bonus spells, bonus cantrips, extra class spells, portrait. Faelan's values are `FAELAN_EXTRAS` in `src/data/supplement.ts`.
  - `seed_key` (`'faelan'`) marks the seeded character. Browser auto-import always targets it.
- An import counts as a conflict when the character has a `play_state` row or any logged event. Lazily seeded inventory alone does not count.
- The server derives characters with the client's `buildCharacter` (Bun runs the TS directly). Pure state helpers live in `src/shared/` and are used by both sides.
- Notes bodies are plain text, shown with `pre-wrap`. No markdown renderer.
- Event history is paged with an opaque `before=<at>~<id>` cursor.
