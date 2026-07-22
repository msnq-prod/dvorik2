# Зафиксированные решения

Изменять решение можно только отдельным ADR с последствиями и migration path.

| Область | Решение |
| --- | --- |
| Актуальный продукт | Только `gpt-version`; legacy — read-only reference |
| Runtime source of truth | Нормализованный SQLite через repositories/UoW |
| SQLite driver | `better-sqlite3` 12.x, sync in-process adapter; native dependencies устанавливаются на target architecture |
| SQLite connection policy | FK ON, WAL, busy timeout 5000ms, synchronous NORMAL; exact schema readiness, no hidden writer retry |
| Процессы | API, supervised outbox worker и scheduler используют одну persistent DB без in-memory canonical copy |
| Транзакция | Business write + audit + idempotency + outbox атомарны |
| Unit of Work | Sync context + repository factory на одном connection; ordinary nested transaction/savepoint/manual commit/async/escaped context запрещены |
| Repository contracts | API shape с one primary role; opaque revision; not-found=`undefined`; JSON envelope versioned; cursor page bounded+ordered; service context без raw DB |
| Command context | Actor только через injected trusted resolver; web session/Telegram update/worker registry channel-bound; correlation=requestId; clock injected; raw DB скрыт |
| Stock transaction | `BEGIN IMMEDIATE`; exact CAS outcome; raw operation key namespaced; total-product threshold/zero before→after; only explicit instant admin/super-admin preferences emit inbox/outbox |
| Inventory/reversal | Inventory validates whole versioned batch before write and stores signed discrepancy; reversal revalidates original/current state and uses unique original link |
| Idempotency | `(scope,key)` + canonical request hash + сохранённый status/response; другой payload → `409` |
| Idempotency failure/recovery | HTTP error response terminal/replayable; thrown transient fault rolls back; processing deadline uses expires_at, legacy NULL uses updated/created + configured timeout |
| Web sessions | Cookie содержит random 32-byte token; DB только HMAC-SHA256 с secret >=32 bytes; login rotation/revoke `BEGIN IMMEDIATE`; legacy unhashed sessions не мигрируются |
| Расписание | Local date в `Asia/Vladivostok`; absolute timestamp в UTC |
| Preview/commit | Preview read-only; commit требует version/hash и повторной проверки правил |
| Swap preview | Swap хранит captured shift revision; mismatch сначала expire stale pending swaps с audit/inbox/outbox; legacy pending без достоверной revision expire при migration |
| Telegram | HTTP и bot вызывают общие application services; callback повторяемый и может быть stale |
| Outbox | Transactional enqueue, lease/claim, retry limit, failed/DLQ и manual retry |
| Media | Production object storage; local storage только явный development mode. `sharp` обязателен, EXIF orientation нормализуется, output ≤1920×1920 без metadata, processor error отклоняет upload. До `MED-1101` upload остаётся временным JSON/base64 bridge |
| Количества | Integer minor units scale 1000; `шт` integer-only, `кг/л/м` ≤3 decimals, max minor 9e12; shared converter обязателен |
| Production config | Fail-fast; dev/demo routes только при явном безопасном флаге |
| Release | Cutover и rollback после двух production-like migration/restore rehearsals и измеренных RPO/RTO |
| Personal-project scope | Заказчик — product/release и technical/on-call owner; до отдельного решения о production release SLO/RPO/RTO/window не применяются и не являются blocker разработки |

## Открытые решения

- `DOC-002`: закрыт для personal-project scope решением заказчика от 2026-07-11. Production release по-прежнему требует отдельного approval с SLO/RPO/RTO/window.
- Другие открытые решения брать только из соответствующего ID плана.
