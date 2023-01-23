/**
 * -- login codes table
CREATE TABLE login_codes (
  id serial PRIMARY KEY,
  code varchar(255) NOT NULL,
  user_email VARCHAR(255) NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  expires_at timestamp NOT NULL DEFAULT now() + INTERVAL '1 hour',
  -- index on code
    CONSTRAINT login_codes_code_key UNIQUE (code)
);
 */

import { GlobalSettings } from "./client";

export interface LoginCode {
    id: number;
    code: string;
    user_email: string;
    created_at: Date;
    expires_at: Date;
}

export interface MinimumWorkerAllocations {
  [model: string]: number;
}

export interface WorkerSettingsJson {
  minimum_worker_allocations: MinimumWorkerAllocations;
}

export interface WorkerSettings extends GlobalSettings {
  settings_json: WorkerSettingsJson;
}