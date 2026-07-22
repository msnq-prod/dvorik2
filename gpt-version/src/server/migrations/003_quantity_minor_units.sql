CREATE TEMP TABLE quantity_migration_guard(ok INTEGER NOT NULL CHECK (ok = 1));
INSERT INTO quantity_migration_guard(ok)
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM products
  WHERE low_stock_threshold < 0
     OR abs(low_stock_threshold * 1000 - round(low_stock_threshold * 1000)) > max(0.0000001, abs(low_stock_threshold * 1000) * 0.0000000000000004440892098500626)
     OR abs(round(low_stock_threshold * 1000)) > 9000000000000
     OR (unit = 'шт' AND low_stock_threshold <> round(low_stock_threshold))
  UNION ALL
  SELECT 1 FROM stock_balances b JOIN products p ON p.id = b.product_id
  WHERE b.quantity < 0
     OR abs(b.quantity * 1000 - round(b.quantity * 1000)) > max(0.0000001, abs(b.quantity * 1000) * 0.0000000000000004440892098500626)
     OR abs(round(b.quantity * 1000)) > 9000000000000
     OR (p.unit = 'шт' AND b.quantity <> round(b.quantity))
  UNION ALL
  SELECT 1 FROM stock_operations o JOIN products p ON p.id = o.product_id
  WHERE o.quantity <= 0
     OR abs(o.quantity * 1000 - round(o.quantity * 1000)) > max(0.0000001, abs(o.quantity * 1000) * 0.0000000000000004440892098500626)
     OR abs(round(o.quantity * 1000)) > 9000000000000
     OR (p.unit = 'шт' AND o.quantity <> round(o.quantity))
) THEN 0 ELSE 1 END;
DROP TABLE quantity_migration_guard;

ALTER TABLE products ADD COLUMN low_stock_threshold_minor INTEGER NOT NULL DEFAULT 0 CHECK (low_stock_threshold_minor BETWEEN 0 AND 9000000000000);
UPDATE products SET low_stock_threshold_minor = CAST(round(low_stock_threshold * 1000) AS INTEGER);

ALTER TABLE stock_balances ADD COLUMN quantity_minor INTEGER NOT NULL DEFAULT 0 CHECK (quantity_minor BETWEEN 0 AND 9000000000000);
UPDATE stock_balances SET quantity_minor = CAST(round(quantity * 1000) AS INTEGER);

ALTER TABLE stock_operations ADD COLUMN quantity_minor INTEGER NOT NULL DEFAULT 1 CHECK (quantity_minor BETWEEN 1 AND 9000000000000);
UPDATE stock_operations SET quantity_minor = CAST(round(quantity * 1000) AS INTEGER);

CREATE TRIGGER products_quantity_consistency_insert BEFORE INSERT ON products
WHEN NEW.low_stock_threshold_minor <> CAST(round(NEW.low_stock_threshold * 1000) AS INTEGER)
  OR NEW.low_stock_threshold < 0
  OR abs(NEW.low_stock_threshold * 1000 - round(NEW.low_stock_threshold * 1000)) > max(0.0000001, abs(NEW.low_stock_threshold * 1000) * 0.0000000000000004440892098500626)
  OR NEW.low_stock_threshold_minor > 9000000000000
  OR (NEW.unit = 'шт' AND NEW.low_stock_threshold_minor % 1000 <> 0)
BEGIN SELECT RAISE(ABORT, 'quantity minor mismatch'); END;
CREATE TRIGGER products_quantity_consistency_update BEFORE UPDATE OF low_stock_threshold, low_stock_threshold_minor, unit ON products
WHEN NEW.low_stock_threshold_minor <> CAST(round(NEW.low_stock_threshold * 1000) AS INTEGER)
  OR NEW.low_stock_threshold < 0
  OR abs(NEW.low_stock_threshold * 1000 - round(NEW.low_stock_threshold * 1000)) > max(0.0000001, abs(NEW.low_stock_threshold * 1000) * 0.0000000000000004440892098500626)
  OR NEW.low_stock_threshold_minor > 9000000000000
  OR (NEW.unit = 'шт' AND NEW.low_stock_threshold_minor % 1000 <> 0)
  OR (NEW.unit = 'шт' AND EXISTS (SELECT 1 FROM stock_balances WHERE product_id = NEW.id AND quantity_minor % 1000 <> 0))
  OR (NEW.unit = 'шт' AND EXISTS (SELECT 1 FROM stock_operations WHERE product_id = NEW.id AND quantity_minor % 1000 <> 0))
BEGIN SELECT RAISE(ABORT, 'quantity minor mismatch'); END;

CREATE TRIGGER balances_quantity_consistency_insert BEFORE INSERT ON stock_balances
WHEN NEW.quantity_minor <> CAST(round(NEW.quantity * 1000) AS INTEGER)
  OR NEW.quantity < 0
  OR abs(NEW.quantity * 1000 - round(NEW.quantity * 1000)) > max(0.0000001, abs(NEW.quantity * 1000) * 0.0000000000000004440892098500626)
  OR NEW.quantity_minor > 9000000000000
  OR ((SELECT unit FROM products WHERE id = NEW.product_id) = 'шт' AND NEW.quantity_minor % 1000 <> 0)
BEGIN SELECT RAISE(ABORT, 'quantity minor mismatch'); END;
CREATE TRIGGER balances_quantity_consistency_update BEFORE UPDATE OF product_id, quantity, quantity_minor ON stock_balances
WHEN NEW.quantity_minor <> CAST(round(NEW.quantity * 1000) AS INTEGER)
  OR NEW.quantity < 0
  OR abs(NEW.quantity * 1000 - round(NEW.quantity * 1000)) > max(0.0000001, abs(NEW.quantity * 1000) * 0.0000000000000004440892098500626)
  OR NEW.quantity_minor > 9000000000000
  OR ((SELECT unit FROM products WHERE id = NEW.product_id) = 'шт' AND NEW.quantity_minor % 1000 <> 0)
BEGIN SELECT RAISE(ABORT, 'quantity minor mismatch'); END;

CREATE TRIGGER operations_quantity_consistency_insert BEFORE INSERT ON stock_operations
WHEN NEW.quantity_minor <> CAST(round(NEW.quantity * 1000) AS INTEGER)
  OR NEW.quantity <= 0
  OR abs(NEW.quantity * 1000 - round(NEW.quantity * 1000)) > max(0.0000001, abs(NEW.quantity * 1000) * 0.0000000000000004440892098500626)
  OR NEW.quantity_minor > 9000000000000
  OR ((SELECT unit FROM products WHERE id = NEW.product_id) = 'шт' AND NEW.quantity_minor % 1000 <> 0)
BEGIN SELECT RAISE(ABORT, 'quantity minor mismatch'); END;
CREATE TRIGGER operations_quantity_consistency_update BEFORE UPDATE OF product_id, quantity, quantity_minor ON stock_operations
WHEN NEW.quantity_minor <> CAST(round(NEW.quantity * 1000) AS INTEGER)
  OR NEW.quantity <= 0
  OR abs(NEW.quantity * 1000 - round(NEW.quantity * 1000)) > max(0.0000001, abs(NEW.quantity * 1000) * 0.0000000000000004440892098500626)
  OR NEW.quantity_minor > 9000000000000
  OR ((SELECT unit FROM products WHERE id = NEW.product_id) = 'шт' AND NEW.quantity_minor % 1000 <> 0)
BEGIN SELECT RAISE(ABORT, 'quantity minor mismatch'); END;
