-- CREATE TABLE IF NOT EXISTS worker_configs (
--     worker_id CHAR(36) PRIMARY KEY,
--     model text NOT NULL,
--     pool_assignment text NOT NULL,
--     FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
-- );

-- drop model and pool_assignment columns, add config_json column
ALTER TABLE worker_configs
    DROP COLUMN model,
    DROP COLUMN pool_assignment,
    ADD COLUMN config_json text NOT NULL;
