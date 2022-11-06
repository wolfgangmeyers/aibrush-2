-- create table orders: id, created_by, created_at, gpu_count, ends_at, amount_paid_cents
CREATE TABLE orders (
    id CHAR(36) NOT NULL PRIMARY KEY,
    created_by VARCHAR(255) REFERENCES users (id) NOT NULL,
    created_at BIGINT NOT NULL,
    ends_at BIGINT NOT NULL,
    is_active BOOLEAN NOT NULL,
    gpu_count INTEGER NOT NULL,
    amount_paid_cents INTEGER NOT NULL
);
CREATE INDEX orders_created_at_idx ON orders (created_at, ends_at);
