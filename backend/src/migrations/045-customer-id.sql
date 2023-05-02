-- add nullable customer id (VARCHAR(255)) to users table
ALTER TABLE users ADD COLUMN customer_id VARCHAR(255);
