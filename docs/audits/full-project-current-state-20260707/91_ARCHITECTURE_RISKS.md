# Architecture Risks

## R1: Нет единого source-of-truth

Проект одновременно содержит scaffold, target docs, TypeScript-прототип и Python-reference. Это главный риск.

## R2: UI может обманывать

Корневой frontend показывает экраны, но многие запросы отключены и данные mock-only.

## R3: Backend не соответствует целевой предметной области

Root schema/API не имеют товаров, остатков, смен, маркировок.

## R4: Прототип на другом persistence path

`gpt-version` ближе к цели, но работает через SQLite/state, а root stack — PostgreSQL/Drizzle.

## R5: Telegram контуры расходятся

Root has webhook placeholders, `gpt-version` has WebApp auth without production bot webhooks, `recovered-dvorik` has bot-first architecture.

## R6: Workspace hygiene

Много untracked локальных папок и `.DS_Store`. Риск случайно потерять или случайно закоммитить лишнее.

