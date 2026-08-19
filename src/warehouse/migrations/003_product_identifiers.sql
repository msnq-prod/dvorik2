CREATE TABLE IF NOT EXISTS warehouse_product_identifiers (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  format TEXT NOT NULL CHECK(format IN ('EAN_8','EAN_13','CODE_128')),
  canonical_value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(format,canonical_value)
);
CREATE UNIQUE INDEX IF NOT EXISTS warehouse_product_identifiers_linear_unique
  ON warehouse_product_identifiers(canonical_value) WHERE format IN ('EAN_8','EAN_13','CODE_128');
