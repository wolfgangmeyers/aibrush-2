-- svg_jobs: id, created_by, created_at, updated_at, image_id, status

CREATE TABLE svg_jobs (
  id CHAR(36) NOT NULL,
  created_by VARCHAR(255) NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  image_id CHAR(36) NOT NULL,
  status VARCHAR(255) NOT NULL,
  PRIMARY KEY (id)
);
-- index by status and created_at for workers
CREATE INDEX IF NOT EXISTS "svg_jobs_status_created_at" ON "svg_jobs" ("status", "created_at");
