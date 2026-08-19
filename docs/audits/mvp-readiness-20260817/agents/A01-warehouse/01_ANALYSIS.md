# A01 — Warehouse MVP: analysis

## Scope inspected

- FIFO warehouse module, HTTP runtime and Core proxy: `src/modules/warehouse/`, `src/warehouse/`, `src/server/warehouse-client.ts`, `src/server/index.ts`.
- Warehouse and inventory web UI: `src/client/src/pages/StockPage.tsx`, `InventoryPage.tsx`, `DashboardPage.tsx`.
- Modular deployment and focused tests.

## Current state

- The backend warehouse domain is substantial: suppliers, catalog, receiving by FIFO lots, write-off, adjustment, reconciliation, idempotency, inbox/outbox and signed internal transport are implemented (`src/modules/warehouse/warehouse-service.ts:117-210`, `213-303`; `src/warehouse/index.ts:39-88`).
- Production requires an external Warehouse service (`src/server/config.ts:134-137`); modular Compose launches Core, Warehouse and Staff separately (`docker-compose.modular.yml:1-53`).
- Core exposes the Warehouse HTTP contract and enforces role permissions (`src/modules/warehouse/routes.ts:30-169`).
- Receiving through a parsed supply-file draft is implemented. Dashboard can create a draft and open the accepting flow in Stock (`src/client/src/pages/DashboardPage.tsx:175-195`; `src/client/src/pages/StockPage.tsx:161-241`).
- FIFO-aware write-off/adjustment UI exists in Inventory (`src/client/src/pages/InventoryPage.tsx:62-88`, `127-159`), but full physical inventory is explicitly unavailable in FIFO mode (`99-124`, `209-245`).

## Source of truth and runtime boundary

- Warehouse is the write owner when `warehousePort` is configured. The old stock-operation endpoint intentionally returns 410 in that state (`src/server/index.ts:1302-1338`).
- Warehouse contains global FIFO lots/balances; the legacy web Stock page requests Core product, location, balance and operation read models (`src/client/src/pages/StockPage.tsx:90-105`) and sends every standard operation to the disabled legacy endpoint (`384-390`).
- Warehouse catalog API has only product fields needed for receiving; no barcode lookup/create/bind API is present (`src/modules/warehouse/routes.ts:41-53`; `src/modules/warehouse/warehouse-service.ts:326-363`).

## Verification

- Passed: `NODE_ENV=test npx tsx src/modules/warehouse/warehouse-service.test.ts`.
- Passed: `npm run check`.
- `npm run test:warehouse-process` could not run in the sandbox because binding `0.0.0.0:<random-port>` was denied (`EPERM`); this is an environment constraint, not a test assertion failure.

## MVP assessment

Backend FIFO receiving/write-off/adjustment is near launchable, assuming the initial database passes reconciliation. The user-facing warehouse MVP is not launchable: its primary Stock and scanning flows target disabled legacy contracts, and FIFO lacks inventory-count support.
