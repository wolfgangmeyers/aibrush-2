-- global settings table
CREATE TABLE global_settings (
    settings_key VARCHAR(255) NOT NULL PRIMARY KEY,
    settings_json jsonb NOT NULL
);
