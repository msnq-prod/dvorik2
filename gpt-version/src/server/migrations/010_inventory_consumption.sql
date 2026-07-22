CREATE TABLE inventory_sessions (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('active','closing','completed','cancelled')),
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  comment TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL,
  completed_at TEXT,
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX inventory_sessions_one_open ON inventory_sessions((1)) WHERE status IN ('active','closing');

CREATE TABLE inventory_session_rows (
  session_id TEXT NOT NULL REFERENCES inventory_sessions(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  expected_quantity_minor INTEGER NOT NULL CHECK (expected_quantity_minor BETWEEN 0 AND 9000000000000),
  actual_quantity_minor INTEGER CHECK (actual_quantity_minor IS NULL OR actual_quantity_minor BETWEEN 0 AND 9000000000000),
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(session_id, product_id)
);

CREATE TABLE consumption_records (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity_minor INTEGER NOT NULL CHECK (quantity_minor > 0 AND quantity_minor <= 9000000000000),
  source TEXT NOT NULL CHECK (source IN ('inventory','manual','damage')),
  inventory_session_id TEXT REFERENCES inventory_sessions(id) ON DELETE RESTRICT,
  stock_operation_id TEXT NOT NULL UNIQUE REFERENCES stock_operations(id) ON DELETE RESTRICT,
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  comment TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE(inventory_session_id, product_id)
);
CREATE INDEX consumption_records_product_created_idx ON consumption_records(product_id, created_at DESC, id DESC);

CREATE TRIGGER stock_operations_blocked_during_inventory BEFORE INSERT ON stock_operations
WHEN NEW.type <> 'inventory_adjustment'
 AND EXISTS (SELECT 1 FROM inventory_sessions WHERE status IN ('active','closing'))
BEGIN SELECT RAISE(ABORT, 'inventory session blocks stock mutations'); END;
