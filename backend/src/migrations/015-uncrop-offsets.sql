-- add uncrop_offset_x and uncrop_offset_y columns to images table
ALTER TABLE images ADD COLUMN uncrop_offset_x INTEGER NOT NULL DEFAULT 0;
ALTER TABLE images ADD COLUMN uncrop_offset_y INTEGER NOT NULL DEFAULT 0;
