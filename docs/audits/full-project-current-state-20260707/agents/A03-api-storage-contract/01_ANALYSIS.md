# A03 Analysis

## Что проверено

- `shared/schema.ts`
- `server/routes.ts`
- `server/storage.ts`
- поиск routes and webhook placeholders.

## Текущее состояние

Backend реализует CRUD/operations вокруг loyalty-доменов: users, admins, cashiers, discount templates, discounts, campaigns, broadcasts, settings, event logs.

Складских сущностей в корневой schema нет: employees, shifts, products, locations, stock balances, stock operations, label jobs отсутствуют.

Telegram webhook endpoints есть, но это заглушки.

## Evidence

- `shared/schema.ts:53-319` — все таблицы текущей schema.
- `server/storage.ts:27-120` — storage interface для loyalty-доменов.
- `server/routes.ts:30-847` — API routes.
- `server/routes.ts:825-849` — Telegram webhook TODO placeholders.

