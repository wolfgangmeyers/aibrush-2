-- Add size (int) column to table "images"
ALTER TABLE images ADD COLUMN size int NOT NULL DEFAULT 512 IF NOT EXISTS;
