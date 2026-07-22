# A02 Solution Plan

1. Render the existing current `DashboardPage` as the admin home and place quick actions above/beside it.
2. Add an optional dark/dense mode using current tokens/components; preserve current grouped navigation.
3. Build an import adapter layer: supplier, invoice, detected sheet/header, mapping preview, warnings and normalized rows.
4. Keep current idempotent commit/undo; add supplier SKU matching before product creation.
5. Add a duplicate-candidate service using legacy normalization/alias/exception concepts; keep current preview/snapshot/audit/undo.
6. Add a reusable worklist/buffer for touch flows, then expose transfer/write-off/inventory actions against it.
7. Add reports as a real current page/API and add lifecycle automation with audit and recovery.
8. Add managed media upload/storage; do not rely on external photo URLs.

