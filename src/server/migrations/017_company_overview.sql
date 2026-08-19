CREATE TABLE company_cash_projection (
  singleton_id INTEGER PRIMARY KEY CHECK(singleton_id=1),
  event_count INTEGER NOT NULL DEFAULT 0,
  revenue_delta_kopecks INTEGER NOT NULL DEFAULT 0,
  exception_count INTEGER NOT NULL DEFAULT 0,
  source_updated_at TEXT NOT NULL
);

CREATE TABLE company_staff_projection (
  singleton_id INTEGER PRIMARY KEY CHECK(singleton_id=1),
  active_employees INTEGER NOT NULL DEFAULT 0,
  scheduled_shifts INTEGER NOT NULL DEFAULT 0,
  pending_exchanges INTEGER NOT NULL DEFAULT 0,
  source_updated_at TEXT NOT NULL
);

CREATE TABLE company_source_watermarks (
  producer TEXT PRIMARY KEY,
  last_event_id TEXT NOT NULL,
  source_updated_at TEXT NOT NULL,
  received_at TEXT NOT NULL
);
