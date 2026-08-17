-- Staff owns employment data. Platform publishes the local identity snapshot during
-- the modular-monolith phase; a future Staff process receives the same snapshot by event.
CREATE TABLE staff_user_snapshots (
  platform_user_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('pending','active','blocked','rejected','archived')),
  updated_at TEXT NOT NULL
);
INSERT INTO staff_user_snapshots(platform_user_id,status,updated_at)
SELECT id,status,datetime('now') FROM users WHERE 1
ON CONFLICT(platform_user_id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at;

CREATE TRIGGER staff_user_snapshot_after_insert
AFTER INSERT ON users
BEGIN
  INSERT INTO staff_user_snapshots(platform_user_id,status,updated_at) VALUES (NEW.id,NEW.status,datetime('now'))
  ON CONFLICT(platform_user_id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at;
END;

CREATE TRIGGER staff_user_snapshot_after_status_update
AFTER UPDATE OF status ON users
BEGIN
  INSERT INTO staff_user_snapshots(platform_user_id,status,updated_at) VALUES (NEW.id,NEW.status,datetime('now'))
  ON CONFLICT(platform_user_id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at;
END;

ALTER TABLE employee_profiles RENAME TO employee_profiles_legacy_fk;
ALTER TABLE hr_events RENAME TO hr_events_legacy_fk;
ALTER TABLE shift_exchange_requests RENAME TO shift_exchange_requests_legacy_fk;
DROP INDEX hr_events_user_dates_idx;
DROP INDEX shift_exchange_pending_pair_unique;
DROP INDEX shift_exchange_users_created_idx;

CREATE TABLE employee_profiles (
  user_id TEXT PRIMARY KEY,
  personnel_number TEXT UNIQUE,
  position TEXT NOT NULL DEFAULT 'Продавец',
  hired_on TEXT NOT NULL,
  dismissed_on TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','dismissed')),
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (hired_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  CHECK (dismissed_on IS NULL OR dismissed_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  CHECK ((status='active' AND dismissed_on IS NULL) OR (status='dismissed' AND dismissed_on IS NOT NULL))
);

CREATE TABLE hr_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('vacation','sick_leave','late','no_show','partial_shift')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  shift_id TEXT,
  minutes_late INTEGER CHECK (minutes_late IS NULL OR minutes_late > 0),
  comment TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  CHECK (end_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  CHECK (start_date <= end_date),
  CHECK ((type='late' AND minutes_late IS NOT NULL) OR (type<>'late' AND minutes_late IS NULL))
);
CREATE INDEX hr_events_user_dates_idx ON hr_events(user_id,start_date,end_date,id);

CREATE TABLE shift_exchange_requests (
  id TEXT PRIMARY KEY,
  from_shift_id TEXT NOT NULL,
  to_shift_id TEXT NOT NULL,
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  from_shift_version INTEGER NOT NULL CHECK (from_shift_version >= 0),
  to_shift_version INTEGER NOT NULL CHECK (to_shift_version >= 0),
  status TEXT NOT NULL CHECK (status IN ('pending','accepted','declined','cancelled','expired')),
  warning_json TEXT NOT NULL DEFAULT '{"schemaVersion":1,"value":{"conflicts":[]}}',
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by_user_id TEXT,
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at TEXT NOT NULL,
  CHECK (from_shift_id <> to_shift_id),
  CHECK (from_user_id <> to_user_id),
  CHECK ((status='pending' AND resolved_at IS NULL AND resolved_by_user_id IS NULL) OR
         (status<>'pending' AND resolved_at IS NOT NULL AND resolved_by_user_id IS NOT NULL))
);
CREATE UNIQUE INDEX shift_exchange_pending_pair_unique
  ON shift_exchange_requests(from_shift_id,to_shift_id,from_user_id,to_user_id) WHERE status='pending';
CREATE INDEX shift_exchange_users_created_idx ON shift_exchange_requests(from_user_id,to_user_id,created_at DESC,id DESC);

INSERT INTO employee_profiles SELECT * FROM employee_profiles_legacy_fk;
INSERT INTO hr_events SELECT * FROM hr_events_legacy_fk;
INSERT INTO shift_exchange_requests SELECT * FROM shift_exchange_requests_legacy_fk;
DROP TABLE employee_profiles_legacy_fk;
DROP TABLE hr_events_legacy_fk;
DROP TABLE shift_exchange_requests_legacy_fk;
