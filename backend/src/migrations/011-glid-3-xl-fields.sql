-- ALTER TABLE images ADD COLUMN glid_3_xl_skip_iterations integer DEFAULT 0;
-- ALTER TABLE images ADD COLUMN glid_3_xl_clip_guidance boolean DEFAULT false;
-- ALTER TABLE images ADD COLUMN glid_3_xl_clip_guidance_scale integer DEFAULT 150;

-- exactly the same as above, but add "if not exists"
ALTER TABLE images ADD COLUMN glid_3_xl_skip_iterations integer DEFAULT 0 IF NOT EXISTS;
ALTER TABLE images ADD COLUMN glid_3_xl_clip_guidance boolean DEFAULT false IF NOT EXISTS;
ALTER TABLE images ADD COLUMN glid_3_xl_clip_guidance_scale integer DEFAULT 150 IF NOT EXISTS;
