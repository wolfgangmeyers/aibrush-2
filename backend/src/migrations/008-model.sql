-- add nullable "model" column to images table (up to 128 chars)
ALTER TABLE images ADD COLUMN model VARCHAR(128) NULL;
