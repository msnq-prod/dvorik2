-- Warehouse runtime tables. Kept in an explicit migration so existing volumes
-- are upgraded deterministically and service construction stays read-only.
CREATE TABLE IF NOT EXISTS warehouse_idempotency_keys(
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  request_json TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(scope,key)
);

CREATE TABLE IF NOT EXISTS product_groups(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  inventory_kind TEXT NOT NULL CHECK(inventory_kind IN ('piece','weight')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS supply_receipt_drafts(
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL,
  delivery_cost_kopecks INTEGER NOT NULL CHECK(delivery_cost_kopecks>=0),
  file_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','accepted')),
  actor_id TEXT NOT NULL,
  accepted_supply_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS supply_receipt_draft_lines(
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES supply_receipt_drafts(id) ON DELETE CASCADE,
  source_name TEXT NOT NULL,
  source_article TEXT,
  product_id TEXT,
  package_count INTEGER,
  package_mass_grams INTEGER,
  purchase_cost_kopecks INTEGER,
  position INTEGER NOT NULL,
  UNIQUE(draft_id,position)
);
CREATE INDEX IF NOT EXISTS supply_receipt_draft_lines_draft_idx ON supply_receipt_draft_lines(draft_id,position);
