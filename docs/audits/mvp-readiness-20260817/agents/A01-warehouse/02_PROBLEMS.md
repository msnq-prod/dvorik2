# A01 — Warehouse MVP: problems

### P1-A01-01: Main Stock screen is incompatible with the mandatory production warehouse mode

- **Promise:** “Склад” supports balances, receiving, movement, write-off and corrections by locations.
- **Reality:** production must use external Warehouse (`src/server/config.ts:134-137`), which disables `POST /api/stock/operations` and reversal with HTTP 410 (`src/server/index.ts:1302-1338`). StockPage loads Core legacy views (`src/client/src/pages/StockPage.tsx:90-105`) and submits all its standard actions to that disabled endpoint (`384-390`, `490-507`, `563-570`, `580-600`).
- **Effect:** receiving from the Stock action, transfers, write-offs, corrections, seller actions and reversals fail in the deployment mode required for production.
- **Cause:** incomplete cutover: FIFO Warehouse is global and lot-based; StockPage still assumes Core location-based legacy stock.
- **Status:** confirmed.

### P1-A01-02: QR/barcode workbench cannot operate on the Warehouse catalog

- **Promise:** scan a code, find/create/bind a product, then perform warehouse action (`src/client/src/pages/StockPage.tsx:631-717`).
- **Reality:** lookup reads only Core catalog (`src/server/index.ts:957-967`). Unknown-code creation and barcode binding return 410 whenever Warehouse owns catalog (`969-1007`, `1100-1119`). Warehouse itself has no barcode lookup or identifier command route (`src/modules/warehouse/routes.ts:41-53`; `src/modules/warehouse/warehouse-service.ts:326-363`).
- **Effect:** in production, scanner cannot reliably find Warehouse products and cannot register unknown products/codes; this blocks the requested web scanner MVP.
- **Cause:** catalog ownership switched to Warehouse without moving the barcode contract and UI read path.
- **Status:** confirmed.

### P1-A01-03: FIFO mode has no usable physical inventory flow

- **Promise:** Inventory page offers “Проверка” / actual-count workflow.
- **Reality:** FIFO mode deliberately disables session start/close (`src/client/src/pages/InventoryPage.tsx:99-124`) and hides the inventory operation (`209-245`). It leaves only write-off and adjustment (`247-276`), while the backend Warehouse API has no count-session endpoint (`src/modules/warehouse/routes.ts:127-169`).
- **Effect:** staff cannot record a complete physical count and reconcile it through the MVP UI; only manual per-product corrections are possible.
- **Cause:** legacy inventory sessions were not replaced with FIFO inventory semantics.
- **Status:** confirmed.

### P2-A01-04: Production readiness depends on a copied seed database and is not verified end-to-end

- **Promise:** Warehouse `/ready` returns a reconciliation gate (`src/warehouse/index.ts:27-38`) and Compose initializes the DB only if no volume exists (`docker-compose.modular.yml:19-27`).
- **Reality:** the focused process test asserts only a seeded Warehouse service starts and reports ready (`src/warehouse/warehouse-http.test.ts:8-35`); it does not exercise Core proxy, Stock UI, an authenticated user, or an outbound event delivery to live Core.
- **Effect:** deployment can be “ready” while the actual user flow is broken (as in P1-A01-01) or while integration delivery is failing.
- **Cause:** isolated module/process checks, no modular end-to-end release test.
- **Status:** confirmed test gap.
