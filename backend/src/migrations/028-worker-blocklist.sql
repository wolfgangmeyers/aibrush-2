-- blocklist
-- id, engine, until
CREATE TABLE blocklist (
    id VARCHAR(255) NOT NULL,
    engine VARCHAR(255) NOT NULL,
    until BIGINT NOT NULL,
    PRIMARY KEY (id, engine)
);
