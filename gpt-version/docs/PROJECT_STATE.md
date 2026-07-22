# Фактическое состояние проекта

Дата сверки: 2026-07-15 (`Asia/Vladivostok`). Продукт: `gpt-version`.
Основание: рабочее дерево продукта не привязано к отдельному release; внешний
workspace reference — `3f661265f0201332a9a31ce7e5d9f8e374e4e8bc` (2025-11-18).
Production release не подтверждён. Источник требований — execution-комплект
`docs/audits/legacy-current-feature-comparison-20260710/`.

## B02 implementation update — 2026-07-20

- Production mutations каталога, настроек уведомлений и заданий этикеток
  переведены из HTTP transport в application services и SQLite repositories.
- Idempotency, business write и audit выполняются одним `UnitOfWork`; добавлены
  fault-injection tests отката и transport-boundary test без mutation SQL.
- Склад, инвентаризация, расписание, identity и sessions продолжают работать
  через ранее внедрённые application services/UoW.
- Production не загружает `AppState`; legacy остаётся только dev/regression
  fallback и не удалён.
- Файловые side effects media/backup остаются внешними к SQLite-транзакции;
  их audit теперь записывается через application service после успешного
  side effect. Полная атомарность DB+filesystem технически невозможна.

Этот раздел заменяет ниже расположенное историческое описание transitional
runtime в части, где оно противоречит текущему коду.

## B03 implementation update — 2026-07-20

- Добавлены product groups, `piece/weight`, обязательная масса пачки для
  весового товара, manufacturers, packagings, article/barcode и immutable
  price history в копейках.
- `inventory_balances` хранит общий учётный остаток, `stock_balances` —
  размещение; триггеры поддерживают согласованность, transfer не меняет итог.
- Добавлены CRUD/API/UI для групп, производителей, карточек, упаковок, цен и
  полок; архивирование не удаляет историю.
- Seller не может выполнять receipt/correction, но может transfer и списание
  брака. Весовой seller-flow фиксирован на одной целой пачке.
- Проверены migrations, DB invariants, idempotency, rollback, role restrictions
  и stock concurrency. Поставки и партии/FIFO не добавлялись; Saby добавлен
  позднее отдельным B06-контуром.

## B05 implementation update — 2026-07-20

- Добавлена единая активная инвентаризация всех весовых товаров с фиксацией
  снимка общего остатка и вводом целых пачек.
- На время пересчёта складские mutations, расход и корректировки блокируются;
  завершить пересчёт может начавший его сотрудник.
- Недостача инвентаризации, ручной расход и брак записываются один раз в
  `consumption_records`; общий остаток корректируется без выдуманного
  размещения по полкам.
- Все mutations permission-aware, idempotent, audited и транзакционны; добавлены
  unit/integration/concurrency tests и DB-инварианты.
- Расход не связан с Saby; поставки, партии и FIFO не проектировались. Позднее
  добавленный B06 применяет только кассовые дельты штучного остатка.

## B07 implementation update — 2026-07-21

- Активным сотрудникам доступен общий нефинансовый календарь; стандартная
  дневная смена — 10:00–21:00, назначение ограничено 1–3 сотрудниками.
- Добавлены нефинансовые профили сотрудников и кадровые события: отпуск,
  больничный, опоздание, невыход и неполная смена.
- Добавлен взаимный обмен двумя сменами: предупреждения о конфликтах не
  блокируют принятие, назначения меняются атомарно, повторный accept безопасен,
  принятый обмен может отменить администратор.
- Кадровые и exchange mutations используют permissions, audit, idempotency,
  UoW и Telegram/webapp outbox; проверены rollback и concurrency.
- Зарплатные настройки, суммы и расчёт отсутствуют до утверждения формулы.

## B09 implementation update — 2026-07-21

- Зафиксирована и проверена иерархия `seller/admin/super_admin`: admin может
  подтверждать и отклонять seller onboarding, роль admin назначает только
  super admin.
- Telegram-вход, блокировка и немедленный отзыв всех сессий работают через
  SQLite identity/session services; seller/admin не имеют финансовых API.
- Складские threshold/zero события по умолчанию доставляются активным admin и
  super admin через webapp и Telegram outbox; явная настройка может отключить
  канал. Добавлено idempotent-напоминание об активной инвентаризации.
- Outbox сохраняет lease/retry/backoff/DLQ; Telegram-сбой не откатывает
  складскую операцию. Business write, audit и outbox остаются в одном UoW.
- Seller-flow склада проверен в браузере на 390 px: поиск, карточка и разрешённые
  transfer/defect actions без горизонтального переполнения и console errors.
- Magic link и daily scheduler не входят в утверждённый независимый B09 scope;
  daily остаётся `FEATURE_DISABLED` до отдельной post-launch инфраструктуры.

## B10 implementation update — 2026-07-21

- `verify:release` объединяет typecheck, unit/integration/concurrency/role tests,
  production build и smoke собранного artifact.
- Поддерживаются `/healthz`, `/live` и DB/schema/outbox-aware `/ready`.
- Собирается отдельный `dist/backup-job.js`: SQLite+media bundle, manifest и
  integrity verification, free-space gate, 31-day retention и JSON outcome.
- Матрица тестов и release/backup runbook актуализированы. Production scheduler,
  monitoring, pilot и cutover намеренно не заявлены.

## B06 Saby preparation update — 2026-07-21

- Реализованы сервисная авторизация Saby, paginated Retail polling,
  webhook-signal, overlap cursor и reconciliation runs.
- Raw signal и canonical sales ledger durable; повторы и поздние изменения
  применяются дельтами, удаление/нефискальное состояние компенсируются.
- Возвраты, неизвестные UUID, ручное mapping/backfill, active-inventory queue и
  запрет кассового изменения весового остатка покрыты сервисом и тестами.
- Добавлены admin UI/API, permission `saby:manage`, аудит, idempotency, outbox
  alerts и отдельный `saby-worker` artifact.
- Реальный тариф, pointId и ответы аккаунта не проверены без выданных Saby
  credentials; production cutover не заявлен.

## Release acceleration update

- Production entrypoint and workers use normalized SQLite repositories; no
  production `AppState` loading or full-state save path remains.
- Deferred features are physically unavailable in production UI, API and worker.
- Checksummed migrations, consistent SQLite+media bundles, restore preflight,
  two rehearsals and a built-artifact production smoke are green.
- The staged release package is ready, but no external production target,
  secrets or live cutover has been claimed by this workspace.

## Граница продукта

`gpt-version` — единственный актуальный продукт. `recovered-dvorik` —
read-only reference бизнес-правил и UX; его код, БД и маршруты не входят в
production-контур.

## Implemented: функциональные контуры

| Область | Статус | Фактический source of truth | Проверка кода |
| --- | --- | --- | --- |
| WebApp: dashboard, товары, склад, инвентаризация, этикетки, импорт, merge, график, отчёты, пользователи, audit | implemented / transitional | process-local `AppState` (`db`) | `src/client/src/main.tsx`, `src/server/index.ts` |
| Stock/inventory/reversal, audit и idempotency | implemented / transitional | `AppState`, сохранённый full-state payload | `src/server/domain.ts`, `src/server/store.ts` |
| Schedule days, календарь, rotation preview/commit, future replacement, swaps, export | implemented / transitional | `AppState`; seller schedule query ограничен собственными shifts, seller swap view не раскрывает foreign `fromShiftId` | `src/server/index.ts`, `src/server/domain.ts` |
| Telegram initData auth, webhook, onboarding, callbacks, preferences | implemented / transitional | `AppState`; webhook вызывает application/domain функции | `src/server/auth.ts`, `src/server/index.ts`, `src/server/telegram.ts` |
| Telegram outbox sender и daily digest | implemented entrypoints / transitional | `AppState.outbox`; одноразовые CLI workers | `package.json`, `src/server/telegram-worker.ts`, `src/server/daily-digest.ts` |
| CSV/XLS/XLSX import, preview/commit/undo, supplier SKU | implemented / transitional | `AppState` | `src/server/index.ts`, `src/server/domain.ts` |
| CSV/PDF reports, discrepancies, Telegram document enqueue | implemented / transitional | `AppState`; movements use one `MovementReportRow` DTO in JSON/CSV/PDF/UI | `src/server/reports.ts`, `src/shared/types.ts`, `src/server/telegram.ts` |
| Archive, duplicate candidates, merge/undo, media, tablet buffer | implemented / transitional | `AppState`; media upload имеет временный endpoint-specific JSON/base64 bridge с decoded limit 5 МиБ и `413`, streaming multipart остаётся target `MED-1101` | `src/server/domain.ts`, `src/server/media.ts`, `src/shared/mediaUpload.ts`, `src/client/src` |
| SQLite v2 schema, state converter, migration tests | implemented as schema/converter | normalized tables are a projection, not runtime reads/writes | `src/server/migrations/002_normalized_schema.sql`, `src/server/state-migration.ts` |

`implemented` здесь означает наличие исполняемого контура, а не production
readiness. Для всех строк выше runtime persistence остаётся transitional.

## Transitional: текущая persistence и process model

- Runtime импортирует глобальный `db: AppState`; `loadState` читает
  `app_state.payload`, а `stateTransaction` клонирует и сохраняет весь state
  (`src/server/store.ts:188-242`, `333-374`).
- При отсутствии SQLite CLI допускается JSON fallback
  (`src/server/store.ts:212-230`); это не production-safe persistence.
- `saveSqliteState` сначала перезаписывает normalized projection, затем отдельным
  вызовом обновляет JSON payload. Это не единая business transaction
  (`src/server/store.ts:227-241`).
- API и оба CLI worker стартуют с собственной in-memory копией. Нет repository/
  UoW, reload/version/CAS; multi-process writer может перезаписать свежие
  изменения. Это главный P0 и прямой production cutover blocker.
- Outbox отправляется из массива state; worker не является supervised service,
  scheduler не является постоянным планировщиком.
- SQLite доступ выполняется через in-process `better-sqlite3` и единый sync
  `DatabaseAdapter`; sqlite CLI subprocess удалён. Это ещё не переводит domain
  reads/writes с `AppState` на repositories.
- Каждый SQLite connection включает FK/WAL/busy timeout 5s/NORMAL; readiness
  проверяет точные schema versions и rollback-only writable probe. API и CLI
  entrypoints закрывают connection/checkpoint при graceful stop.
- Quantity strategy зафиксирована: normalized DB имеет canonical integer minor
  columns scale 1000, `шт` только целые, другие units до 0.001. Shared converter
  используется stock/inventory/import/merge/report paths; REAL columns пока
  compatibility mirrors до repository cutover.
- Demo/dev routes регистрируются только при `DVORIK_DEV_TOOLS=1`, доступны
  только с loopback и отсутствуют из OpenAPI/production UI без флага.
  Session-cookie hardening остаётся в `SEC-002`.
- Production startup теперь валидирует обязательные env до загрузки state/listen:
  SQLite path, timezone, release, session/Telegram/object-storage secrets и
  существующие writable media/backup directories. JSON state и local media
  fallback запрещены именно в production; runtime persistence всё ещё
  transitional до `DB-*`/`TX-*`.
- Image processing использует обязательный `sharp`: startup capability check,
  auto-orientation, resize до 1920×1920 и отказ без сохранения original при
  processor error. Политика: `docs/MEDIA_POLICY.md`.

## Target: обязательное до production

- Normalized SQLite через repositories/UoW — единственный runtime source of
  truth; нет global `AppState` и full-state rewrite в production path.
- API, supervised outbox worker и scheduler используют одну persistent DB без
  in-memory canonical copy.
- Business write, audit, idempotency и outbox фиксируются одной DB-транзакцией;
  outbox имеет lease, retry limit, DLQ и manual retry.
- Production config/auth/cookies/media/backups проходят security и release gates;
  migration/restore/cutover/rollback отрепетированы.

## Проверенная база 2026-07-11

- `npm run check` — pass.
- `npm test` — pass (выполнен вне sandbox из-за IPC ограничения `tsx`);
  media test подтверждает 3000×2000 EXIF fixture → 1280×1920, уменьшение bytes,
  metadata stripping и rejection при processor failure.
- Нет browser E2E, HTTP integration, production auth/session-cookie contract,
  migration rehearsal на production-like копии или release drill.

## Запреты до устранения P0

- production cutover;
- безопасная topology с несколькими writer-процессами;
- заявление, что normalized SQLite уже каноничен;
- удаление legacy/fallback до converter и rollback rehearsal.
