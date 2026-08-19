# P01 — Draft alternatives

## Option A — Warehouse-native identifier aggregate (initial recommendation)

Add Warehouse identifier persistence with normalized unique value + format, commands for bind/create-with-code, a versioned Dvorik product QR token, and one resolve API. Core remains an authenticated proxy. Switch FIFO UI to Warehouse catalog/balance/action capabilities; hide transfer/full inventory. Backfill identifiers from Core with collision report.

**Pros:** one source of truth; durable cutover; scan and stock lifecycle are atomic at the correct boundary.

**Cons:** schema/API/UI migration plus one-time data backfill.

## Option B — Core identifier registry pointing to Warehouse product IDs

Keep barcode records in Core, resolve there, then call Warehouse for actions.

**Pros:** smaller schema change; reuses current lookup.

**Cons:** product identity split across services, cross-service creation/bind transaction, stale/orphan mapping risk.

## Option C — Read-only scan MVP

Allow only lookup of preloaded identifiers; unknown code and mutations require admin/manual process.

**Pros:** fastest pilot.

**Cons:** does not meet requested operational scanner workflow; still requires a canonical identifier source and migrations.

## Draft delivery sequence

1. Lock identifier normalization, uniqueness, supported formats, the versioned product-QR payload and error codes.
2. Add Warehouse schema/repository/service methods and migration/backfill verifier.
3. Add Warehouse routes and signed Core client/proxy with current permissions.
4. Add runtime capabilities describing available scan actions.
5. Rewire StockPage/InventoryPage scanner to Warehouse resolve and supported FIFO commands.
6. Remove/hide every legacy action in external mode; reject every QR payload outside the Dvorik product-QR contract.
7. Add service, proxy, UI and external-topology E2E tests.
8. Pilot on real iOS/Android Telegram and browser over HTTPS.

## Draft gates

- One code resolves to one active Warehouse product; collisions stop backfill.
- Known/unknown/bind/rescan flows work and retries are idempotent.
- No scanner-originated request hits legacy product or stock writes.
- A generated Dvorik product QR resolves to exactly one product; arbitrary QR cannot be stored as a barcode or product QR.
