-- login codes table
CREATE TABLE login_codes (
  id serial PRIMARY KEY,
  code varchar(255) NOT NULL,
  user_email VARCHAR(255) NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  expires_at timestamp NOT NULL DEFAULT now() + INTERVAL '1 hour',
  -- index on code
    CONSTRAINT login_codes_code_key UNIQUE (code)
);

-- stored procedure to delete expired login codes on insert
CREATE OR REPLACE FUNCTION delete_expired_login_codes()
  RETURNS TRIGGER AS $$
  BEGIN
    DELETE FROM login_codes
    WHERE expires_at < now();
    RETURN NULL;
  END;
  $$ LANGUAGE plpgsql;