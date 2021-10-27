DROP INDEX IF EXISTS "images_created_by_status";
CREATE INDEX IF NOT EXISTS "images_created_by_updated_at" ON "images" ("created_by", "updated_at");
