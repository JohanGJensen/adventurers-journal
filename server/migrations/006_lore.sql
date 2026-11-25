-- A character's backstory sections and trait lists, as one JSON document (shape: Lore in src/shared/types.ts).
CREATE TABLE character_lore (
  character_id INTEGER PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  data_json    TEXT NOT NULL DEFAULT '{}',
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
