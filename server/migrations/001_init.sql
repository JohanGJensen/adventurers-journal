CREATE TABLE campaigns (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE characters (
  id          INTEGER PRIMARY KEY,
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  sheet_json  TEXT NOT NULL,                  -- raw character export; client runs buildCharacter(sheet, extras)
  extras_json TEXT NOT NULL DEFAULT '{}',     -- CharacterExtras: data the export lacks
  seed_key    TEXT UNIQUE,                    -- 'faelan' for the character seeded from src/data/faelan.json
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE play_state (
  character_id INTEGER PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  state_json   TEXT NOT NULL,
  version      INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE coins (
  character_id INTEGER PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  cp INTEGER NOT NULL DEFAULT 0, sp INTEGER NOT NULL DEFAULT 0, ep INTEGER NOT NULL DEFAULT 0,
  gp INTEGER NOT NULL DEFAULT 0, pp INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE items (
  id           TEXT PRIMARY KEY,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  qty          INTEGER NOT NULL CHECK (qty >= 0),
  equipped     INTEGER NOT NULL DEFAULT 0,
  sort         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX items_character ON items(character_id);

CREATE TABLE events (
  id           INTEGER PRIMARY KEY,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  type         TEXT NOT NULL,
  summary      TEXT NOT NULL,
  data_json    TEXT
);
CREATE INDEX events_character_at ON events(character_id, at DESC);

CREATE TABLE notes (
  id           INTEGER PRIMARY KEY,
  campaign_id  INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
  character_id INTEGER REFERENCES characters(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL DEFAULT 'note',
  title        TEXT NOT NULL,
  body         TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (campaign_id IS NOT NULL OR character_id IS NOT NULL)
);
CREATE VIRTUAL TABLE notes_fts USING fts5(title, body, content='notes', content_rowid='id');
CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, title, body) VALUES (new.id, new.title, new.body);
END;
CREATE TRIGGER notes_ad AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, body) VALUES ('delete', old.id, old.title, old.body);
END;
CREATE TRIGGER notes_au AFTER UPDATE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, body) VALUES ('delete', old.id, old.title, old.body);
  INSERT INTO notes_fts(rowid, title, body) VALUES (new.id, new.title, new.body);
END;

CREATE TABLE srd_cache (
  kind       TEXT NOT NULL,
  slug       TEXT NOT NULL,
  data_json  TEXT,                            -- NULL = known miss (404 in both SRD versions)
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (kind, slug)
);

CREATE TABLE imports (
  id           INTEGER PRIMARY KEY,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  source       TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  at           TEXT NOT NULL DEFAULT (datetime('now'))
);
