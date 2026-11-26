-- One optional image per note (a portrait, a picture of a place or item): a data URL, NULL for none.
-- Not in the search index: the FTS triggers name their columns.
ALTER TABLE notes ADD COLUMN image TEXT;
