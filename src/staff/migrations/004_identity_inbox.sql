ALTER TABLE staff_identity_snapshots ADD COLUMN core_revision INTEGER NOT NULL DEFAULT -1;

CREATE TABLE staff_identity_inbox (
  event_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  identity_revision INTEGER NOT NULL CHECK(identity_revision >= 0),
  status TEXT NOT NULL CHECK(status IN ('pending','active','blocked','rejected','archived')),
  correlation_id TEXT NOT NULL,
  received_at TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('applied','duplicate','stale'))
);
CREATE INDEX staff_identity_inbox_user_revision_idx ON staff_identity_inbox(user_id, identity_revision);
