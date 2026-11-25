-- Journey map (Cartographer's Tools): hexes on an axial grid and the trails drawn across them, per character.
CREATE TABLE map_hexes (
  id           INTEGER PRIMARY KEY,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  q            INTEGER NOT NULL,
  r            INTEGER NOT NULL,
  terrain      TEXT NOT NULL,
  state        TEXT NOT NULL DEFAULT 'sketched' CHECK (state IN ('sketched', 'charted')),
  label        TEXT NOT NULL DEFAULT '',
  note_id      INTEGER REFERENCES notes(id) ON DELETE SET NULL,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (character_id, q, r)
);
CREATE TABLE map_trails (
  id           INTEGER PRIMARY KEY,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  -- [[q, r], ...] in travel order
  points_json  TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX map_trails_character ON map_trails(character_id);
