-- add width and height columns to images table
ALTER TABLE images ADD COLUMN width INTEGER NOT NULL DEFAULT 0;
ALTER TABLE images ADD COLUMN height INTEGER NOT NULL DEFAULT 0;

-- migrate from size to width and height
-- Update all existing images to have a width and height equal to the size in each column
UPDATE images SET width = size, height = size;
-- drop size column
ALTER TABLE images DROP COLUMN size;
