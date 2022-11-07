-- keep track of the last scale event as a bigint
CREATE TABLE last_event (
  event_name VARCHAR(255) NOT NULL PRIMARY KEY,
  event_time BIGINT NOT NULL
);
