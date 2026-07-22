# Нормализованная SQLite-схема v1

## Решение

`gpt-version` остаётся единственным владельцем данных. Текущий `app_state.payload`
сохраняется только как переходный источник для мигратора; новые application services
не должны обращаться к нему напрямую.

## Границы транзакций

- одна складская операция: balance version check, balances, stock operation, audit и
  idempotency record в одной `BEGIN IMMEDIATE` транзакции;
- создание/изменение смены и принятие подмены: shifts, assignments, swap request и
  audit в одной транзакции;
- импорт, merge и генерация графика: preview хранится отдельно, commit выполняется
  одной транзакцией;
- outbox добавляется в ту же транзакцию, что и бизнес-событие.

## Таблицы и владельцы

| Область | Таблицы | Владелец |
|---|---|---|
| Доступ | `users`, `roles`, `permissions`, `role_permissions`, `sessions` | Auth service |
| Каталог | `products`, `product_identifiers`, `suppliers`, `supplier_skus`, `product_aliases` | Catalog service |
| Склад | `locations`, `stock_balances`, `stock_operations` | Stock service |
| График | `schedule_days`, `shifts`, `shift_assignments`, `shift_swap_requests`, `rotation_templates` | Schedule service |
| Фоновые задачи | `imports`, `import_rows`, `merge_jobs`, `label_jobs`, `outbox_messages` | Job services |
| Контроль | `audit_entries`, `idempotency_keys`, `schema_migrations` | Platform |

## Ключевые инварианты

- `stock_balances` уникален по `(product_id, location_id)` и имеет `version` для
  optimistic lock.
- Активная смена имеет как минимум одно назначение; пересечение назначений одного
  сотрудника и активной точки проверяется в Schedule service до commit.
- `shift_swap_requests` меняется только по состояниям
  `pending → accepted|declined|cancelled|expired`; при принятии повторно проверяется
  доступность получателя.
- `idempotency_keys.scope + key` уникальны; сохранённый response возвращается при
  повторе операции.
- `audit_entries` append-only и не содержит полного снимка `AppState`.
- Время хранится в UTC, календарные ключи и daily-задачи вычисляются в
  `Asia/Vladivostok`.

## Совместимый переход

Идентификаторы и JSON-поля current API сохраняются. Repository layer возвращает те
же DTO, а мигратор сначала создаёт backup и dry-run отчёт. До cutover чтение старого
payload допускается только мигратором и read-only fallback.
