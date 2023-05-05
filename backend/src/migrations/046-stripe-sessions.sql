
CREATE TABLE stripe_sessions (
  session_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  created_at BIGINT NOT NULL
);

ALTER TABLE stripe_sessions ADD CONSTRAINT fk_stripe_sessions_user_id FOREIGN KEY (user_id) REFERENCES users (id);
