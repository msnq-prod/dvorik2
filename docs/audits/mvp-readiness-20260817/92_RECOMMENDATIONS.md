# Ordered recommendations

Detailed independently reviewed implementation plans: `implementation-plans/90_APPROVED_PLAN_SET.md`.

## R1 — Unify Warehouse + Scanner contract (P1)

Make Warehouse the sole owner of catalogue identifiers, barcode resolve/bind/create and every displayed stock action. Switch FIFO UI to its API; remove unsupported legacy actions. Define barcode-only MVP; reject QR until a versioned signed QR contract is approved.

**Gate:** known/unknown scan, rescan, write-off/adjustment and permissions pass in external-Warehouse topology with no 410 response.

## R2 — Constrain warehouse MVP and validate initial stock (P1)

Launch global FIFO only. Explicitly defer transfers and full inventory; resolve or formally waive two opening lots after physical reconciliation.

**Gate:** clean seed, zero unexplained reconciliation differences, receipt/write-off/adjustment retry tests and outbox recovery.

## R3 — Complete Staff launch boundary (P1)

Create migration/cutover/rollback runbook, repair Staff smoke observability and pass it, rehearse on a production copy. Add durable identity outbox; until then use a documented temporary block-sync control.

**Gate:** Telegram onboarding → approve → login → block, Staff migration comparison, profile/HR reload and session rejection all succeed.

## R4 — Make deployment verifiable (P1)

Repair production smoke configuration, add health-gated service composition, and rehearse backup/restore for Core, Warehouse and Staff.

**Gate:** full external topology is green before public exposure.
