-- Add size (int) column to table "images"
ALTER TABLE images ADD COLUMN IF NOT EXISTS size int NOT NULL DEFAULT 512;
