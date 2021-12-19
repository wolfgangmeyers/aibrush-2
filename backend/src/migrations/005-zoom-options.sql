-- add columns to the images table based on these openapi fields:
-- enable_zoom:
--     type: boolean
-- zoom_frequency:
--     type: integer
-- zoom_scale:
--     type: number
-- zoom_shift_x:
--     type: number
-- zoom_shift_y:
--     type: number

ALTER TABLE images ADD COLUMN enable_zoom BOOLEAN DEFAULT FALSE;
ALTER TABLE images ADD COLUMN zoom_frequency INTEGER DEFAULT 0;
ALTER TABLE images ADD COLUMN zoom_scale NUMERIC(10,2) DEFAULT 0.0;
ALTER TABLE images ADD COLUMN zoom_shift_x NUMERIC(10,2) DEFAULT 0.0;
ALTER TABLE images ADD COLUMN zoom_shift_y NUMERIC(10,2) DEFAULT 0.0;