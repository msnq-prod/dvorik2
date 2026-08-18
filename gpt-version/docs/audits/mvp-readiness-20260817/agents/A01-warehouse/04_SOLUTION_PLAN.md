# A01 — Warehouse MVP: solution plan

## Recommended MVP boundary

Launch Warehouse as a single global FIFO stock, with: catalog, supplier receipt from file, barcode scanning, manual write-off, stock adjustment, and journal. Do **not** promise inter-location transfers or full inventory count until their state models are moved into Warehouse.

This is the smallest durable boundary because Warehouse already owns lots and quantities; routing writes back to Core would recreate two sources of truth.

## Ordered delivery plan

### 1. Make Warehouse the sole contract for warehouse UI

- Add FIFO-mode UI data sources from `/api/warehouse/catalog`, `/balances`, `/lots`, `/journal`, and status.
- In FIFO mode, remove or hide legacy location, transfer, reversal and legacy-receipt controls; do not allow calls to `/api/stock/operations`.
- Wire the existing supply-file draft flow as the only receiving entry. Change the quick “Приёмка” action to open it, or make it explicitly unavailable until a draft is created.
- Keep the legacy UI only for non-production/local migration mode, clearly separated by runtime capability.

**Exit criterion:** every visible warehouse action in FIFO mode maps to a Warehouse endpoint; browser network log contains no legacy stock write call.

### 2. Move barcode ownership and scanner contract into Warehouse

- Extend Warehouse product model/schema with identifiers (at minimum unique normalized barcode) and expose: lookup by barcode, create product with barcode, attach barcode to existing product.
- Have Core proxy these endpoints with existing permission checks, and switch StockPage scanner read/write calls to them in FIFO mode.
- Preserve idempotency and collision response semantics; one barcode must resolve to one active product.

**Exit criterion:** a mobile user can scan an existing Warehouse item, create an unknown one, rescan it, and link a second code without using Core catalog tables.

### 3. Constrain and label stock adjustments

- Retain existing FIFO write-off and adjustment endpoints as MVP operational corrections.
- Require a non-empty reason and idempotency key (already supported), show resulting balance and journal event immediately.
- Limit positive adjustments to whole packages, consistent with service constraint (`src/modules/warehouse/warehouse-service.ts:202-210`). Document this in UI copy.

**Exit criterion:** write-off and both adjustment directions update FIFO lots, accounting balance, outbox and journal once under retry.

### 4. Choose inventory scope explicitly

- **Recommended urgent choice:** omit “full inventory” from MVP navigation and call the available operation “Корректировка остатков.” Record physical-count procedure outside the app (two-person count + per-item correction) until a FIFO count session exists.
- **Alternative:** implement a Warehouse-owned inventory session: snapshot lots/balance, count rows, exclusive command policy, close-to-adjustment transaction, audit event and reconciliation report. This is a post-MVP feature, not a safe shortcut.

**Exit criterion:** product copy, permissions and operating instructions match the selected scope; no button claims a capability that fails or silently acts on legacy data.

### 5. Release and data cutover gate

- Generate a fresh Warehouse initial database from the approved physical balance source; do not reuse a mutable shared dev database.
- Reconcile every product and resolve the two explicitly unverified opening lots before enabling cash-driven consumption.
- Deploy Core and Warehouse together in external mode, with persistent independent volumes and 32+ byte internal secret.
- Monitor Warehouse `/ready`, `/internal/status` through Core `/api/warehouse/status`, and outbox/inbox counts after each operational command.

**Exit criterion:** readiness is true, no reconciliation differences, no `requires_action` inbox entries, and no pending/failed Warehouse outbox event beyond the retry SLO.

## Rejected shortcuts

- Re-enable legacy stock writes in production: creates divergent Core location balances and Warehouse FIFO lots.
- Keep scanner on Core while Warehouse owns products: produces unfindable/duplicate products and cannot be repaired reliably per scan.
- Treat manual adjustments as a full inventory feature: no immutable count snapshot or concurrency policy.
