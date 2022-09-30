-- add nsfw column to images table (default false)
ALTER TABLE images ADD COLUMN nsfw BOOLEAN NOT NULL DEFAULT FALSE;
