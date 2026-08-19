CREATE TABLE cash_webhook_signals (
  id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','processed','failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  received_at TEXT NOT NULL,
  processed_at TEXT,
  last_error_code TEXT
);

CREATE TABLE cash_sync_state (
  scope TEXT PRIMARY KEY,
  cursor_updated_at TEXT,
  last_success_at TEXT,
  last_error_code TEXT,
  updated_at TEXT NOT NULL
);
INSERT INTO cash_sync_state(scope,updated_at) VALUES ('retail_sales',datetime('now'));

CREATE TABLE cash_external_items (
  nomenclature_uuid TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  barcode TEXT NOT NULL DEFAULT '',
  article TEXT NOT NULL DEFAULT '',
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE cash_product_mappings (
  nomenclature_uuid TEXT PRIMARY KEY REFERENCES cash_external_items(nomenclature_uuid) ON DELETE RESTRICT,
  product_id TEXT NOT NULL,
  package_mass_grams INTEGER CHECK (package_mass_grams IS NULL OR package_mass_grams > 0),
  inventory_kind TEXT NOT NULL CHECK (inventory_kind IN ('piece','weight')),
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX cash_product_mappings_product_idx ON cash_product_mappings(product_id);

CREATE TABLE cash_sales (
  external_key TEXT PRIMARY KEY,
  point_id INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('completed','deleted','nonfiscal')),
  is_return INTEGER NOT NULL CHECK (is_return IN (0,1)),
  business_time TEXT NOT NULL,
  external_updated_at TEXT NOT NULL,
  total_kopecks INTEGER NOT NULL,
  revision_sha256 TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  received_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE cash_sale_lines (
  external_sale_key TEXT NOT NULL REFERENCES cash_sales(external_key) ON DELETE CASCADE,
  external_line_key TEXT NOT NULL,
  nomenclature_uuid TEXT NOT NULL REFERENCES cash_external_items(nomenclature_uuid) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  quantity_milli INTEGER NOT NULL CHECK (quantity_milli > 0),
  total_kopecks INTEGER NOT NULL,
  discount_kopecks INTEGER NOT NULL DEFAULT 0,
  refused INTEGER NOT NULL CHECK (refused IN (0,1)),
  mapped_product_id TEXT,
  emitted_package_milli INTEGER NOT NULL DEFAULT 0,
  emitted_revenue_kopecks INTEGER NOT NULL DEFAULT 0,
  delivery_status TEXT NOT NULL CHECK (delivery_status IN ('not_applicable','unmapped','pending','delivered','requires_action')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(external_sale_key,external_line_key)
);

CREATE TABLE cash_reconciliation_runs (
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

CREATE TABLE cash_event_outbox (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','failed','requires_action')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  last_error_code TEXT,
  result_json TEXT
);
CREATE INDEX cash_event_outbox_delivery_idx ON cash_event_outbox(status,available_at,created_at);

CREATE TABLE cash_idempotency_keys (
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(scope,key)
);
