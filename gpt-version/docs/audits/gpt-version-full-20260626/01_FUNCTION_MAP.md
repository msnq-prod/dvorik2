# Function Map

## Frontend entrypoints

| Area | Control/action | Chain | Evidence |
|---|---|---|---|
| App shell | User selector | `POST /api/auth/demo` -> HttpOnly cookie session -> `/api/session` | `src/client/src/main.tsx`, `src/server/index.ts` |
| App shell | Theme toggle | `setDark` -> `localStorage.theme` -> `data-theme` CSS tokens | `src/client/src/main.tsx:53`, `src/client/src/main.tsx:58` |
| Navigation | Section buttons | local `view` state selects page component | `src/client/src/main.tsx:74`, `src/client/src/main.tsx:97`, `src/client/src/main.tsx:129` |
| Dashboard | Load summary | `/api/summary` -> refresh schedule statuses -> metric cards and recent operations | `src/client/src/main.tsx:144`, `src/server/index.ts`, `src/server/domain.ts` |
| Products | Search | query string -> `/api/products?q=&status=all` -> product cards | `src/client/src/main.tsx:175`, `src/server/index.ts` |
| Products | Status/details API | `PATCH /api/products/:id` -> archive/delete/restore or update local fields | `src/server/index.ts` |
| Stock | Load lists | `/api/products`, `/api/locations`, `/api/balances`, `/api/stock/operations` | `src/client/src/main.tsx:221` |
| Stock | Conduct operation | form -> `POST /api/stock/operations` -> `applyStockOperation` -> reload | `src/client/src/main.tsx:236`, `src/server/index.ts:102`, `src/server/domain.ts:31` |
| Inventory | Snapshot | `/api/inventory/:locationId/snapshot` -> rows with `expected/version` | `src/client/src/main.tsx:331`, `src/server/index.ts:128` |
| Inventory | Apply | rows/comment -> `POST /api/inventory/apply` -> `applyInventory` | `src/client/src/main.tsx:332`, `src/server/index.ts:134`, `src/server/domain.ts:142` |
| Labels | Preview | selected products/quantities/template/geometry -> `/api/labels/preview` -> A4 preview with Code 128/EAN-13 barcode pattern | `src/client/src/main.tsx`, `src/server/index.ts`, `src/server/barcodes.ts` |
| Labels | Print/download PDF | `POST /api/labels/pdf` -> saves print job snapshot -> `application/pdf` download with rendered bars | `src/client/src/main.tsx`, `src/server/index.ts`, `src/server/barcodes.ts` |
| Labels | Reprint job | `/api/labels/jobs` + `POST /api/labels/jobs/:id/pdf` -> PDF from saved snapshot, including original barcode payload | `src/client/src/main.tsx`, `src/server/index.ts` |
| Imports | CSV/XLS/XLSX preview | filename + CSV/base64 XLS or XLSX -> `POST /api/imports/preview` -> preview draft | `src/client/src/main.tsx`, `src/server/domain.ts` |
| Imports | Commit import | draft/location -> `POST /api/imports/:id/commit` -> products + receipt operations | `src/client/src/main.tsx`, `src/server/domain.ts` |
| Imports | Undo import | committed import -> `POST /api/imports/:id/undo` -> remove created products/receipts if no later movements | `src/client/src/main.tsx`, `src/server/domain.ts` |
| Merge | Preview duplicate merge | source/target -> `POST /api/merges/preview` -> snapshot | `src/client/src/main.tsx`, `src/server/domain.ts` |
| Merge | Commit/undo | merge id -> commit/undo endpoints -> products/balances/stock-operation product links restored from snapshot; undo blocks later linked movements | `src/client/src/main.tsx`, `src/server/domain.ts` |
| Schedule | Week/month view | focus date + mode filter over `/api/schedule`; schedule refresh runs first; seller gets own shifts, admin gets all | `src/client/src/main.tsx`, `src/server/index.ts`, `src/server/domain.ts` |
| Schedule | Create/update/copy shift | form -> `POST /api/schedule`; status select -> `PATCH /api/schedule/:id`; copy -> `POST /api/schedule/:id/copy` | `src/client/src/main.tsx`, `src/server/domain.ts` |
| Schedule | Create/handle swap | `/api/staff`, `/api/schedule/swaps`, accept/decline/cancel endpoints; pending swaps expire when shift is no longer scheduled | `src/client/src/main.tsx`, `src/server/domain.ts` |
| Users | Load users | `/api/users`; backend requires `users:manage` | `src/client/src/main.tsx:478`, `src/server/index.ts:168` |
| Audit | Load audit | `/api/audit`; backend requires `techlog:read` | `src/client/src/main.tsx:492`, `src/server/index.ts:188` |

## Backend entrypoints

| Endpoint | Domain owner | Permission | Notes |
|---|---|---|---|
| `POST /api/auth/demo` | route handler | active demo user | Creates HttpOnly cookie session. |
| `POST /api/auth/telegram` | `verifyTelegramInitData` | valid Telegram init data | Verifies Telegram hash/auth date and creates HttpOnly cookie session. |
| `POST /api/auth/logout` | route handler | current cookie if present | Revokes current session and clears cookie. |
| `GET /api/session` | `actor` | active session cookie | No direct `x-user-id` spoof path. |
| `GET /api/openapi.json` | static route contract | public | Returns compact OpenAPI 3.1 endpoint map. |
| `GET /api/summary` | route handler | active user | Refreshes schedule statuses and uses current `Asia/Vladivostok` date. |
| `GET /api/products` | route handler | `products:read` | Server pagination max 100. |
| `POST /api/products` | route handler | `products:write` | Validates required name, unit, low-stock threshold, optional SKU/barcode identifiers. |
| `PATCH /api/products/:id` | route handler | `products:write` | Updates status/local name/category; supports archive/delete/restore by status. |
| `GET /api/locations` | route handler | active user | No read permission. |
| `GET /api/balances` | route handler | active user | Exposes all balances to any active user. |
| `POST /api/stock/operations` | `applyStockOperation` | `stock:move` | Validates product/location, quantity, idempotency. |
| `POST /api/stock/operations/:id/reverse` | `reverseOperation` | `techlog:read` | Permission should be an explicit reversal permission/admin capability. |
| `GET /api/stock/operations` | route handler | active user | Exposes full stock log to seller. |
| `GET /api/inventory/:locationId/snapshot` | `inventorySnapshot` | `inventory:write` | Validates active location. |
| `POST /api/inventory/apply` | `applyInventory` | `inventory:write` | Requires idempotency key and rejects invalid actuals/conflicts. |
| `POST /api/schedule` | `createShift` | `schedule:manage` | Creates shift after location/user/time and overlap validation. |
| `PATCH /api/schedule/:id` | `updateShift` | `schedule:manage` | Updates shift after overlap validation. |
| `POST /api/schedule/:id/copy` | `copyShift` | `schedule:manage` | Copies shift to target date after overlap validation. |
| `GET /api/schedule` | route handler | active user | Refreshes automatic shift/swap statuses before role-scoped response. |
| `POST /api/schedule/swaps` | route handler | active user owns shift | Refreshes stale statuses, validates active target user and blocks self-swap. |
| `POST /api/schedule/swaps/:id/accept` | `acceptSwap` | selected target user | Accepts pending request for scheduled shift. |
| `POST /api/schedule/swaps/:id/decline` | `declineSwap` | selected target user | Declines pending request. |
| `POST /api/schedule/swaps/:id/cancel` | `cancelSwap` | request creator | Cancels pending request. |
| `GET /api/schedule/swaps` | route handler | active user | Manager sees all; employee sees related requests. |
| `GET /api/staff` | route handler | active user | Lists active staff for swap target selection. |
| `GET /api/users` | route handler | `users:manage` | OK for admin+ only. |
| `PATCH /api/users/:id` | route handler | `users:manage`, `roles:manage` for role | Recalculates role permissions after role change. |
| `GET /api/audit` | route handler | `techlog:read` | OK for admin+ only. |
| `POST /api/labels/preview` | route handler | `labels:print` | Expands selected quantities and reports one-page overflow. |
| `POST /api/labels/pdf` | PDFKit generator | `labels:print` | Blocks bad geometry/overflow, stores print job, streams PDF. |
| `GET /api/labels/jobs` | label job list | `labels:print` | Lists recent print jobs. |
| `POST /api/labels/jobs/:id/pdf` | PDFKit generator | `labels:print` | Reprints PDF from saved job snapshot. |
| `POST /api/backups` | state backup | `techlog:read` | Creates JSON state backup. |
| `GET /api/backups` | backup list | `techlog:read` | Lists backup files. |
| `POST /api/backups/:name/restore` | backup restore | `techlog:read` | Restores SQLite-backed app state from named JSON backup. |
| `POST /api/imports/preview` | import parser | `imports:write` | Parses CSV, base64 XLSX, or simple BIFF8 XLS, stores preview draft, blocks duplicate committed hash. |
| `POST /api/imports/:id/commit` | import commit | `imports:write` | Creates products and receipt operations. |
| `POST /api/imports/:id/undo` | import undo | `imports:write` | Reverts committed import unless created products have later stock movements. |
| `GET /api/imports` | import list | `imports:write` | Lists recent import drafts/commits. |
| `POST /api/merges/preview` | merge preview | `merge:write` | Creates product/balance/operation snapshot. |
| `POST /api/merges/:id/commit` | merge commit | `merge:write` | Moves identifiers/balances/operation product links and soft-deletes source. |
| `POST /api/merges/:id/undo` | merge undo | `merge:write` | Restores source/target/balances/operation links unless later linked operations exist. |
| `GET /api/merges` | merge list | `merge:write` | Lists recent merge records. |

## Persistence

| Store action | Chain | Evidence |
|---|---|---|
| Startup load | `loadState()` reads SQLite `app_state`, migrates legacy `data/dvorik-state.json` if DB is empty, or uses seed state | `src/server/store.ts` |
| Domain mutation save | `audit()` appends entry and calls `saveState()` | `src/server/store.ts` |
| Demo session save | `/api/auth/demo` pushes session and calls `saveState()` | `src/server/index.ts` |
| Persistence write | SQLite upsert into `app_state`; JSON temp-file write only for `DVORIK_STATE_FILE` fallback | `src/server/store.ts` |
