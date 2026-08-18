# P03 — Final implementation plan

## Decision

Use external Staff with a Core transactional identity outbox and a versioned, ordered, idempotent Staff inbox. Migrate under a bounded write freeze. Do not run irreversible `staff:finalize-cutover` during MVP launch.

## Ownership invariants

- Core alone owns account status, role, authentication and session revocation.
- Staff alone owns employment status, dates, HR events and shifts.
- Scheduling requires both active Core identity projection and active Staff employment.
- Dismissal does not equal account reactivation; reactivation never silently rehires.

## Phase 1 — Make Staff executable and observable

1. Fix process-smoke diagnostics to capture child stdout/stderr and termination reason.
2. Make Staff smoke green from built artifact and temporary database.
3. Extend readiness with exact schema, migration/cutover state, inbox lag and failed/dead-letter counts; retain simple liveness separately.

**Exit:** failure is diagnosable and Staff cannot be reported cutover-ready with stale schema/projection.

## Phase 2 — Durable identity propagation

1. In the same Core transaction as identity status change and session revocation, append a versioned event with `eventId`, `userId`, `status`, monotonic identity revision, time and correlation IDs.
2. Staff stores an inbox by `eventId` and `lastCoreRevision`; duplicates are no-ops and old revisions cannot overwrite new state.
3. Add bounded retry, dead-letter/`requires_action`, lag metric and reconciliation against Core.
4. Optional synchronous delivery may reduce latency only after Core commit; it never replaces the outbox.

**Exit:** block is immediate in Core and Staff converges within SLO under duplicates, reordering, timeout and restart.

## Phase 3 — Migration and cutover

1. Deploy/retain the identity outbox before snapshot.
2. Restore-test paired Core/Staff backups and record schemas, hashes and event watermark.
3. Freeze identity and staff-domain writes; require a fully empty Staff target across domain, inbox/outbox and idempotency tables.
4. Migrate the fixed snapshot in one Staff transaction.
5. Explicitly map or prove zero legacy swap requests and rotation templates.
6. Verify normalized row digests and anti-joins for identities, profiles, HR events, days, shifts, assignments and exchanges; verify domain/date/status rules.
7. Start Staff, replay events after watermark, reconcile every identity revision, route Core externally, run smoke, then release freeze.

**Exit:** exact parity, zero unresolved references/events, authenticated Core→Staff read/write works.

## Phase 4 — Employee dismissal workflow

1. UI separates account status and employment status.
2. Dismissal requires date and explicit disposition for every future shift.
3. Recommended fail-safe order: block Core access first, then persist dismissal and cancel/replace future assignments. Partial completion remains visible and retryable.
4. Enforce `dismissedOn >= hiredOn`; dismissed/missing employment cannot receive new future shifts/exchanges.

**Exit:** E2E proves access, employment and schedule effects independently.

## Phase 5 — Rollout and rollback

1. Before Staff accepts writes, rollback may restore the paired checkpoint and old routing.
2. After Staff accepts writes, rollback must keep a compatible artifact using the same Staff DB or replay all Staff changes back to Core. This mechanism is rehearsed before go-live.
3. Observe API errors, identity lag, dead letters and data parity for an agreed window.
4. Finalization is a later separately approved operation after rollback obligations expire.

## Implementation slices

1. Staff smoke/readiness.
2. Identity event contract + Core outbox + Staff inbox/reconciliation.
3. Migration verifier/runbook.
4. Dismissal domain/UI/E2E.
5. Rollback and operational monitoring.
