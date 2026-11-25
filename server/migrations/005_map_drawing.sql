-- Journey map drawing: freehand lines and pins in map units (pixel space of the hex grid), replacing hex-to-hex trails.
CREATE TABLE map_paths (
  id           INTEGER PRIMARY KEY,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('trail', 'road', 'river', 'border')),
  -- [[x, y], ...] in drawing order
  points_json  TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX map_paths_character ON map_paths(character_id);

CREATE TABLE map_marks (
  id           INTEGER PRIMARY KEY,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('party', 'camp', 'battle', 'treasure', 'danger', 'quest', 'npc', 'text')),
  x            REAL NOT NULL,
  y            REAL NOT NULL,
  label        TEXT NOT NULL DEFAULT '',
  note_id      INTEGER REFERENCES notes(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX map_marks_character ON map_marks(character_id);

-- Old trails were hex coordinates [q, r]; their centres are x = 40·√3·(q + r/2), y = 60·r.
INSERT INTO map_paths (character_id, kind, points_json, created_at)
SELECT t.character_id, 'trail',
       (SELECT json_group_array(json_array(round(69.2820323 * (json_extract(p.value, '$[0]') + json_extract(p.value, '$[1]') / 2.0), 1),
                                           60 * json_extract(p.value, '$[1]')))
          FROM json_each(t.points_json) p),
       t.created_at
  FROM map_trails t ORDER BY t.id;
DROP TABLE map_trails;
