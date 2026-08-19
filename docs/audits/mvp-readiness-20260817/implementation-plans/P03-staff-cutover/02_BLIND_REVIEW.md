# P03 — Blind architecture review

## Verdict

Choose **Option A with two constraints**:

1. use a Core transactional identity outbox plus a versioned, ordered and idempotent Staff inbox;
2. perform the initial Staff migration in a bounded write-freeze window and defer `staff:finalize-cutover` beyond MVP.

Option B is acceptable only as a best-effort fast delivery attempt **after** the Core transaction commits; the outbox remains the source of delivery truth. A synchronous call must never determine whether a Core access change commits. Option C is rejected: production requires external Staff (`src/server/config.ts:134-137`), and restoring embedded Staff adds another production mode without solving migration or identity drift.

P03 is not implementation-ready as drafted. The direction is correct, but the event ordering, snapshot boundary, post-cutover rollback and dismissal invariants are underspecified.

## Options compared

| Concern | A — durable bridge | B — synchronous call | C — embedded Staff |
|---|---|---|---|
| Urgent MVP | More work, but one durable boundary | Looks faster; still needs retry and reconciliation | Fast only before considering policy and regression work |
| Authority | Preserves Core access and Staff employment ownership | Preserves ownership but couples availability | Reintroduces mixed ownership |
| Failure behavior | Eventual convergence after Core commit | Partial success across two databases | No cross-service failure, but repeats later cutover |
| Ordering/retry | Correct only with aggregate revision and inbox | Unsafe on timeout/retry without the same machinery | Not applicable until deferred cutover |
| Cutover | Compatible with a checkpoint and replay watermark | Does not solve initial migration | Avoids rather than solves cutover |
| Rollback | Supports replay if the log is retained | No durable recovery record | Expands rollback/configuration surface |
| Recommendation | **Base design** | Optional latency optimization only | Reject |

## Required architecture

### 1. Authority and invariants

- Core is the only authority for account status, role, authentication and session revocation. Staff must not change these fields.
- Staff is the only authority for employment status, `hiredOn`, `dismissedOn`, HR events and shifts.
- Role is not part of the Staff projection unless a concrete Staff authorization use case is added. Status events cover every Core lifecycle transition: approve, reject, block, activate and archive.
- A successful Core block means existing sessions are revoked in the same Core transaction and subsequent requests are denied. Staff convergence is observable eventual consistency, not part of access enforcement.
- A person may be assigned to a new/future shift only when both the Core identity projection and Staff employment profile are active. Current Staff checks only the identity snapshot (`src/staff/staff-service.ts:103-107,154-162`).
- Employment dismissal requires `dismissedOn >= hiredOn`. A dismissed profile cannot receive new future assignments or exchanges. Historical shifts and HR records remain immutable/readable.
- Recommended MVP rule: dismissal is a fail-safe workflow that first blocks Core access, then records dismissal and resolves every future draft/scheduled assignment by explicit cancel or replacement. If Staff fails, access remains blocked and the workflow is visibly incomplete/retryable. Reactivation of access does not silently rehire a dismissed employee.

### 2. Identity event delivery

The event must be created atomically with the Core identity update and session revocation (`src/server/identity-service.ts:278-324`). Do not reuse the current Telegram delivery semantics as the integration contract.

Minimum envelope:

- stable `eventId`;
- `eventType: IdentityStatusChanged` and explicit schema version;
- `userId`, `status`, immutable Core identity revision and `occurredAt`;
- correlation/causation identifiers.

Staff needs a durable inbox keyed by `eventId` and a stored `lastCoreRevision` per user. Duplicate events are no-ops; lower/equal revisions cannot overwrite newer state. The current direct upsert has neither source revision nor stale-event protection and timestamps receipt time (`src/staff/staff-service.ts:15-18`). Delivery needs bounded backoff, dead-letter/`requires_action`, restart recovery, lag metrics and reconciliation against Core. `/ready` must not claim cutover readiness from `SELECT 1` alone (`src/staff/index.ts:22-24`); expose schema version, migration/cutover state and identity lag separately from liveness.

### 3. Migration and cutover

The present script issues separate Core reads without one source snapshot (`src/staff/migrate-from-core.ts:20-33`). Its target-empty check omits identities, days, assignments and exchanges (`:17-18`). Counts plus `PRAGMA foreign_key_check` are insufficient because most cross-domain references have no Staff foreign keys (`src/staff/migrations/001_staff_schema.sql`, `002_staff_schedule.sql`).

Use this sequence:

1. Deploy the identity outbox producer and retain events before taking the migration checkpoint.
2. Prove Core and Staff backups by restoring them into disposable databases; record hashes, schema versions and checkpoint time/revision.
3. Freeze identity and Staff-domain writes, or take one transactionally consistent Core snapshot and record an event replay watermark. For urgent MVP, the write freeze is simpler and safer.
4. Require a completely empty, newly created Staff target across every domain, inbox, outbox and idempotency table.
5. Migrate all supported entities in one Staff transaction from the fixed snapshot.
6. Explicitly dispose of legacy `shift_swap_requests` and `rotation_templates`. Finalize currently archives them but migration does not copy them (`src/staff/finalize-core-cutover.ts:10-13`); unexplained non-zero rows block cutover.
7. Validate exact normalized row digests, not samples or counts only, for identities, profiles, HR events, days, shifts, assignments and exchanges. Add anti-join checks for identity, actor, shift and location references plus domain/date/status invariants.
8. Start Staff, replay identity events after the watermark, reconcile Core status/revision for every projected user, then route Core to external Staff.
9. Run authenticated read/write smoke tests, then release the write freeze.
10. Observe lag, failed inbox/outbox entries, API errors and data parity. Do not run finalization during the MVP release.

Compose `depends_on` is not readiness orchestration and currently starts Staff on a fresh volume without migration (`docker-compose.modular.yml:17,29-37`). The runbook must make migration a one-shot gated operation, never an automatic restart action.

### 4. Rollback and point of no return

“Rollback before finalization” is not sufficient. Once Staff accepts writes, Core employment tables are stale even if they still exist. Switching traffic back loses profiles, HR events and schedule changes.

Before opening writes, rollback may restore the paired checkpoint and old routing. After opening writes, one of these must exist and be tested:

- a reverse export/replay from Staff to Core for every post-checkpoint change; or
- a rollback application artifact that continues to use the same external Staff database.

Backups must be a matched Core+Staff restore set with an explicit RPO/RTO and ownership. Staff backup scheduling is not present in Compose even though a job exists (`package.json:25`, `docker-compose.modular.yml:29-37`).

`staff:finalize-cutover` is a separate irreversible-change approval after the rollback window. Before it can be used, replace count-only checks (`src/staff/finalize-core-cutover.ts:10-13`) with row-digest and invariant checks, verify no reverse rollback remains necessary, preserve a restore-tested archive, and test partial failure/name-collision/re-run behavior. Finalization provides no urgent MVP value and should not be a release step.

## UX rules

- Show account status and employment status as separate labelled facts; never use “active” without its domain.
- The dismissal dialog requires a date and a selected disposition for each future shift. It states that access will be blocked and that reactivation does not rehire.
- A partially completed dismissal is a durable visible state with retry, not a generic success toast.
- Blocking access states immediate session revocation; Staff projection lag is shown only to administrators as synchronization health.
- Disable scheduling and exchanges for dismissed employment even if the cached Core status is still active.
- Preserve optimistic version conflicts in the profile UI and reload the current record on `STALE_PROFILE`.

## Tests and release gates

### Automated

- Identity transaction: status, session revocation and integration outbox commit/rollback together; idempotent request creates one event.
- Delivery: duplicate, out-of-order, timeout-after-apply, retry after restart, dead-letter and reconciliation repair.
- Staff rules: active identity plus dismissed/missing profile cannot be scheduled; dismissal date ordering; future assignment cancel/replacement; reactivation does not rehire.
- Migration: full field/digest parity, all anti-joins, non-empty target variants, failure atomicity, concurrent-write/freeze boundary and non-zero unsupported legacy tables.
- Rollback: before-write rollback and post-write compatible rollback or reverse replay with zero lost/duplicated mutations.
- E2E: Telegram `/start` → pending → approve → WebApp login; role change; block makes an existing cookie return 401 and prevents new login; Staff reaches the same status/revision within the SLO; profile and HR event survive reload; dismissal handles future shifts and access exactly as declared.
- UI coverage for status/role permissions, `status`/`dismissedOn`, stale version, partial workflow, retry and failure messages.

### Go-live gates

- `test:staff-process` passes with captured stdout **and stderr** and actionable exit diagnostics. It currently fails before readiness while hiding stderr (`src/staff/staff-http.test.ts:9-17`); focused migration and finalize tests pass, but only assert narrow count/archive behavior.
- Core and Staff schema versions are exact; restored backups are proven; migration digest and invariant manifest is signed off.
- Identity event backlog is zero at the migration watermark, then stays within a defined lag SLO; no failed/dead-letter events exist.
- Core `/ready`, Staff `/ready`, authenticated Core→Staff read/write smoke and session revocation smoke all pass. Core readiness currently does not probe Staff (`src/server/index.ts:611-632`).
- Unsupported legacy tables are zero or have an approved mapped disposition.
- The post-write rollback mechanism is rehearsed; operator, deadline and point of no return are recorded.
- The dismissal policy and future-shift behavior are approved and covered by E2E.

## Required changes

1. Replace draft Option A with the transactional outbox + revisioned Staff inbox contract above; keep synchronous delivery optional only.
2. Add a consistent-snapshot/write-freeze cutover protocol with an event watermark and exhaustive digest/invariant validation.
3. Define and test a zero-data-loss rollback after Staff begins accepting writes; defer finalization beyond MVP.
4. Resolve `shift_swap_requests` and `rotation_templates` before cutover and strengthen finalize prechecks.
5. Enforce the combined access/employment scheduling rule and implement the fail-safe dismissal workflow.
6. Add dependency-aware readiness, identity lag/dead-letter observability and scheduled restore-tested Staff backups.
7. Expand automated and E2E gates as listed; no production cutover until the Staff process smoke is diagnostic and green.
