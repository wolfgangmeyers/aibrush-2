

CREATE TABLE boost (
    user_id VARCHAR(255) NOT NULL,
    activated_at bigint NOT NULL,
    balance bigint NOT NULL,
    level integer NOT NULL,
    PRIMARY KEY (user_id)
);

CREATE INDEX boost_level_idx ON boost (level);
