-- Level-ups past the export's level: JSON array of LevelChoice (see src/shared/types.ts).
ALTER TABLE characters ADD COLUMN levels_json TEXT NOT NULL DEFAULT '[]';
