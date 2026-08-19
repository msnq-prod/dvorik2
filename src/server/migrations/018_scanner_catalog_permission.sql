INSERT OR IGNORE INTO permissions(id, code, description)
VALUES ('products:scan_manage', 'products:scan_manage', 'Создание товара и привязка штрихкода из складского сканера');

INSERT OR IGNORE INTO role_permissions(role_id, permission_id)
SELECT id, 'products:scan_manage'
FROM roles
WHERE id IN ('seller', 'admin', 'super_admin');
