# MVP implementation plans

This folder turns findings R1–R4 into four independently reviewable implementation plans. Product code is out of scope in this phase.

| ID | Task | Draft | Blind review | Final plan | Status |
|---|---|---|---|---|---|
| P01 | Warehouse + QR scanner contract | `P01-warehouse-scanner/01_DRAFT_OPTIONS.md` | `P01-warehouse-scanner/02_BLIND_REVIEW.md` + QR re-review | `P01-warehouse-scanner/03_FINAL_PLAN.md` | final |
| P02 | Warehouse MVP scope + initial stock | `P02-warehouse-cutover/01_DRAFT_OPTIONS.md` | `P02-warehouse-cutover/02_BLIND_REVIEW.md` | `P02-warehouse-cutover/03_FINAL_PLAN.md` | final |
| P03 | Staff boundary + employee management | `P03-staff-cutover/01_DRAFT_OPTIONS.md` | `P03-staff-cutover/02_BLIND_REVIEW.md` | `P03-staff-cutover/03_FINAL_PLAN.md` | final |
| P04 | Verifiable production deployment | `P04-release-gate/01_DRAFT_OPTIONS.md` | `P04-release-gate/02_BLIND_REVIEW.md` | `P04-release-gate/03_FINAL_PLAN.md` | final |

## Review rule

Each reviewer receives only the task statement, current evidence paths, and alternatives. It must select or combine approaches, challenge assumptions, and record required improvements. The main agent then writes the final plan and a decision log.

## Dependency order

`P01 → P02 → P03 → P04`, while P03 implementation can run in parallel with P01/P02. P04 is the final launch gate, not a substitute for the feature gates.

## Control artifacts

- `01_REVIEW_ORCHESTRATION.md` — independent review evidence.
- `90_APPROVED_PLAN_SET.md` — approved sequence and cross-plan gates.
- `99_PROGRESS.md` — resumable planning status.
