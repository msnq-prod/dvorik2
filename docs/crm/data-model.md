# Целевая модель данных

## Основные таблицы

### Доступ

- `accounts` — учётные записи, пароль, роль, активность;
- `audit_logs` — журнал действий.

### Персонал

- `employees` — карточки сотрудников;
- `locations` — магазины/торговые точки;
- `shifts` — смены;
- `shift_assignments` — связь смен и сотрудников.

### Товары и склад

- `product_categories` — категории;
- `products` — карточки товаров;
- `warehouses` — склады, связанные с торговыми точками;
- `stock_movements` — неизменяемый журнал движений;
- `stock_balances` — текущий агрегированный остаток для быстрых списков;
- `inventory_sessions` — документы инвентаризации;
- `inventory_items` — фактические количества по товарам.

### Маркировки

- `label_templates` — размеры и состав полей;
- `label_print_jobs` — задание печати;
- `label_print_items` — снимок товара и количество этикеток в задании.

## Ключевые поля

### `employees`

`id`, `full_name`, `position`, `phone`, `email`, `hire_date`, `status`, `notes`, `created_at`, `updated_at`.

### `shifts`

`id`, `location_id`, `starts_at`, `ends_at`, `status`, `notes`, `created_by`, `created_at`, `updated_at`.

### `products`

`id`, `name`, `sku`, `barcode`, `category_id`, `unit`, `sale_price`, `min_stock`, `status`, `created_at`, `updated_at`.

### `stock_movements`

`id`, `warehouse_id`, `product_id`, `type`, `quantity_delta`, `reason`, `reference_type`, `reference_id`, `created_by`, `created_at`.

`quantity_delta` положительный для прихода и отрицательный для расхода. Записи не редактируются и не удаляются; исправление выполняется обратным движением.

### `stock_balances`

`warehouse_id`, `product_id`, `quantity`, `updated_at`.

Уникальный ключ: `(warehouse_id, product_id)`.

### `label_templates`

`id`, `name`, `width_mm`, `height_mm`, `page_format`, `barcode_type`, `layout_json`, `is_default`, `is_active`.

### `label_print_items`

Помимо ссылок должны храниться снимки `product_name`, `sku`, `barcode`, `price`, `quantity`. Это исключает изменение старого задания после редактирования товара.

## Ограничения целостности

- `ends_at > starts_at`;
- уникальные `products.sku` и непустой `products.barcode`;
- количество этикеток от 1 до 1000 на позицию;
- цена и количество не могут быть `NaN`;
- изменение остатка и запись движения выполняются одной транзакцией;
- удаление сотрудника, товара, склада или шаблона заменяется архивированием;
- назначение одного сотрудника на пересекающиеся активные смены требует явного подтверждения менеджера или блокируется настройкой.
