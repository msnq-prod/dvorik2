# P02 — Blind architecture review

## Decision

Select **Option A, strengthened into an evidence-led, single-writer cutover**. Preserve the final Core stock database only as a read-only audit snapshot; do not retain any Option C read or write path in production. Do not take Option B into the urgent MVP.

Option A is the only choice that establishes one operational stock truth without inventing a location-allocation model under launch pressure. Option B adds allocation ownership, transfer atomicity and allocation/FIFO reconciliation that are neither specified nor tested. Option C violates the external-Warehouse production policy and leaves cash consumption, UI stock and FIFO cost accounting with different owners.

## Option comparison

| Criterion | Option A | Option B | Option C |
|---|---|---|---|
| Urgent MVP | Best fit if scope is visibly reduced | Too large and migration-heavy | Appears quick but is not launchable under current policy |
| Data lineage | Can be made deterministic and auditable | Requires lineage for both balances and allocations | Preserves legacy data but creates competing lineage |
| Physical truth | One global counted balance | Requires a reliable location-level count not in evidence | Legacy balances are not established as current physical truth |
| Rollback | Clear before first write; coordinated recovery needed afterward | Multi-model rollback is materially harder | Rollback means continuing the invalid architecture |
| Concurrency | Single aggregate model can be serialized and tested | Needs cross-location and transfer concurrency rules | Cross-service divergence is unavoidable |
| First-day operations | Small, teachable operation matrix | Excess operational surface for launch day | Visible actions fail or update the wrong owner |
| Verification | End-to-end gates are feasible | Large new test matrix | Cannot prove a single authoritative balance |

## Findings on the draft

1. **The seed is not current enough to be physical truth.** The present artifact is explicitly as-of 2026-07-27, while this review is dated 2026-08-17. The plan must either perform a new signed count at the cutover timestamp or import and reconcile every receipt, sale, return, write-off and correction between those timestamps. A clean internal FIFO reconciliation of an old seed is not launch evidence.

2. **A physical count cannot resolve missing cost provenance.** The two `OPENING-UNVERIFIED` lots represent three packages whose quantity came from the operator count and whose cost was copied from the latest documented lot. Recounting can validate quantity, but not supplier provenance or acquisition cost. Each lot needs source documentation; otherwise it needs an explicit accounting-approved opening-valuation policy and signed exception. A generic waiver is not equivalent to verified lineage.

3. **Current lineage is insufficient.** Seed metadata records invoice identifiers, assumptions and timestamps, but not source-file hashes, retained source files, parser/build revision, source sheet/cell coordinates, row-level transforms/dispositions, ambiguous-name decisions, physical-count evidence or approver identities. Source paths under `/private/tmp` are not durable evidence. The produced JSON and SQLite artifacts also need cryptographic hashes and a reproducible-build check.

4. **Physical-count rules are underspecified.** “Positions outside the list are zero” is a material assumption, not proof. The cutover procedure must define the complete SKU universe, count unit, package mass, treatment of opened packages, damaged/quarantined goods, double-count/sign-off rules and handling of goods moving during the count.

5. **The cutover has no explicit quiescence boundary.** Define a timestamp and freeze window. Commands and cash events before the boundary must be included exactly once in the opening state; commands after it must be routed only to Warehouse. There must be no interval in which Core writes remain enabled while Warehouse begins consuming.

6. **Readiness currently proves only internal quantity equality.** `/ready` can be true while lineage exceptions, stale counts, pending outbox delivery, `requires_action` inbox rows, an unavailable Core proxy or broken UI remain. Deployment readiness and business cutover readiness must be separate, with the latter aggregating all launch gates.

7. **Concurrency behavior needs a release gate.** The immediate SQLite transactions are a reasonable single-process basis, but the plan does not declare a single-writer deployment invariant or test concurrent deductions, receive-versus-deduct, adjustment-versus-cash, duplicate idempotency keys, conflicting reuse of a key, and concurrent outbox dispatch. Multiple Warehouse replicas/workers must be prohibited until outbox claiming/leases and multi-writer behavior are designed.

8. **Rollback is incomplete.** Before the first Warehouse-owned write, rollback may restore configuration and the captured Core snapshot. After any sale, receipt or correction is accepted, independently replacing the Warehouse file would lose or replay stock effects against already-advanced Core/Cash state. Post-write recovery must use a coordinated restore point plus event-watermark reconciliation, or forward repair from immutable commands/events. The plan must state the point of no simple rollback.

9. **First-day operations need executable ownership.** Name the launch commander, warehouse operator and accounting approver; define who can receive, write off and adjust; require reason and idempotency key for every mutation; publish retry/no-double-submit guidance; and define escalation for negative-stock rejection, missing cost basis, `requires_action`, and aged outbox events. Full inventory and transfer must be absent from navigation, permissions, help text and training—not merely disabled at the API.

## Required invariants and gates

### Before build

- Freeze the MVP operation matrix: catalog, supplier-file receipt, barcode workflow, write-off, positive/negative correction and journal only; every visible action maps to a Warehouse endpoint.
- Declare Warehouse the sole stock/catalogue owner at the cutover boundary. Legacy Core stock becomes read-only audit evidence and is excluded from all production reads and writes.
- Produce a signed source manifest containing source hashes, parser/build revision, row provenance and disposition, mappings, conversions, count evidence, approvers and timestamps.
- Replace the 2026-07-27 balance with a cutover-time count or a complete, reconciled delta bridge.
- Resolve both unverified lots: quantity evidence and cost-basis evidence are separate approvals. No synthetic supplier invoice may be presented as documentary truth.

### Artifact gate

- Build JSON and SQLite deterministically from retained evidence; record both hashes and prove a second build is identical.
- Verify the complete SKU universe, invoice totals, transport allocation, package masses, opening quantities and opening valuation against the approved manifest.
- Require zero foreign-key errors, negative balances, orphan lots/allocations and FIFO/accounting quantity differences for every product.
- Require zero unresolved lineage exceptions, unless a named accounting approver signs a bounded exception that is surfaced in readiness and the journal.

### Cutover and concurrency gate

- Capture tested backups of Core and Warehouse, event watermarks and artifact hashes; rehearse restore into a clean environment.
- Freeze stock movement, record the boundary timestamp, apply the final delta, disable legacy writes, start Warehouse, then unfreeze only after all gates pass.
- Prove same-key retries return one result, conflicting key reuse fails, simultaneous deductions cannot oversell, mixed receipt/deduction/correction commands preserve FIFO and accounting equality, and restart during command/outbox processing causes neither loss nor duplicate business effect.
- Run exactly one Warehouse writer/outbox worker for MVP, or implement and verify a claim/lease protocol before horizontal scaling.

### End-to-end release gate

- In the actual external-mode composition, exercise an authenticated browser flow through Core for catalogue lookup/barcode, receipt, write-off, both correction directions and journal.
- Verify no visible flow calls a legacy stock write endpoint and no transfer/full-inventory claim remains.
- After each command and after service restart, assert exact balances/lots/journal, FIFO order, outbox delivery and idempotent Core consumption.
- Gate launch on healthy Core/Staff/Warehouse dependencies, zero reconciliation differences, zero `requires_action` inbox rows and no pending/failed outbox event older than the agreed retry SLO.

### First-day and rollback gate

- Prepare a one-page runbook with roles, permitted operations, retry behavior, incident thresholds, support contacts and a scheduled opening/closing spot-check.
- Monitor readiness, error rate, negative-stock and missing-cost rejections, inbox exceptions, oldest outbox age and balance reconciliation throughout day one.
- Define rollback phases: pre-write rollback to the captured snapshot; post-write coordinated restore/replay or forward repair only. Rehearse the chosen path and compare final balances, lot costs and event watermarks exactly.

## Required changes

1. Adopt strengthened Option A; reject B and operational C.
2. Add a current-count/delta-bridge cutover boundary.
3. Separate quantity verification from cost-basis approval for the two unverified lots.
4. Add durable row-level lineage, retained evidence and reproducible artifact hashes.
5. Add explicit single-writer and concurrency/retry/restart tests.
6. Add coordinated post-write recovery with event watermarks and a declared point of no simple rollback.
7. Add external-mode browser/integration verification and first-day operational ownership before launch approval.
