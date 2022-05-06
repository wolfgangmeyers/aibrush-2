ALTER TABLE images ADD COLUMN glid_3_xl_skip_iterations integer DEFAULT 0;
ALTER TABLE images ADD COLUMN glid_3_xl_clip_guidance boolean DEFAULT false;
ALTER TABLE images ADD COLUMN glid_3_xl_clip_guidance_scale integer DEFAULT 150;