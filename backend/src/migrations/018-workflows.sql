CREATE TABLE IF NOT EXISTS "workflows" (
    "id" varchar(36) NOT NULL,
    "created_by" varchar(255) NOT NULL,
    "label" varchar(255) NOT NULL,
    "workflow_type" varchar(36) NOT NULL,
    "state" varchar(36) NOT NULL,
    "config_json" text NOT NULL,
    "data_json" text NOT NULL,
    "is_active" boolean NOT NULL,
    "execution_delay" integer NOT NULL,
    "next_execution" BIGINT NOT NULL,
    "created_at" BIGINT NOT NULL,
    CONSTRAINT "pk_workflow" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "workflow_events" (
    "id" varchar(36) NOT NULL,
    "workflow_id" varchar(36) NOT NULL,
    "created_at" BIGINT NOT NULL,
    "message" text NOT NULL,
    CONSTRAINT "pk_workflow_event" PRIMARY KEY ("id"),
    CONSTRAINT "fk_workflow_event_workflow" FOREIGN KEY ("workflow_id") REFERENCES "workflows" ("id") ON DELETE CASCADE
);