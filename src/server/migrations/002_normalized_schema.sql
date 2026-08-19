-- Normalized SQLite persistence v2.
-- This file is deliberately rerunnable: the migration runner records the version,
-- while IF NOT EXISTS keeps a recovery/replay invocation harmless.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL COLLATE NOCASE UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  telegram_user_id TEXT UNIQUE,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  username TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('pending','active','blocked','rejected','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  archived_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique
  ON users(username COLLATE NOCASE) WHERE username <> '';

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  assigned_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK (method IN ('demo','telegram','magic_link')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS sessions_user_active_idx ON sessions(user_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  contact_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  official_name TEXT NOT NULL,
  local_name TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL CHECK (unit IN ('шт','кг','л','м')),
  photo_url TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','deleted')),
  low_stock_threshold REAL NOT NULL DEFAULT 0 CHECK (low_stock_threshold >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  archived_at TEXT
);
CREATE INDEX IF NOT EXISTS products_status_name_idx ON products(status, official_name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS product_identifiers (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('supplier_article','barcode','legacy_article','other')),
  value TEXT NOT NULL,
  normalized_value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (product_id, type, normalized_value, supplier_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS product_identifiers_barcode_unique
  ON product_identifiers(normalized_value) WHERE type = 'barcode';
CREATE INDEX IF NOT EXISTS product_identifiers_lookup_idx ON product_identifiers(type, normalized_value);

CREATE TABLE IF NOT EXISTS supplier_skus (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  sku TEXT NOT NULL,
  normalized_sku TEXT NOT NULL,
  source_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (supplier_id, normalized_sku)
);
CREATE INDEX IF NOT EXISTS supplier_skus_product_idx ON supplier_skus(product_id);

CREATE TABLE IF NOT EXISTS product_aliases (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (product_id, normalized_alias)
);
CREATE INDEX IF NOT EXISTS product_aliases_lookup_idx ON product_aliases(normalized_alias);

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('warehouse','house','counter','other')),
  parent_id TEXT REFERENCES locations(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS stock_balances (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  quantity REAL NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (product_id, location_id)
);
CREATE INDEX IF NOT EXISTS stock_balances_location_idx ON stock_balances(location_id, product_id);

CREATE TABLE IF NOT EXISTS stock_operations (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('receipt','transfer','write_off','inventory_adjustment','correction','reversal','merge')),
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  from_location_id TEXT REFERENCES locations(id) ON DELETE RESTRICT,
  to_location_id TEXT REFERENCES locations(id) ON DELETE RESTRICT,
  quantity REAL NOT NULL CHECK (quantity > 0),
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT,
  reversed_operation_id TEXT REFERENCES stock_operations(id) ON DELETE RESTRICT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (from_location_id IS NULL OR to_location_id IS NULL OR from_location_id <> to_location_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS stock_operations_idempotency_unique
  ON stock_operations(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS stock_operations_product_created_idx ON stock_operations(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stock_operations_from_created_idx ON stock_operations(from_location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stock_operations_to_created_idx ON stock_operations(to_location_id, created_at DESC);

CREATE TABLE IF NOT EXISTS schedule_days (
  id TEXT PRIMARY KEY,
  local_date TEXT NOT NULL,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'working' CHECK (status IN ('working','closed')),
  comment TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (local_date, location_id)
);
CREATE INDEX IF NOT EXISTS schedule_days_date_idx ON schedule_days(local_date, status);

CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY,
  schedule_day_id TEXT NOT NULL REFERENCES schedule_days(id) ON DELETE RESTRICT,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  local_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','scheduled','in_progress','completed','cancelled')),
  comment TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (local_date <> '')
);
CREATE INDEX IF NOT EXISTS shifts_date_location_idx ON shifts(local_date, location_id, status);

CREATE TABLE IF NOT EXISTS shift_assignments (
  shift_id TEXT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (shift_id, user_id)
);
CREATE INDEX IF NOT EXISTS shift_assignments_user_idx ON shift_assignments(user_id, shift_id);

CREATE TABLE IF NOT EXISTS shift_swap_requests (
  id TEXT PRIMARY KEY,
  from_shift_id TEXT NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
  from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('pending','accepted','declined','cancelled','expired')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  resolved_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  CHECK (from_user_id <> to_user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS shift_swap_pending_unique
  ON shift_swap_requests(from_shift_id, from_user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS shift_swap_recipient_status_idx ON shift_swap_requests(to_user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS rotation_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  cycle_json TEXT NOT NULL,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS rotation_templates_location_idx ON rotation_templates(location_id, status);

CREATE TABLE IF NOT EXISTS imports (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('previewed','committed','reverted','failed')),
  file_name TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  preview_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  committed_at TEXT,
  reverted_at TEXT,
  UNIQUE (content_hash)
);

CREATE TABLE IF NOT EXISTS import_rows (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL CHECK (row_number > 0),
  raw_json TEXT NOT NULL,
  normalized_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','valid','invalid','committed','skipped')),
  error_json TEXT NOT NULL DEFAULT '[]',
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  UNIQUE (import_id, row_number)
);
CREATE INDEX IF NOT EXISTS import_rows_import_status_idx ON import_rows(import_id, status);

CREATE TABLE IF NOT EXISTS merge_jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('previewed','committed','reverted','failed')),
  source_product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  target_product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  snapshot_json TEXT NOT NULL,
  result_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  committed_at TEXT,
  reverted_at TEXT,
  CHECK (source_product_id <> target_product_id)
);
CREATE INDEX IF NOT EXISTS merge_jobs_product_idx ON merge_jobs(source_product_id, target_product_id, status);

CREATE TABLE IF NOT EXISTS label_jobs (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','queued','processing','completed','failed','cancelled')),
  template_id TEXT NOT NULL,
  geometry_json TEXT NOT NULL,
  labels_json TEXT NOT NULL,
  result_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS label_jobs_actor_created_idx ON label_jobs(actor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('telegram','webapp')),
  event_type TEXT NOT NULL,
  delivery_mode TEXT NOT NULL CHECK (delivery_mode IN ('off','instant','daily')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, channel, event_type)
);

CREATE TABLE IF NOT EXISTS outbox_messages (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('telegram','webapp')),
  recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','failed','cancelled')),
  idempotency_key TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_error TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS outbox_messages_idempotency_unique
  ON outbox_messages(channel, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS outbox_messages_dispatch_idx ON outbox_messages(status, available_at);

CREATE TABLE IF NOT EXISTS audit_entries (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  changes_json TEXT NOT NULL DEFAULT '{}',
  request_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS audit_entries_entity_idx ON audit_entries(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_entries_actor_idx ON audit_entries(actor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','completed','failed')),
  response_status INTEGER,
  response_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  expires_at TEXT,
  PRIMARY KEY (scope, key)
);
CREATE INDEX IF NOT EXISTS idempotency_keys_expiry_idx ON idempotency_keys(expires_at);
