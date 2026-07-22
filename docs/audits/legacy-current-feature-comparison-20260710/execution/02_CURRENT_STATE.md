# Краткое текущее состояние

Дата сверки: 2026-07-11. Продукт: `gpt-version`. Полная актуальность должна подтверждаться перед каждым ID.

## Реализованный функциональный фундамент

- WebApp: каталог, склад, расписание, отчёты, импорт, merge/archive, media и tablet buffer.
- Telegram: webhook, календарные callbacks, onboarding, подмены и outbox transport.
- Импорт: CSV/XLS/XLSX, autodetect, warnings/rejected rows, supplier SKU.
- Отчёты: CSV/PDF, inventory discrepancies, отправка документа в Telegram.
- Media upload: временный endpoint-specific JSON/base64 bridge с decoded limit 5 МиБ и `413`; обязательный `sharp` выполняет orientation/resize/compression без production passthrough; streaming multipart остаётся задачей `MED-1101`.
- Production startup: centralized fail-fast validation до state/listen; JSON state и local-media fallback запрещены в production.
- Dev/demo auth: routes физически регистрируются только с `DVORIK_DEV_TOOLS=1`, ограничены loopback и скрыты из OpenAPI/UI без флага.
- SQLite v2, converter и базовые migration tests.

Не переписывать эти контуры без требования конкретного ID. Их production-hardening ещё не означает завершённость.

## Главный незакрытый P0

Runtime всё ещё переходный: application code использует глобальный `AppState`, а normalized tables являются projection. Разные процессы способны работать с разными копиями и перезаписывать изменения. Production source of truth ещё не переведён на repositories и настоящие SQLite transactions.

SQLite transport уже in-process: `better-sqlite3` + sync `DatabaseAdapter`; sqlite CLI subprocess отсутствует. Каждый connection применяет FK/WAL/busy 5s/NORMAL; readiness проверяет exact versions, required runtime tables и writable probe; graceful close делает checkpoint.

Quantity contract: minor integer scale 1000 в normalized DB; `шт` integer-only, `кг/л/м` ≤3 decimals. Shared converter покрывает domain/import/report/state projection; REAL columns transitional mirrors до repositories.

Sync `UnitOfWork` foundation создаёт transaction-scoped repository factory/context на одном
connection. Nested transaction, manual transaction-control SQL/savepoint, async callback, close/script
внутри transaction и reuse escaped context запрещены. Runtime services ещё не переведены на UoW.

Domain-oriented repository contracts покрывают identity, catalog/stock, schedule,
workflows, notifications/outbox, audit/idempotency. Contracts не раскрывают raw DB,
требуют explicit create/update revision intent, bounded ordered pages, versioned JSON,
hash replay/conflict и lease-token guard. SQLite repository implementations ещё не готовы;
row mappers приняты в `DB-106`.

Schema v7 добавляет migration provenance, Telegram update inbox, WebApp notifications,
session token hash, shift time, workflow versions/timestamps и outbox lease/max-attempt/error fields.
Explicit mappers покрывают 30 application tables; corrupt JSON/enum/date/time/quantity/
revision/lease rows дают entity-specific errors; reversal link unique; swaps сохраняют captured shift revision и legacy pending expire.

Production sessions используют отдельный opaque token и сохраняют только HMAC-SHA256; nullable/unhashed legacy
sessions удаляются v7. Cookie/clear attributes централизованы, identity/status читаются из SQLite на каждом auth,
rotation/revoke видны между процессами. Полная user/role/onboarding transaction остаётся TX-207.

Shared command context выполняется только внутри sync UoW и выдаёт services actor из injected trusted
resolver, request/correlation ID, channel, idempotency key, clock и repositories без raw DB. Web session,
verified Telegram update и registered worker actor не взаимозаменяемы; production ingress wiring ещё впереди.

Canonical idempotency repository выполняет insert-first `(scope,key)` claim, canonical JSON SHA-256,
exact terminal HTTP replay, different-payload conflict, processing timeout/recovery и revision-guarded settle
внутри command UoW. Runtime endpoints ещё используют legacy idempotency до перевода их TX services.

Transactional stock service использует `BEGIN IMMEDIATE`, active permission lookup, exact CAS balances,
namespaced idempotency, audit и preference-resolved threshold/zero events. Service/repository slice принят,
но endpoint cutover ждёт DB-108/109 из-за риска overwrite со стороны global `AppState.saveState()`.

Inventory/reversal services приняты: batch целиком валидируется до write, discrepancy хранит signed
expected/actual/delta, reversal проверяет original/current state и unique link. Fault/concurrency gates
зелёные; runtime endpoints также ждут DB-108/109.

Schedule/swap services приняты: day/shift/assignments/conflicts и swap lifecycle выполняются в одном
`BEGIN IMMEDIATE`; stale preview expire, unchanged assignment provenance сохраняется, fault/concurrency
gates зелёные. Runtime routes также ждут DB-108/109.

## Подтверждённые зоны дальнейшей работы

- session cookie security;
- defects `FIX-501..508`;
- repository/UoW/idempotency/application services;
- durable outbox lease/DLQ/admin retry;
- migration, backup/restore и rehearsals;
- продуктовые parity/UX/search/media/import/report детали из плана;
- полный security, E2E, failure-injection, accessibility и release gates.

## Запреты до устранения P0

- production cutover;
- несколько writer-процессов как безопасная topology;
- заявление, что normalized SQLite уже каноничен;
- удаление legacy/fallback до проверенного converter и rollback rehearsal.
