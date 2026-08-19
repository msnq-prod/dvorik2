CREATE TABLE migration_batches (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  source_checksum TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started','completed','failed')),
  report_json TEXT NOT NULL DEFAULT '{"schemaVersion":1,"value":{}}',
  started_at TEXT NOT NULL,
  completed_at TEXT,
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at TEXT NOT NULL
);

CREATE TABLE telegram_updates (
  update_id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','processing','processed','failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error_code TEXT,
  received_at TEXT NOT NULL,
  processed_at TEXT,
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at TEXT NOT NULL
);
CREATE INDEX telegram_updates_status_received_idx ON telegram_updates(status, received_at, update_id);

CREATE TABLE webapp_notifications (
  id TEXT PRIMARY KEY,
  recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0,1)),
  created_at TEXT NOT NULL,
  read_at TEXT,
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at TEXT NOT NULL,
  CHECK ((is_read = 0 AND read_at IS NULL) OR (is_read = 1 AND read_at IS NOT NULL))
);
CREATE INDEX webapp_notifications_user_created_idx ON webapp_notifications(recipient_user_id, created_at DESC, id DESC);

ALTER TABLE sessions ADD COLUMN token_hash TEXT;
ALTER TABLE sessions ADD COLUMN version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0);
ALTER TABLE sessions ADD COLUMN updated_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';
UPDATE sessions SET updated_at = created_at WHERE updated_at = '1970-01-01T00:00:00.000Z';
CREATE UNIQUE INDEX sessions_token_hash_unique ON sessions(token_hash) WHERE token_hash IS NOT NULL;

ALTER TABLE shifts ADD COLUMN start_time TEXT NOT NULL DEFAULT '00:00' CHECK (start_time GLOB '[0-2][0-9]:[0-5][0-9]' AND substr(start_time, 1, 2) BETWEEN '00' AND '23');
ALTER TABLE shifts ADD COLUMN end_time TEXT NOT NULL DEFAULT '23:59' CHECK (end_time GLOB '[0-2][0-9]:[0-5][0-9]' AND substr(end_time, 1, 2) BETWEEN '00' AND '23');

ALTER TABLE shift_swap_requests ADD COLUMN version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0);
ALTER TABLE shift_swap_requests ADD COLUMN updated_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';
UPDATE shift_swap_requests SET updated_at = COALESCE(resolved_at, created_at) WHERE updated_at = '1970-01-01T00:00:00.000Z';

ALTER TABLE imports ADD COLUMN source_json TEXT NOT NULL DEFAULT '{"schemaVersion":1,"value":{}}';
ALTER TABLE imports ADD COLUMN migration_batch_id TEXT REFERENCES migration_batches(id) ON DELETE SET NULL;
ALTER TABLE imports ADD COLUMN version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0);
ALTER TABLE imports ADD COLUMN updated_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';
UPDATE imports SET updated_at = COALESCE(reverted_at, committed_at, created_at) WHERE updated_at = '1970-01-01T00:00:00.000Z';

ALTER TABLE import_rows ADD COLUMN version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0);
ALTER TABLE import_rows ADD COLUMN updated_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';
UPDATE import_rows SET updated_at = (SELECT imports.updated_at FROM imports WHERE imports.id = import_rows.import_id) WHERE updated_at = '1970-01-01T00:00:00.000Z';

ALTER TABLE merge_jobs ADD COLUMN version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0);
ALTER TABLE merge_jobs ADD COLUMN updated_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';
UPDATE merge_jobs SET updated_at = COALESCE(reverted_at, committed_at, created_at) WHERE updated_at = '1970-01-01T00:00:00.000Z';

ALTER TABLE label_jobs ADD COLUMN version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0);
ALTER TABLE label_jobs ADD COLUMN updated_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';
UPDATE label_jobs SET updated_at = COALESCE(completed_at, created_at) WHERE updated_at = '1970-01-01T00:00:00.000Z';

ALTER TABLE notification_preferences ADD COLUMN version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0);

ALTER TABLE outbox_messages ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 8 CHECK (max_attempts > 0);
ALTER TABLE outbox_messages ADD COLUMN lease_owner TEXT;
ALTER TABLE outbox_messages ADD COLUMN lease_token TEXT;
ALTER TABLE outbox_messages ADD COLUMN lease_expires_at TEXT;
ALTER TABLE outbox_messages ADD COLUMN last_error_code TEXT;
ALTER TABLE outbox_messages ADD COLUMN failed_at TEXT;
ALTER TABLE outbox_messages ADD COLUMN version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0);
ALTER TABLE outbox_messages ADD COLUMN updated_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';
UPDATE outbox_messages
SET status = 'pending', last_error_code = 'RECOVERED_LEGACY_PROCESSING', updated_at = created_at
WHERE status = 'processing';
UPDATE outbox_messages SET max_attempts = attempt_count WHERE attempt_count > max_attempts;
UPDATE outbox_messages SET updated_at = COALESCE(sent_at, created_at) WHERE updated_at = '1970-01-01T00:00:00.000Z';
CREATE UNIQUE INDEX outbox_messages_lease_token_unique ON outbox_messages(lease_token) WHERE lease_token IS NOT NULL;
CREATE TRIGGER outbox_lease_consistency_insert BEFORE INSERT ON outbox_messages
WHEN (NEW.status = 'processing' AND (NEW.lease_owner IS NULL OR NEW.lease_token IS NULL OR NEW.lease_expires_at IS NULL))
  OR (NEW.status <> 'processing' AND (NEW.lease_owner IS NOT NULL OR NEW.lease_token IS NOT NULL OR NEW.lease_expires_at IS NOT NULL))
BEGIN SELECT RAISE(ABORT, 'outbox lease mismatch'); END;
CREATE TRIGGER outbox_lease_consistency_update BEFORE UPDATE OF status, lease_owner, lease_token, lease_expires_at ON outbox_messages
WHEN (NEW.status = 'processing' AND (NEW.lease_owner IS NULL OR NEW.lease_token IS NULL OR NEW.lease_expires_at IS NULL))
  OR (NEW.status <> 'processing' AND (NEW.lease_owner IS NOT NULL OR NEW.lease_token IS NOT NULL OR NEW.lease_expires_at IS NOT NULL))
BEGIN SELECT RAISE(ABORT, 'outbox lease mismatch'); END;
CREATE TRIGGER outbox_attempt_limit_insert BEFORE INSERT ON outbox_messages
WHEN NEW.attempt_count > NEW.max_attempts
BEGIN SELECT RAISE(ABORT, 'outbox attempts exceed max'); END;
CREATE TRIGGER outbox_attempt_limit_update BEFORE UPDATE OF attempt_count, max_attempts ON outbox_messages
WHEN NEW.attempt_count > NEW.max_attempts
BEGIN SELECT RAISE(ABORT, 'outbox attempts exceed max'); END;

ALTER TABLE audit_entries ADD COLUMN version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0);
ALTER TABLE audit_entries ADD COLUMN updated_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';
UPDATE audit_entries SET updated_at = created_at WHERE updated_at = '1970-01-01T00:00:00.000Z';

ALTER TABLE idempotency_keys ADD COLUMN version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0);
ALTER TABLE idempotency_keys ADD COLUMN updated_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';
UPDATE idempotency_keys SET updated_at = COALESCE(completed_at, created_at) WHERE updated_at = '1970-01-01T00:00:00.000Z';
