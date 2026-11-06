-- Homebrew subclasses: a shared library, each tied to a class. data_json holds the HomebrewSubclass body.
CREATE TABLE homebrew_subclasses (
  id          INTEGER PRIMARY KEY,
  class_key   TEXT NOT NULL,
  name        TEXT NOT NULL,
  data_json   TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX homebrew_subclasses_class ON homebrew_subclasses(class_key);
