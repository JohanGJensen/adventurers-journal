-- Notes belong to campaigns only. A character's notes move to that character's campaign; a character
-- with notes but no campaign first gets one of its own ("<name>'s adventures"), so nothing is lost.
-- notes.character_id stays (dropping it means rebuilding the table and its FTS triggers) but is always NULL.
CREATE TEMP TABLE orphan AS
  SELECT c.id AS character_id, c.name AS name,
         (SELECT coalesce(max(id), 0) FROM campaigns) + row_number() OVER (ORDER BY c.id) AS campaign_id
  FROM characters c
  WHERE c.campaign_id IS NULL AND EXISTS (SELECT 1 FROM notes n WHERE n.character_id = c.id AND n.campaign_id IS NULL);
INSERT INTO campaigns (id, name) SELECT campaign_id, name || '''s adventures' FROM orphan;
UPDATE characters SET campaign_id = (SELECT o.campaign_id FROM orphan o WHERE o.character_id = characters.id)
  WHERE id IN (SELECT character_id FROM orphan);
DROP TABLE orphan;

UPDATE notes SET campaign_id = (SELECT c.campaign_id FROM characters c WHERE c.id = notes.character_id)
  WHERE campaign_id IS NULL;
UPDATE notes SET character_id = NULL WHERE character_id IS NOT NULL;
