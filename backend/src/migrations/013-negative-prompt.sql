-- add negative_phrases column
ALTER TABLE images ADD COLUMN negative_phrases TEXT[] NOT NULL DEFAULT '{}';
