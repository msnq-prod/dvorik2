# Test matrix доступного scope

Дата: 2026-07-21. Aggregate gate: `npm run verify:release`.

| Контур | Unit / invariants | Integration / API | Concurrency / replay | Roles / negative |
| --- | --- | --- | --- | --- |
| B02 foundation | UoW, repositories, idempotency | transport boundary, rollback | idempotency contention | backend permission contracts |
| B03 catalog/stock | kinds, packages, totals/placements | catalog and stock commands | stock writers | seller/admin operation matrix |
| B05 inventory | session, consumption, reversal | whole-stock close/adjustment | active session and reversal races | seller/admin restrictions |
| B07 schedule | shifts, HR events, exchanges | HTTP shared calendar | accept/revert contention | staff/admin/super_admin matrix |
| B09 identity/outbox | onboarding, sessions, preferences | Telegram/session cross-process | session revoke, outbox lease/retry | financial routes absent; audit forbidden to seller |
| B10 operations | readiness, backup integrity/retention | production artifact smoke | multi-process HTTP and worker leases | backup/audit permissions |
| B06 Saby | normalization, fiscal/return rules | auth, pagination, webhook, mapping/backfill | replay, revisions, deletion compensation | admin-only status/mapping; invalid webhook secret |

Дополнительно: migration/checksum/rollback rehearsals, media limits, security
headers/rate limits, 390 px browser smoke продавца. Реальный Saby account E2E,
поставки, партии/FIFO, зарплата, финансы и production pilot/cutover исключены и
не считаются непройденными тестами текущего scope.
