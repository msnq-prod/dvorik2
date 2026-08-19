CREATE TABLE staff_schedule_days (
  id TEXT PRIMARY KEY,
  local_date TEXT NOT NULL,
  location_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('working','closed')),
  comment TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(local_date,location_id)
);
CREATE TABLE staff_shifts (
  id TEXT PRIMARY KEY,
  local_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  location_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft','scheduled','in_progress','completed','cancelled')),
  comment TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX staff_shifts_date_idx ON staff_shifts(local_date,start_time,id);
CREATE TABLE staff_shift_assignments (
  shift_id TEXT NOT NULL REFERENCES staff_shifts(id) ON DELETE CASCADE,
  platform_user_id TEXT NOT NULL,
  PRIMARY KEY(shift_id,platform_user_id)
);
CREATE TABLE staff_shift_exchanges (
  id TEXT PRIMARY KEY,
  from_shift_id TEXT NOT NULL,
  to_shift_id TEXT NOT NULL,
  from_platform_user_id TEXT NOT NULL,
  to_platform_user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','accepted','declined','cancelled','expired')),
  warnings_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by_platform_user_id TEXT,
  version INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX staff_shift_exchanges_users_idx
  ON staff_shift_exchanges(from_platform_user_id,to_platform_user_id,created_at DESC,id);
