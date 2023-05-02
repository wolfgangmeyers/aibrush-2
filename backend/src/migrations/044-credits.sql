drop table boost;
create table credits(
    user_id VARCHAR(255) NOT NULL PRIMARY KEY,
    free_credits INT NOT NULL,
    paid_credits INT NOT NULL
);

-- every existing user gets 500 paid credits
INSERT INTO credits (user_id, free_credits, paid_credits) SELECT id, 0, 500 FROM users;

create table deposit_codes(
    code VARCHAR(255) NOT NULL PRIMARY KEY,
    amount INT NOT NULL,
    created_at BIGINT NOT NULL
);
