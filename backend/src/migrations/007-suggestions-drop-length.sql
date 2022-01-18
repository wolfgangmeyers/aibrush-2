-- drop min_length and max_length columns from suggestions_jobs table
ALTER TABLE suggestions_jobs DROP COLUMN min_length;
ALTER TABLE suggestions_jobs DROP COLUMN max_length;
