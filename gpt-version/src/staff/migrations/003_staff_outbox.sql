CREATE TABLE staff_event_outbox (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','sent','failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL,
  sent_at TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX staff_event_outbox_delivery_idx
  ON staff_event_outbox(status,available_at,created_at,event_id);
