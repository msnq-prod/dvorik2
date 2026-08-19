# A01 — Warehouse MVP: needs more research

## Before launch

1. Run the modular stack with a clean `warehouse-data` volume and validate `/ready`, `/api/warehouse/status`, Core-to-Warehouse proxy calls and Warehouse outbox delivery after receiving and write-off.
2. Decide MVP scope for locations. FIFO Warehouse currently owns global lots only; prove whether transfers between physical locations are required on day one. If yes, add a Warehouse location allocation model before launch; it cannot be safely restored through legacy endpoints.
3. Define scanner identity contract: barcode storage, lookup, unknown-item creation and binding must have one Warehouse owner. Verify camera permissions and a real mobile browser scan after migration.
4. Define a FIFO inventory-count procedure (count session, locking policy, reconciliation and adjustment audit trail) or explicitly exclude full inventory from the urgent MVP.
5. Verify all initial imported balances against physical stock. `scripts/verify-warehouse-initial-db.mjs:16-20` explicitly reports two unverified opening lots, so technical reconciliation is not equivalent to physical confirmation.

## Unverified hypotheses

- The dashboard supply-file draft path may permit receipt, but the quick action “Приемка” opens the legacy Stock receipt form (`src/client/src/main.tsx:444-451`; `src/client/src/pages/StockPage.tsx:310-320`) and therefore needs a manual production check.
- StockPage may show stale/empty Core balances after Warehouse cutover even for read-only views; this follows from its Core reads (`src/client/src/pages/StockPage.tsx:90-105`) but should be verified against a running modular instance.
