
CREATE TABLE suggestion_seeds (
  id CHAR(36) NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  items TEXT[],
  created_by CHAR(36) NOT NULL,
  PRIMARY KEY (id)
);
-- index by created_by
CREATE INDEX IF NOT EXISTS "suggestion_seeds_created_by" ON "suggestion_seeds" ("created_by");

CREATE TABLE suggestions_jobs (
  id CHAR(36) NOT NULL,
  created_by VARCHAR(255) NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  seed_id CHAR(36) NOT NULL,
  status VARCHAR(255) NOT NULL,
  result TEXT[],
  PRIMARY KEY (id)
);
-- index by created_by and status
CREATE INDEX IF NOT EXISTS "suggestions_job_created_by_status" ON "suggestions_jobs" ("created_by", "status", "created_at");
-- index by status and created_at (for workers)
CREATE INDEX IF NOT EXISTS "suggestions_job_status_created_at" ON "suggestions_jobs" ("status", "created_at");