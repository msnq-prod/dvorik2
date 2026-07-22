# Progress

- [x] Scope locked
- [x] Strategy decomposition written
- [x] B01–B10 detailed plans written
- [x] Main-agent coverage check complete
- [x] Independent subagent review complete
- [x] Review findings resolved or deferred
- [x] Final verification complete

## Active wave

Phase F1 started 2026-07-20.

- [x] plan navigation;
- [x] current-state baseline;
- [x] initial reuse/rework/remove matrix;
- [x] reproducible regression baseline;
- [ ] requirements traceability and remaining F1 artifacts.

Implementation override approved 2026-07-20: выполняются независимые части
B02/B03/B05/B07/B09/B10 без Saby, поставок, партий/FIFO, payroll calculation,
финансов и production cutover.

Scope extension approved 2026-07-21: B06 Saby подготовить по опубликованному
Retail API до шага внешнего подключения, без выдуманного webhook payload.

- [x] B02: production mutation transport переведён на application services,
  repositories и UoW; mutation SQL удалён из HTTP transport; добавлены
  idempotency/audit/rollback tests.
- [x] B03: groups, product kind/package mass, manufacturers, identifiers,
  immutable prices, total-vs-placement stock and safe role-aware operations.
- [x] B05: whole-stock inventory, consumption and total-only corrections;
  active-session lock, no double write-off, permissions/audit/idempotency and
  concurrency coverage.
- [x] B07: shared calendar, employee profiles, shifts, reciprocal two-shift
  exchange and non-financial HR events; no payroll calculation or money fields.
- [x] B09: seller/admin/super_admin hierarchy, Telegram onboarding/session
  revocation, mobile seller UX, durable outbox and available stock/inventory/
  exchange notifications; no financial exposure.
- [x] B10: expanded test matrix, health/readiness, verified backup job and
  release documentation without production pilot/cutover.
- [x] B06 code-ready: service auth, Retail polling/reconciliation,
  webhook-signal, durable ledger, mapping/backfill, roles, audit, idempotency,
  outbox, worker и tests.
- [ ] B06 activation: выдать credentials/`pointId`, публичный URL, вставить URL
  trigger в Saby и провести контрольную продажу/возврат.

## Next

Activate B06 on the real Saby account after credentials and public URL exist.

## Blockers

Real Saby credentials, `pointId`, public URL and control sale/return block only
external activation and account-level verification.
