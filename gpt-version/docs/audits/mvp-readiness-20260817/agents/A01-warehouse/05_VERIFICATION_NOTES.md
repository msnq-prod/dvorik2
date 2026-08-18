# A01 — Warehouse MVP: verification notes

## Completed during audit

- Passed: `NODE_ENV=test npx tsx src/modules/warehouse/warehouse-service.test.ts`.
- Passed: `npm run check`.
- Code review traced FIFO service, Core proxy, runtime policy, deployment manifest, Stock/Inventory/Scanner UI and focused tests.

## Not completed

- `npm run test:warehouse-process` was blocked by sandbox network-bind restriction (`listen EPERM` on `0.0.0.0`), before test assertions ran.
- No modular Compose or browser/mobile scan test was run. No production secrets, database or physical stock were available.

## Mandatory release verification

1. Start a clean modular stack in external Warehouse mode; Core, Warehouse and Staff health checks all pass.
2. Check Warehouse initial-db reconciliation and physically resolve all unverified opening lots.
3. Authenticated admin flow: create/import catalog item, receive supply draft, rescan barcode, write off and adjust; retry each request with the same idempotency key.
4. Authenticated permitted/non-permitted user flow: scanner lookup and write paths obey `products:read`, `products:scan_manage`, `products:write`, `stock:move`.
5. Inspect Warehouse status after each action: no failed/pending outbox backlog and Core acknowledges events.
6. Browser regression in FIFO mode: all visible actions work; direct attempt to invoke legacy stock operation is blocked and no UI route makes it.
7. Simulate restart of Core and Warehouse after a pending event; ensure idempotent delivery and unchanged lots/balances.

## Residual risk after minimum path

- Global FIFO only: physical transfers between locations remain intentionally unsupported.
- Full physical inventory is deferred; manual correction requires operational controls outside the app.
- Cash integration must remain disabled or monitored until stock cutover reconciliation is physically approved.
