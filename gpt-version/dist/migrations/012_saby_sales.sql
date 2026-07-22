INSERT OR IGNORE INTO permissions(id, code, description) VALUES
  ('saby:manage', 'saby:manage', 'Управление интеграцией и сопоставлениями Saby');
INSERT OR IGNORE INTO role_permissions(role_id, permission_id)
SELECT id, 'saby:manage' FROM roles WHERE id IN ('admin','super_admin');

INSERT OR IGNORE INTO users(id, first_name, last_name, username, status, created_at, updated_at, archived_at)
VALUES ('system-saby', 'Saby', 'Integration', '', 'archived', datetime('now'), datetime('now'), datetime('now'));

CREATE TABLE saby_webhook_signals (
  id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','processed','failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error_code TEXT,
  received_at TEXT NOT NULL,
  processed_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX saby_webhook_signals_status_idx ON saby_webhook_signals(status, received_at, id);

CREATE TABLE saby_sync_state (
  scope TEXT PRIMARY KEY,
  cursor_updated_at TEXT,
  last_success_at TEXT,
  last_error_code TEXT,
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO saby_sync_state(scope, updated_at) VALUES ('retail_sales', datetime('now'));

CREATE TABLE saby_external_items (
  nomenclature_uuid TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  barcode TEXT NOT NULL DEFAULT '',
  article TEXT NOT NULL DEFAULT '',
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0)
);

CREATE TABLE saby_product_mappings (
  nomenclature_uuid TEXT PRIMARY KEY REFERENCES saby_external_items(nomenclature_uuid) ON DELETE RESTRICT,
  product_id TEXT NOT NULL UNIQUE REFERENCES products(id) ON DELETE RESTRICT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at TEXT NOT NULL
);

CREATE TABLE saby_sales (
  external_key TEXT PRIMARY KEY,
  external_sale_id INTEGER,
  point_id INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('completed','deleted','nonfiscal')),
  is_return INTEGER NOT NULL CHECK (is_return IN (0,1)),
  return_sale_key TEXT,
  business_time TEXT NOT NULL,
  external_updated_at TEXT NOT NULL,
  total_kopecks INTEGER NOT NULL,
  revision_sha256 TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  received_at TEXT NOT NULL,
  applied_at TEXT,
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at TEXT NOT NULL
);
CREATE INDEX saby_sales_updated_idx ON saby_sales(external_updated_at, external_key);

CREATE TABLE saby_sale_lines (
  external_sale_key TEXT NOT NULL REFERENCES saby_sales(external_key) ON DELETE CASCADE,
  external_line_key TEXT NOT NULL,
  nomenclature_uuid TEXT NOT NULL REFERENCES saby_external_items(nomenclature_uuid) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  barcode TEXT NOT NULL DEFAULT '',
  article TEXT NOT NULL DEFAULT '',
  quantity_milli INTEGER NOT NULL CHECK (quantity_milli > 0),
  total_kopecks INTEGER NOT NULL,
  discount_kopecks INTEGER NOT NULL DEFAULT 0,
  refused INTEGER NOT NULL CHECK (refused IN (0,1)),
  stock_status TEXT NOT NULL CHECK (stock_status IN ('not_applicable','unmapped','queued_inventory','blocked_negative','applied')),
  applied_quantity_milli INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(external_sale_key, external_line_key)
);
CREATE INDEX saby_sale_lines_mapping_idx ON saby_sale_lines(nomenclature_uuid, stock_status, external_sale_key);

CREATE TABLE saby_sale_deltas (
  id TEXT PRIMARY KEY,
  external_sale_key TEXT NOT NULL REFERENCES saby_sales(external_key) ON DELETE RESTRICT,
  revision_sha256 TEXT NOT NULL,
  revenue_delta_kopecks INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('initial','revision','deleted','nonfiscal','return')),
  created_at TEXT NOT NULL,
  UNIQUE(external_sale_key, revision_sha256)
);

CREATE TABLE saby_reconciliation_runs (
  id TEXT PRIMARY KEY,
  from_time TEXT NOT NULL,
  to_time TEXT NOT NULL,
  orders_seen INTEGER NOT NULL DEFAULT 0,
  orders_changed INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('running','completed','failed')),
  error_code TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TRIGGER saby_sale_deltas_immutable_update BEFORE UPDATE ON saby_sale_deltas
BEGIN SELECT RAISE(ABORT, 'saby sale deltas are immutable'); END;
CREATE TRIGGER saby_sale_deltas_immutable_delete BEFORE DELETE ON saby_sale_deltas
BEGIN SELECT RAISE(ABORT, 'saby sale deltas are immutable'); END;
