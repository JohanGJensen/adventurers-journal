-- Notes get alternative names, tags (both newline-separated) and kind-specific fields (JSON object of strings).
-- The search index is rebuilt to cover aliases and tags as well.
ALTER TABLE notes ADD COLUMN aliases TEXT NOT NULL DEFAULT '';
ALTER TABLE notes ADD COLUMN tags TEXT NOT NULL DEFAULT '';
ALTER TABLE notes ADD COLUMN fields_json TEXT NOT NULL DEFAULT '{}';

DROP TRIGGER notes_ai;
DROP TRIGGER notes_ad;
DROP TRIGGER notes_au;
DROP TABLE notes_fts;

CREATE VIRTUAL TABLE notes_fts USING fts5(title, body, aliases, tags, content='notes', content_rowid='id');
CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, title, body, aliases, tags) VALUES (new.id, new.title, new.body, new.aliases, new.tags);
END;
CREATE TRIGGER notes_ad AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, body, aliases, tags) VALUES ('delete', old.id, old.title, old.body, old.aliases, old.tags);
END;
CREATE TRIGGER notes_au AFTER UPDATE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, body, aliases, tags) VALUES ('delete', old.id, old.title, old.body, old.aliases, old.tags);
  INSERT INTO notes_fts(rowid, title, body, aliases, tags) VALUES (new.id, new.title, new.body, new.aliases, new.tags);
END;
INSERT INTO notes_fts(notes_fts) VALUES ('rebuild');
