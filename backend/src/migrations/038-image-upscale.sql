-- add upscale boolean to images table
ALTER TABLE images ADD COLUMN upscale BOOLEAN NOT NULL DEFAULT FALSE;
