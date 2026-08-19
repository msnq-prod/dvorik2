CREATE TABLE staff_identity_outbox (
  event_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK(status IN ('pending','active','blocked','rejected','archived')),
  identity_revision INTEGER NOT NULL CHECK(identity_revision >= 0),
  correlation_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','sent','failed','requires_action')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
  available_at TEXT NOT NULL,
  lease_token TEXT,
  lease_expires_at TEXT,
  sent_at TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, identity_revision)
);
CREATE INDEX staff_identity_outbox_delivery_idx ON staff_identity_outbox(state, available_at, created_at, event_id);
