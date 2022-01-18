-- drop min_length and max_length columns from suggestions_jobs table
ALTER TABLE suggestions_jobs DROP COLUMN IF EXISTS min_length;
ALTER TABLE suggestions_jobs DROP COLUMN IF EXISTS max_length;
