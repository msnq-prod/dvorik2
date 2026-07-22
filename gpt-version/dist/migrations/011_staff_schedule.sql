INSERT OR IGNORE INTO permissions(id, code, description) VALUES
  ('staff:manage', 'staff:manage', 'Управление профилями сотрудников и кадровыми событиями');
INSERT OR IGNORE INTO role_permissions(role_id, permission_id)
SELECT id, 'staff:manage' FROM roles WHERE id IN ('admin','super_admin');

CREATE TABLE employee_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
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
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('vacation','sick_leave','late','no_show','partial_shift')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  shift_id TEXT REFERENCES shifts(id) ON DELETE SET NULL,
  minutes_late INTEGER CHECK (minutes_late IS NULL OR minutes_late > 0),
  comment TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
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
  from_shift_id TEXT NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
  to_shift_id TEXT NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
  from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  from_shift_version INTEGER NOT NULL CHECK (from_shift_version >= 0),
  to_shift_version INTEGER NOT NULL CHECK (to_shift_version >= 0),
  status TEXT NOT NULL CHECK (status IN ('pending','accepted','declined','cancelled','expired')),
  warning_json TEXT NOT NULL DEFAULT '{"schemaVersion":1,"value":{"conflicts":[]}}',
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
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
