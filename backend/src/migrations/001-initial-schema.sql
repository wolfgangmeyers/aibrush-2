
CREATE TABLE IF NOT EXISTS "images" (
    "id" CHAR(36) NOT NULL PRIMARY KEY,
    "created_at" BIGINT NOT NULL,
    "created_by" VARCHAR(255) NOT NULL,
    "updated_at" BIGINT NOT NULL,
    "phrases" TEXT[] NOT NULL,
    "label" TEXT NOT NULL,
    "parent" VARCHAR(36),
    "iterations" INTEGER NOT NULL,
    "current_iterations" INTEGER NOT NULL,
    "score" FLOAT NOT NULL,
    "status" VARCHAR(255) NOT NULL
);

-- index by created_by and status
CREATE INDEX IF NOT EXISTS "images_created_by_status" ON "images" ("created_by", "status", "created_at");
-- index by status and created_at (for workers)
CREATE INDEX IF NOT EXISTS "images_status_created_at" ON "images" ("status", "created_at");
-- index by parent
CREATE INDEX IF NOT EXISTS "images_parent" ON "images" ("parent");

