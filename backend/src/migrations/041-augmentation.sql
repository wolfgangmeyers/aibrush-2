ALTER TABLE images ADD COLUMN augmentation TEXT;
UPDATE images SET augmentation='upscale' WHERE upscale=true;
ALTER TABLE images DROP COLUMN upscale;
