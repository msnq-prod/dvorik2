# Findings

### P1-00: API actor could be spoofed with a request header

- **Promise:** permissions are checked by backend against an authenticated user.
- **Reality:** the first implementation trusted `x-user-id`.
- **Evidence:** prior `src/server/index.ts:15`.
- **Effect:** any caller could act as another user in the prototype API.
- **Direction:** replace header actor with server session.
- **Status:** fixed.

### P1-01: Stock operations can create orphan balances

- **Promise:** Stock is accounted by known product and known location.
- **Reality:** `findBalance()` creates a balance for any product/location string.
- **Evidence:** `src/server/domain.ts:47`, `src/server/store.ts:161`.
- **Effect:** API can mutate stock for nonexistent entities.
- **Direction:** Validate product and location IDs before balance lookup.
- **Status:** fixed.

### P1-02: Inventory/reversal accept missing idempotency key

- **Promise:** All mutation endpoints accept and enforce idempotency key.
- **Reality:** `applyInventory` and `reverseOperation` read `db.idempotency[""]` and proceed.
- **Evidence:** `src/server/domain.ts:88`, `src/server/domain.ts:142`.
- **Effect:** duplicate submit can be handled incorrectly; empty key is shared.
- **Direction:** reject empty idempotency keys consistently.
- **Status:** fixed.

### P1-03: Inventory silently ignores invalid negative actual rows

- **Promise:** Critical operations have clear errors.
- **Reality:** rows with `actual < 0` are skipped but API can return success.
- **Evidence:** `src/server/domain.ts:153`, `src/client/src/main.tsx:340`.
- **Effect:** false success and unmodified stock.
- **Direction:** validate all submitted rows and reject negative/non-finite actual.
- **Status:** fixed.

### P1-04: Shift swap can target nonexistent or blocked users

- **Promise:** exchange is between real employees.
- **Reality:** `toUserId` is stored without validation.
- **Evidence:** `src/server/index.ts:150`.
- **Effect:** impossible pending request and broken accept flow.
- **Direction:** validate active target user and prevent self-swap.
- **Status:** fixed.

### P1-05: Role update leaves permissions stale in session output

- **Promise:** changing roles immediately affects backend checks and UI.
- **Reality:** route changes `role` only; `target.permissions` remains old copied array.
- **Evidence:** `src/server/index.ts:180`, `src/server/permissions.ts`.
- **Effect:** UI/session can display stale permission state.
- **Direction:** recompute permissions on role change.
- **Status:** fixed.

### P2-01: Dashboard uses hardcoded date

- **Promise:** current shift count.
- **Reality:** date is fixed to `2026-06-26`.
- **Evidence:** `src/server/index.ts:41`.
- **Effect:** stale dashboard after date changes.
- **Direction:** compute current date in `Asia/Vladivostok`.
- **Status:** fixed.

### P2-02: UI leaks raw enum/English labels

- **Promise:** Russian UI.
- **Reality:** operation types and `A4 preview` are raw/English.
- **Evidence:** `src/client/src/main.tsx:431`, `src/client/src/main.tsx:512`.
- **Effect:** inconsistent product surface.
- **Direction:** add display label mapping.
- **Status:** fixed.

### P2-03: Labels claim PDF but only call browser print

- **Promise:** export PDF.
- **Reality:** `window.print()` opens print dialog.
- **Evidence:** `src/client/src/main.tsx:405`.
- **Effect:** incomplete acceptance for PDF export.
- **Direction:** add real PDF export endpoint and client download.
- **Status:** fixed.

### P1-06: Mutations were lost on process restart

- **Promise:** working app state survives normal use.
- **Reality:** state was held only in module memory.
- **Evidence:** prior `src/server/store.ts`.
- **Effect:** products, stock operations, audit and sessions disappeared after restart.
- **Direction:** persist app state atomically after mutations and load it on startup.
- **Status:** fixed.

### P1-07: Idempotency keys collided across command types

- **Promise:** repeated command with same key is idempotent for that command.
- **Reality:** one global key map could return a stock result for inventory/reversal using the same raw key.
- **Evidence:** prior `src/server/domain.ts`.
- **Effect:** wrong response type and skipped work across endpoints.
- **Direction:** scope idempotency cache keys by command family.
- **Status:** fixed.

### P1-08: Reversal operations could themselves be reversed

- **Promise:** cancellation is a compensating operation; original log remains immutable and cancellation is not repeatedly applied.
- **Reality:** `reverseOperation` accepted any operation, including `reversal`.
- **Evidence:** prior `src/server/domain.ts`.
- **Effect:** confusing second-order compensation and broken audit semantics.
- **Direction:** reject reversal targets with type `reversal`.
- **Status:** fixed.

### P2-04: Product creation accepted invalid numeric/unit fields

- **Promise:** product fields follow declared DTO/domain values.
- **Reality:** `unit` and `lowStockThreshold` were accepted without validation.
- **Evidence:** prior `src/server/index.ts`.
- **Effect:** bad product data could enter lists and reports.
- **Direction:** validate allowed unit and non-negative finite threshold.
- **Status:** fixed.

### P1-09: Backup requirement had no working surface

- **Promise:** backup exists for operational safety.
- **Reality:** state persistence existed, but no explicit backup command/API.
- **Evidence:** prior `src/server/store.ts`, `src/server/index.ts`.
- **Effect:** no operator-visible way to create/list backups.
- **Direction:** add permission-gated backup create/list endpoints backed by state snapshot files.
- **Status:** fixed.

### P1-10: Supply import workflow was missing/incomplete

- **Promise:** CSV/XLS/XLSX import has preview and atomic commit.
- **Reality:** there was no import surface.
- **Evidence:** prior API/UI had no import endpoints.
- **Effect:** documented replenishment workflow could not be performed.
- **Direction:** add CSV/XLS/XLSX preview/commit with duplicate hash guard and receipt operations.
- **Status:** fixed.

### P1-13: Supply import had no targeted undo and could partially commit

- **Promise:** import is previewed, applied atomically, and recoverable.
- **Reality:** commit validated rows while mutating, and rollback depended on full backup restore.
- **Evidence:** prior `src/server/domain.ts`.
- **Effect:** a later invalid row could leave earlier products created; operators could not cancel one committed import safely.
- **Direction:** validate all rows before mutation and add conflict-checked import undo.
- **Status:** fixed.

### P1-11: Product duplicate merge workflow was missing

- **Promise:** duplicate products can be previewed, committed, and undone.
- **Reality:** there was no merge workflow.
- **Evidence:** prior API/UI had no merge endpoints.
- **Effect:** documented duplicate resolution could not be performed.
- **Direction:** add preview/commit/undo using stored snapshots.
- **Status:** fixed for product fields, identifiers and balances.

### P1-12: Telegram WebApp auth was missing

- **Promise:** Telegram users are identified by Telegram profile/ID.
- **Reality:** only demo user selection existed.
- **Evidence:** prior `src/server/index.ts` had no Telegram auth endpoint.
- **Effect:** production-like WebApp login could not be validated.
- **Direction:** verify Telegram init-data signature and bind it to active local users.
- **Status:** fixed.

### P2-05: API contract was not discoverable

- **Promise:** implementation should be traceable and integrable by bot/admin clients.
- **Reality:** routes existed only in code.
- **Evidence:** prior app had no `/api/openapi.json`.
- **Effect:** harder client integration and stale contract risk.
- **Direction:** expose compact OpenAPI 3.1 route map.
- **Status:** fixed.

### P1-14: Shift swap lifecycle was API-only and incomplete

- **Promise:** employees can manage shift exchanges.
- **Reality:** UI only listed shifts; API only created and accepted requests.
- **Evidence:** prior `src/client/src/main.tsx`, prior `src/server/domain.ts`.
- **Effect:** employees could not create, decline, or cancel exchange requests from the WebApp.
- **Direction:** add visible swap controls and backend `decline/cancel` transitions with actor checks.
- **Status:** fixed.

### P1-15: Shift management was mostly read-only

- **Promise:** manager creates shifts, assigns employees, sees week/month calendar, copies schedules, and gets overlap warnings.
- **Reality:** UI listed seed shifts; there was no create/update/copy flow and no overlap guard.
- **Evidence:** prior `src/client/src/main.tsx`, prior `src/server/index.ts`.
- **Effect:** the first section of the ТЗ could not be completed from the app.
- **Direction:** add manager shift form, week/month filter, copy/status controls, and backend overlap validation.
- **Status:** fixed.

### P1-16: Label print jobs were not stored or repeatable

- **Promise:** label jobs are journaled and repeatable with original product data.
- **Reality:** PDF generation streamed labels directly without saved job snapshot, quantity per product, or reprint surface.
- **Evidence:** prior `src/server/index.ts`, prior `src/client/src/main.tsx`.
- **Effect:** operators could not prove or repeat what was printed.
- **Direction:** store label job snapshot on PDF generation, support quantities and reprint from snapshot.
- **Status:** fixed.

### P1-17: Label barcodes were not graphically rendered

- **Promise:** Code 128 labels are printed, and EAN-13 is used only for valid 13-digit codes.
- **Reality:** labels only showed SKU text.
- **Evidence:** prior `src/server/index.ts`, prior `src/client/src/main.tsx`.
- **Effect:** printed labels were not scanner-ready.
- **Direction:** add barcode encoding, preview rendering, PDF bars, and saved barcode snapshots.
- **Status:** fixed.

### P1-18: Schedule statuses did not advance automatically

- **Promise:** shifts have lifecycle statuses and swap requests can expire.
- **Reality:** statuses changed only manually; pending swaps stayed pending after the shift time.
- **Evidence:** prior `src/server/domain.ts`, prior `src/server/index.ts`.
- **Effect:** current-shift metrics and swap decisions could be stale.
- **Direction:** refresh shift and swap statuses on schedule/summary reads and schedule mutations.
- **Status:** fixed.

### P1-19: Merge rollback ignored stock operation links

- **Promise:** duplicate merge is reversible.
- **Reality:** product and balance snapshots were restored, but source product stock operations stayed detached from rollback semantics.
- **Evidence:** prior `src/server/domain.ts`.
- **Effect:** operation journal could point at the merged target after undo or allow unsafe rollback after new movements.
- **Direction:** snapshot affected operations, move source operation links on commit, restore on undo, and block undo after later linked movements.
- **Status:** fixed.

### P2-06: Runtime persistence was file-backed, not DB-backed

- **Promise:** production storage should be deployable and evolvable through migrations.
- **Reality:** `gpt-version` persists to JSON state files.
- **Evidence:** `src/server/store.ts`.
- **Effect:** suitable for prototype/demo, not concurrent production use.
- **Direction:** add SQLite-backed storage while keeping JSON fallback for isolated tests.
- **Status:** fixed as SQLite app-state persistence; fully normalized Drizzle schema remains outside this prototype.
