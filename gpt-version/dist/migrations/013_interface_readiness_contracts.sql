INSERT OR IGNORE INTO permissions(id, code, description) VALUES
  ('saby:manage', 'saby:manage', 'Управление интеграцией и сопоставлениями Saby');

INSERT OR IGNORE INTO role_permissions(role_id, permission_id)
SELECT id, 'saby:manage' FROM roles WHERE id IN ('admin', 'super_admin');

INSERT OR IGNORE INTO inventory_balances(product_id, quantity_minor, version, updated_at)
SELECT product_id, SUM(quantity_minor), 0, MAX(updated_at)
FROM stock_balances
GROUP BY product_id;

INSERT OR IGNORE INTO inventory_balances(product_id, quantity_minor, version, updated_at)
SELECT id, 0, 0, updated_at FROM products;
