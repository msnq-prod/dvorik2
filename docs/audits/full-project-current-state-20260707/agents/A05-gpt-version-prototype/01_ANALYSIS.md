# A05 Analysis

## Что проверено

- `gpt-version/README.md`
- `gpt-version/src/shared/types.ts`
- `gpt-version/src/server/index.ts`
- `gpt-version/src/server/domain.ts`

## Текущее состояние

`gpt-version` — отдельный TypeScript WebApp-прототип, сильно ближе к целевому продукту: роли, Telegram WebApp auth, products, stock, inventory, schedule, labels, imports, merge, backups, audit.

Он использует SQLite persistence и собственные shared types, не корневую Drizzle/PostgreSQL schema.

## Evidence

- `gpt-version/README.md:34-48` — список реализованного.
- `gpt-version/README.md:50-52` — production Telegram bot webhooks не входят.
- `gpt-version/src/shared/types.ts:1-139` — целевая domain model.
- `gpt-version/src/server/domain.ts:155-220` — stock operations with idempotency and negative-stock guard.
- `gpt-version/src/server/index.ts:1-23` — Express, Telegram init-data auth, PDF labels.

