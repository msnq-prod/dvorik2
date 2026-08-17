CREATE TABLE supplies (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  invoice_number TEXT NOT NULL DEFAULT '',
  delivered_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','accepted','cancelled')),
  accepted_by_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  accepted_at TEXT,
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((status='accepted' AND accepted_by_user_id IS NOT NULL AND accepted_at IS NOT NULL) OR status<>'accepted')
);
CREATE UNIQUE INDEX supplies_supplier_invoice_unique
  ON supplies(supplier_id, invoice_number) WHERE invoice_number<>'';

CREATE TABLE supply_lines (
  id TEXT PRIMARY KEY,
  supply_id TEXT NOT NULL REFERENCES supplies(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  package_count INTEGER NOT NULL CHECK (package_count > 0),
  package_mass_grams INTEGER CHECK (package_mass_grams IS NULL OR package_mass_grams > 0),
  purchase_cost_kopecks INTEGER NOT NULL CHECK (purchase_cost_kopecks >= 0),
  allocated_delivery_cost_kopecks INTEGER NOT NULL DEFAULT 0 CHECK (allocated_delivery_cost_kopecks >= 0),
  created_at TEXT NOT NULL,
  UNIQUE(supply_id, product_id, package_mass_grams)
);

CREATE TABLE inventory_lots (
  id TEXT PRIMARY KEY,
  supply_line_id TEXT NOT NULL UNIQUE REFERENCES supply_lines(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  received_package_milli INTEGER NOT NULL CHECK (received_package_milli > 0),
  remaining_package_milli INTEGER NOT NULL CHECK (remaining_package_milli BETWEEN 0 AND received_package_milli),
  package_mass_grams INTEGER CHECK (package_mass_grams IS NULL OR package_mass_grams > 0),
  total_cost_kopecks INTEGER NOT NULL CHECK (total_cost_kopecks >= 0),
  received_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX inventory_lots_fifo_idx
  ON inventory_lots(product_id, received_at, id) WHERE remaining_package_milli>0;

CREATE TABLE lot_cost_adjustments (
  id TEXT PRIMARY KEY,
  lot_id TEXT NOT NULL REFERENCES inventory_lots(id) ON DELETE RESTRICT,
  amount_kopecks INTEGER NOT NULL,
  reason TEXT NOT NULL,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE fifo_allocations (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  lot_id TEXT NOT NULL REFERENCES inventory_lots(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity_package_milli INTEGER NOT NULL CHECK (quantity_package_milli > 0),
  cost_kopecks INTEGER NOT NULL CHECK (cost_kopecks >= 0),
  direction TEXT NOT NULL CHECK (direction IN ('consume','return')),
  external_reference TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE(event_id, lot_id, direction)
);
CREATE INDEX fifo_allocations_product_created_idx ON fifo_allocations(product_id, created_at, id);

CREATE TABLE integration_inbox (
  event_id TEXT PRIMARY KEY,
  producer TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_version INTEGER NOT NULL CHECK (event_version > 0),
  aggregate_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing','applied','requires_action')),
  result_code TEXT,
  received_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE domain_outbox (
  event_id TEXT PRIMARY KEY,
  producer TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_version INTEGER NOT NULL CHECK (event_version > 0),
  aggregate_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  last_error_code TEXT
);
CREATE INDEX domain_outbox_delivery_idx ON domain_outbox(status, available_at, created_at);

CREATE TABLE product_profitability_projection (
  product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE RESTRICT,
  estimated_sale_price_kopecks INTEGER,
  estimated_cost_per_package_kopecks INTEGER,
  actual_revenue_kopecks INTEGER NOT NULL DEFAULT 0,
  actual_cost_kopecks INTEGER NOT NULL DEFAULT 0,
  actual_completeness TEXT NOT NULL DEFAULT 'unavailable' CHECK (actual_completeness IN ('complete','partial','unavailable')),
  source_updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0)
);

CREATE TRIGGER inventory_lots_mass_immutable
BEFORE UPDATE OF package_mass_grams ON inventory_lots
BEGIN SELECT RAISE(ABORT, 'lot package mass is immutable'); END;

