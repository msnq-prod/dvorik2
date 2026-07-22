# State Machine

## User

Statuses: `pending`, `active`, `blocked`, `rejected`, `archived`.

Actual:
- `actor()` allows only `active`.
- `PATCH /api/users/:id` can set any supplied status without transition validation.
- `POST /api/auth/logout` revokes the current session.
- Role/status changes revoke active sessions for the updated user.

## Product

Statuses: `active`, `archived`, `deleted`.

Actual:
- Seller cannot see non-active products in `/api/products`.
- `PATCH /api/products/:id` can set `active`, `archived`, or `deleted`.
- Setting status back to `active` restores a product.

## Shift

Statuses: `draft`, `scheduled`, `in_progress`, `completed`, `cancelled`.

Actual:
- Manager creates, updates status, and copies shifts from the schedule UI.
- Create/update/copy validate date, time range, active location, active employees, and overlap for assigned employees.
- Regular employee sees only own shifts.
- Read and mutation endpoints auto-advance `scheduled -> in_progress -> completed` by `Asia/Vladivostok` current time.

## StockOperation

Types: `receipt`, `transfer`, `write_off`, `inventory_adjustment`, `correction`, `reversal`, `merge`.

Actual:
- `/api/stock/operations` supports receipt, transfer, write_off, correction.
- `inventory_adjustment` only through inventory apply.
- `reversal` only through reversal endpoint.
- `merge` unsupported.

Allowed transitions:
- Original operation remains unchanged.
- Reversal creates a new operation with `reversedOperationId`.

Gaps:
- Reversal is permissioned by `techlog:read`; a dedicated reversal permission would be clearer.

## Inventory

Inferred statuses:
- snapshot loaded -> user edits actual -> submit -> success/conflict/error.

Actual:
- Conflict is based on balance version mismatch.
- Negative/non-finite actual is rejected before mutation.

## ShiftSwapRequest

Statuses: `pending`, `accepted`, `declined`, `cancelled`, `expired`.

Actual:
- API creates `pending` only for active target users and blocks self-swap.
- API/UI supports `accepted`, `declined`, and `cancelled`.
- Create/accept are blocked unless the shift is still `scheduled`.
- Pending requests automatically become `expired` after the linked shift is no longer `scheduled`.

## Labels

Inferred statuses:
- edit geometry/products -> preview -> print.

Actual:
- Preview returns geometry and labels.
- Print/download uses PDF endpoint, stores a print job snapshot, and streams `application/pdf`.
- Reprint streams PDF from the saved job snapshot.
- Barcode pattern is generated for preview/PDF: valid 13-digit EAN uses EAN-13, other printable identifiers use Code 128.
- Overflow disables print/download.

## SupplyImport

Statuses: `previewed`, `committed`, `reverted`, `failed`.

Actual:
- Preview parses CSV, base64 `.xlsx`, or base64 simple `.xls`, stores hash/rows.
- Commit validates all rows before mutation, then creates products and receipt stock operations.
- Undo removes created products/receipts if no later stock movements exist for those products.
- Duplicate committed hash is rejected.

## ProductMerge

Statuses: `previewed`, `committed`, `reverted`.

Actual:
- Preview stores source/target product, balance and operation snapshot.
- Commit moves identifiers/balances, rewrites source operation product links to target, and marks source deleted.
- Undo restores source/target/balances/operation links from snapshot.
- Undo is blocked if new stock operations for either merged product appeared after commit.
