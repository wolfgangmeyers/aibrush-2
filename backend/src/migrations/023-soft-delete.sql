ALTER TABLE images ADD COLUMN deleted_at BIGINT DEFAULT NULL;
-- index
CREATE INDEX images_deleted_at ON images (deleted_at);
