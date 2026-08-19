# Approved MVP plan set

## Status

All four plans are independently reviewed, revised and approved for implementation sequencing. This approves plans only; product-code implementation still requires an explicit execution request.

| Plan | Outcome | Final plan | Acceptance gates |
|---|---|---|---|
| P01 | Warehouse-owned QR/barcode scan and operational web app | `P01-warehouse-scanner/03_FINAL_PLAN.md` | `P01-warehouse-scanner/05_ACCEPTANCE_GATES.md` |
| P02 | Current, auditable global-FIFO opening state and cutover | `P02-warehouse-cutover/03_FINAL_PLAN.md` | `P02-warehouse-cutover/05_ACCEPTANCE_GATES.md` |
| P03 | Safe external Staff boundary and employee management | `P03-staff-cutover/03_FINAL_PLAN.md` | `P03-staff-cutover/05_ACCEPTANCE_GATES.md` |
| P04 | Deterministic artifact + Compose production release gate | `P04-release-gate/03_FINAL_PLAN.md` | `P04-release-gate/05_ACCEPTANCE_GATES.md` |

## Recommended implementation waves

### Wave 1 — Runtime foundations

- P04 packaging/config/migration manifest and Warehouse bootstrap fix.
- P01 Warehouse migration runner and frozen scan/API contract.
- P03 diagnostic Staff smoke and frozen identity-event contract.

### Wave 2 — MVP functions

- Finish P01 Warehouse identifiers, Dvorik QR labels, Core proxy and page-wide WebApp cutover.
- In parallel, finish P03 identity outbox/inbox and dismissal workflow.

### Wave 3 — Data rehearsals

- P02 opening-state evidence, reconciliation, cutover/recovery rehearsal.
- P03 Staff migration, parity and rollback rehearsal.

### Wave 4 — Release proof

- Finish P04 real-artifact harness, exact-digest Compose rehearsal, coordinated restore and manual device/environment gates.

## Hard dependency rules

- P02 browser acceptance waits for P01 QR/barcode and Warehouse-only UI.
- P03 may run in parallel with P01/P02 but must be green before P04 release approval.
- P04 consumes P01–P03 gates and cannot waive them.
- Legacy Core Warehouse writes are never a rollback strategy.
- Staff finalization and destructive schema cleanup are post-MVP, separately approved operations.

## Completion definition

MVP launch is approved only when every checkbox in all four `05_ACCEPTANCE_GATES.md` files has current evidence bound to the same release digest and environment.
