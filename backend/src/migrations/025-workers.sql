
CREATE TABLE IF NOT EXISTS workers (
    id CHAR(36) PRIMARY KEY,
    created_at bigint NOT NULL,
    display_name text NOT NULL,
    last_ping bigint,
    status text NOT NULL,
    login_code text NOT NULL
);
-- index workers on login_code
CREATE INDEX IF NOT EXISTS workers_login_code ON workers (login_code);

CREATE TABLE IF NOT EXISTS worker_configs (
    worker_id CHAR(36) PRIMARY KEY,
    model text NOT NULL,
    pool_assignment text NOT NULL,
    FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
);
