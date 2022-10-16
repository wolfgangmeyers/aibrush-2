-- 'temporary' column added to images table, default false
ALTER TABLE images ADD COLUMN temporary BOOLEAN NOT NULL DEFAULT FALSE;
