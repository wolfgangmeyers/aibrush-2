DELETE FROM worker_configs;

-- drop model and pool_assignment columns, add config_json column
ALTER TABLE worker_configs
    DROP COLUMN model,
    DROP COLUMN pool_assignment,
    ADD COLUMN config_json text NOT NULL;
