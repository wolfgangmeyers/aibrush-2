CREATE TABLE users(
    id VARCHAR(255) NOT NULL PRIMARY KEY,
    active BOOLEAN NOT NULL
);

-- populate users table with created_by from images table
INSERT INTO users (id, active) SELECT DISTINCT created_by, true FROM images;

CREATE TABLE invite_codes(
    id VARCHAR(255) NOT NULL PRIMARY KEY,
    created_at BIGINT NOT NULL
);
