# Data Lineage

| Field/data | Origin | Transform/persist | Readers/effect | Gaps |
|---|---|---|---|---|
| `userId` auth | UI selector posts to `/api/auth/demo`; Telegram WebApp posts init data to `/api/auth/telegram` | server creates HttpOnly `dvorik_session`; `actor()` resolves session | All API permission checks | No Telegram bot webhook auth/magic-token flow. |
| permissions | `rolePermissions` copied into seed users | `hasPermission` checks user permissions OR role permissions; role patch refreshes stored permissions and revokes active sessions for that user | `requirePermission` | No Telegram push on revocation. |
| product ID | Seed or `POST /api/products` nanoid | Stored in SQLite-backed app state | Products, balances, operations, labels | OK. |
| identifiers | Seed products or product create payload | Search joins identifier values | Product search and label SKU | Product edit does not yet edit identifiers. |
| location ID | Seed locations | Stock balance key after active-location validation | Stock, inventory | `GET /api/balances` exposes all balances to any active user. |
| stock quantity/version | Seed balances and domain mutations | `roundQty`; version increment | Stock table, inventory snapshot/conflict | Operation log does not include normalized before/after diff. |
| stock operation | Domain mutation | In-memory immutable array | Journal, audit | Operation log does not store old/new values, source of reversal is incomplete for receipt/write-off edge cases. |
| idempotency key | Header/body | command-scoped `db.idempotency[prefix:key]` persisted in SQLite app state | Duplicate request returns cached result | Cache is not a separate relational unique constraint. |
| inventory snapshot | Current balances | rows with expected/version | UI editable rows | Empty-state is basic. |
| label geometry/items | UI product quantities, template and mm inputs | API validates geometry, expands quantities, selects barcode identifier when present, encodes valid EAN-13 or Code 128, snapshots label title/SKU/unit/date/barcode into `labelJobs` | A4 preview, PDF, reprint journal | One-page print limit remains intentional. |
| shift swap | Schedule UI/API | pending swap is visible to requester/target/manager; accept mutates shift employees; decline/cancel close request; refresh expires pending requests when the shift is no longer scheduled | Schedule mutation, notification, audit | No Telegram push for expired swap. |
| audit | `audit()` calls | in-memory list | Audit page | Not all changes include normalized before/after diff. |
| persisted state | `db` object after seed/load | `saveState()` upserts compact JSON payload into SQLite `app_state`; legacy JSON can seed an empty DB | server restart restores products, balances, operations, sessions | Not yet a normalized table-per-entity schema. |
| backup file | `POST /api/backups` | `createBackup()` copies current state JSON | backup list and restore material | Restore endpoint exists; no dry-run UI. |
| backup restore | backup filename | `restoreBackup()` normalizes backup state and replaces `db` arrays | restored products/balances/operations/sessions | Permission gated by `techlog:read`. |
| shift fields | schedule form/API | date/time/location/users/status validated; overlap checked before save/copy/update; read/mutation endpoints refresh scheduled/in-progress/completed statuses by Vladivostok time | schedule view, swaps, audit | No recurring schedule template yet. |
| CSV/XLS/XLSX import rows | textarea/API body | CSV parsed directly; `.xlsx` parsed from base64 ZIP/XML; `.xls` parsed from simple OLE/BIFF8 workbook stream; preview stored in `db.imports` | commit validates all rows before mutation, creates products/receipts, undo removes them if no later movements | Complex formula/rich-text XLS workbooks are outside parser scope. |
| merge snapshot | source/target product IDs | `previewProductMerge()` stores product/balance/operation snapshot; commit refreshes operation snapshot before mutation | commit/undo use snapshot; undo blocks later linked operations | Future linked entities still need explicit merge policy. |
