CREATE TABLE staff_identity_snapshots (
  platform_user_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('pending','active','blocked','rejected','archived')),
  updated_at TEXT NOT NULL
);
CREATE TABLE staff_employee_profiles (
  platform_user_id TEXT PRIMARY KEY,
  personnel_number TEXT UNIQUE,
  position TEXT NOT NULL,
  hired_on TEXT NOT NULL,
  dismissed_on TEXT,
  status TEXT NOT NULL CHECK (status IN ('active','dismissed')),
  version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE staff_hr_events (
  id TEXT PRIMARY KEY,
  platform_user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('vacation','sick_leave','late','no_show','partial_shift')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  shift_id TEXT,
  minutes_late INTEGER,
  comment TEXT NOT NULL,
  created_by_platform_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX staff_hr_events_user_dates_idx ON staff_hr_events(platform_user_id,start_date,end_date,id);
CREATE TABLE staff_idempotency_keys (
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(scope,key)
);
