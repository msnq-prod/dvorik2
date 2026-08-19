# P02 — Final implementation plan

## Decision

Use a strengthened Option A: one global FIFO Warehouse, one writer, evidence-led cutover. Legacy Core stock becomes a read-only audit snapshot at the cutover boundary and is never a production fallback.

## Product boundary

Included: catalogue, supplier-file receipt, QR/barcode lookup, write-off, positive/negative correction and journal. Excluded and absent from navigation/API claims: location transfer, location balances, reversal and full inventory sessions.

## Phase 1 — Freeze contract and ownership

1. Publish an action matrix mapping every production control to a Warehouse endpoint and permission.
2. Make external Warehouse the only read/write owner after the boundary timestamp.
3. Enforce single Warehouse writer/outbox worker for MVP.

**Exit:** no visible or indirect Core legacy stock path remains in external mode.

## Phase 2 — Build auditable opening-state artifact

1. Retain source documents inside an approved evidence store; record SHA-256, parser revision, sheet/row/cell lineage, mappings, conversions, disposition and approvers.
2. Establish cutover-time physical truth by a signed count or a complete delta bridge from the existing dated seed.
3. Resolve each unverified opening lot separately for quantity and acquisition-cost basis. If source cost is unavailable, require a named accounting policy and signed bounded exception; never present a synthetic invoice as source evidence.
4. Generate JSON and SQLite deterministically; record hashes and prove a second build is identical.

**Exit:** complete SKU universe, zero unexplained rows and reproducible artifact digest.

## Phase 3 — Reconciliation and failure tests

1. Verify schema/FK integrity, non-negative balances, lot ownership, package mass, invoice/transport totals and FIFO-versus-accounting equality per product.
2. Test same-key replay, conflicting key reuse, concurrent deduction, receipt-versus-deduction, adjustment-versus-cash event and restart during command/outbox processing.
3. Require zero `requires_action` inbox rows and no failed/aged outbox beyond the agreed SLO.

**Exit:** exact balances, costs, journal and watermarks survive retry/restart.

## Phase 4 — Cutover rehearsal and launch

1. Restore-test paired Core/Warehouse backups; record schemas, artifact hashes and event watermarks.
2. Freeze stock movement; record timestamp; apply final delta; disable legacy writes; start Warehouse; run external-mode browser smoke; then unfreeze.
3. Before the first Warehouse write, rollback may restore the captured pair. After the first write, recovery is coordinated restore/replay or forward repair only—never independent DB replacement.
4. Run day-one checks at opening, mid-day and close; assign launch commander, warehouse operator and accounting approver.

**Exit:** signed go-live checklist and rehearsed recovery at the exact release revision.

## Implementation slices

1. Operation/capability cleanup in UI and route policy.
2. Evidence manifest and deterministic seed verifier.
3. Reconciliation/concurrency/restart tests.
4. Cutover/rollback/first-day runbooks.

P01 must land before browser acceptance because QR/barcode resolution is part of this operation matrix. P04 consumes all P02 gates in the release harness.
