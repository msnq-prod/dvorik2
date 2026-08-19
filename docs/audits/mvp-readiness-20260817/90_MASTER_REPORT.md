# MVP readiness report

## Verdict

**Do not launch this candidate to production yet.** The architecture and many backend capabilities exist, and TypeScript/build pass, but the required three MVP areas cannot complete their main production flows as a whole.

## Area status

| Area | Status | Main reason | Detail |
|---|---|---|---|
| Warehouse | blocked | Stock UI uses legacy commands disabled by external Warehouse | `agents/A01-warehouse/` |
| Scanner web app | blocked | Scanner has no Warehouse-owned barcode/QR/action contract | `agents/A02-scanner-webapp/` |
| Employee management | conditional | access works; Staff cutover/smoke/runbook remain unproven | `agents/A03-employee-management/` |
| Launch integration | blocked | release smoke is stale/indeterminate; no full topology gate | `agents/A04-launch-integration/` |

## Confirmed launch blockers

1. External Warehouse is required in production, while StockPage/scanner submit legacy Core APIs that return 410 in that mode.
2. Warehouse does not own barcode lookup/binding; a decoded QR has no business contract.
3. Staff production migration/cutover is manual and undocumented; Staff process smoke is failing.
4. Production artifact smoke does not configure external Warehouse and does not complete successfully.
5. Two initial Warehouse opening lots are unverified.

## What is already usable

- FIFO receiving, lots, write-off, adjustment, reconciliation, idempotency and service boundaries.
- Browser camera capture, mobile layout, legacy scan UI and RBAC.
- Roles, Telegram onboarding, session revocation, Staff profiles/HR/shifts and migration tools.

## Recommended minimal MVP

Run a **single global FIFO warehouse**: catalogue, supply receipt, barcode scan, write-off, adjustment and journal. Defer location transfers, full inventory count, arbitrary QR payloads, payroll and cash/Saby rollout.

## Implementation gate

No product code was changed. Start implementation with recommendation R1 only; it unlocks both Warehouse and Scanner MVP paths.
