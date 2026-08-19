CREATE TABLE product_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  inventory_kind TEXT NOT NULL CHECK (inventory_kind IN ('piece','weight')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0)
);

CREATE TABLE manufacturers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0)
);

ALTER TABLE products ADD COLUMN group_id TEXT REFERENCES product_groups(id) ON DELETE RESTRICT;
ALTER TABLE products ADD COLUMN manufacturer_id TEXT REFERENCES manufacturers(id) ON DELETE RESTRICT;
ALTER TABLE products ADD COLUMN inventory_kind TEXT NOT NULL DEFAULT 'piece' CHECK (inventory_kind IN ('piece','weight'));
ALTER TABLE products ADD COLUMN package_mass_grams INTEGER CHECK (package_mass_grams IS NULL OR package_mass_grams > 0);
ALTER TABLE products ADD COLUMN article TEXT NOT NULL DEFAULT '';
CREATE INDEX products_group_status_idx ON products(group_id, status, official_name COLLATE NOCASE);
CREATE INDEX products_manufacturer_idx ON products(manufacturer_id, status);

CREATE TABLE product_packagings (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  units_per_package INTEGER NOT NULL DEFAULT 1 CHECK (units_per_package > 0),
  mass_grams INTEGER CHECK (mass_grams IS NULL OR mass_grams > 0),
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  UNIQUE(product_id, name)
);
CREATE UNIQUE INDEX product_packagings_primary_unique ON product_packagings(product_id) WHERE is_primary = 1;

CREATE TABLE product_price_history (
  id TEXT PRIMARY KEY,
  group_id TEXT REFERENCES product_groups(id) ON DELETE RESTRICT,
  product_id TEXT REFERENCES products(id) ON DELETE RESTRICT,
  price_kopecks INTEGER NOT NULL CHECK (price_kopecks >= 0),
  price_unit TEXT NOT NULL CHECK (price_unit IN ('piece','kilogram')),
  effective_from TEXT NOT NULL,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  CHECK ((group_id IS NULL) <> (product_id IS NULL))
);
CREATE INDEX product_price_history_group_idx ON product_price_history(group_id, effective_from DESC, id DESC);
CREATE INDEX product_price_history_product_idx ON product_price_history(product_id, effective_from DESC, id DESC);
CREATE TRIGGER product_price_history_immutable_update BEFORE UPDATE ON product_price_history
BEGIN SELECT RAISE(ABORT, 'price history is immutable'); END;
CREATE TRIGGER product_price_history_immutable_delete BEFORE DELETE ON product_price_history
BEGIN SELECT RAISE(ABORT, 'price history is immutable'); END;

CREATE TABLE inventory_balances (
  product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE RESTRICT,
  quantity_minor INTEGER NOT NULL DEFAULT 0 CHECK (quantity_minor BETWEEN 0 AND 9000000000000),
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at TEXT NOT NULL
);

INSERT INTO inventory_balances(product_id, quantity_minor, version, updated_at)
SELECT product_id, SUM(quantity_minor), 0, MAX(updated_at)
FROM stock_balances GROUP BY product_id;
INSERT OR IGNORE INTO inventory_balances(product_id, quantity_minor, version, updated_at)
SELECT id, 0, 0, updated_at FROM products;

CREATE TRIGGER stock_placements_total_insert AFTER INSERT ON stock_balances
BEGIN
  INSERT INTO inventory_balances(product_id, quantity_minor, version, updated_at)
  VALUES (NEW.product_id, NEW.quantity_minor, 0, NEW.updated_at)
  ON CONFLICT(product_id) DO UPDATE SET
    quantity_minor = quantity_minor + NEW.quantity_minor,
    version = version + 1,
    updated_at = NEW.updated_at;
END;

CREATE TRIGGER stock_placements_total_update AFTER UPDATE OF quantity_minor ON stock_balances
BEGIN
  UPDATE inventory_balances SET
    quantity_minor = quantity_minor + NEW.quantity_minor - OLD.quantity_minor,
    version = version + 1,
    updated_at = NEW.updated_at
  WHERE product_id = NEW.product_id;
END;

CREATE TRIGGER stock_placements_total_delete AFTER DELETE ON stock_balances
BEGIN
  UPDATE inventory_balances SET
    quantity_minor = quantity_minor - OLD.quantity_minor,
    version = version + 1,
    updated_at = OLD.updated_at
  WHERE product_id = OLD.product_id;
END;

CREATE VIEW stock_placements AS
SELECT product_id, location_id, quantity, quantity_minor, version, updated_at
FROM stock_balances;

CREATE TRIGGER products_weight_mass_insert BEFORE INSERT ON products
WHEN NEW.inventory_kind = 'weight' AND (NEW.package_mass_grams IS NULL OR NEW.package_mass_grams <= 0)
BEGIN SELECT RAISE(ABORT, 'weight product requires package mass'); END;
CREATE TRIGGER products_weight_mass_update BEFORE UPDATE OF inventory_kind, package_mass_grams ON products
WHEN NEW.inventory_kind = 'weight' AND (NEW.package_mass_grams IS NULL OR NEW.package_mass_grams <= 0)
BEGIN SELECT RAISE(ABORT, 'weight product requires package mass'); END;
CREATE TRIGGER products_group_kind_insert BEFORE INSERT ON products
WHEN NEW.group_id IS NOT NULL AND NEW.inventory_kind <> (SELECT inventory_kind FROM product_groups WHERE id = NEW.group_id)
BEGIN SELECT RAISE(ABORT, 'product kind differs from group'); END;
CREATE TRIGGER products_group_kind_update BEFORE UPDATE OF group_id, inventory_kind ON products
WHEN NEW.group_id IS NOT NULL AND NEW.inventory_kind <> (SELECT inventory_kind FROM product_groups WHERE id = NEW.group_id)
BEGIN SELECT RAISE(ABORT, 'product kind differs from group'); END;
