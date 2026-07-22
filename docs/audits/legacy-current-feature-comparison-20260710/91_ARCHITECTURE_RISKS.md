# Architecture Risks

1. **Two sources of truth.** Rebuilding legacy features beside current without canonical application services will create drift between bot and WebApp.
2. **Whole-state persistence.** A single JSON payload is unsuitable for concurrent bot/admin/worker writes and server-side reporting/search.
3. **Direct port risk.** Legacy handlers mix UI, SQL and business rules; copying them would bypass current permissions/audit/idempotency.
4. **Schedule data loss.** Legacy `override=True` generation deletes future assignments; rotation must be previewed/versioned.
5. **Notification reliability.** Legacy swallows delivery errors; current has no sender. A durable outbox/retry path is required.
6. **Calendar correctness.** Legacy 35-cell grid omits days in six-row months; current 42-cell grid must stay canonical.
7. **Import duplication.** Current creates products from each normalized row without supplier matching; legacy matching logic must be adapted before scaling imports.
8. **UI regression.** Copying legacy density/theme wholesale would lose current accessibility and responsive structure.

