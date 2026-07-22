# Scope

Target: full `gpt-version` app created from Dvorik documentation.

Included:
- React WebApp in `src/client/src/main.tsx` and `src/client/src/styles.css`.
- Express API in `src/server/index.ts`.
- Domain logic in `src/server/domain.ts`, permissions, seed store, shared DTOs.
- Current tests/build scripts.

Expected behavior:
- Russian responsive WebApp for products, stock, inventory, labels, schedule, users, audit.
- Backend permission checks for all restricted actions.
- Stock invariants: no negative stock, idempotent mutation, immutable operation log, reversal operation.
- Inventory conflict detection by versions.
- Labels preview/PDF print flow with graphical Code 128/EAN-13 barcode rendering.
- CSV/XLS/XLSX import preview/commit/undo, duplicate merge preview/commit/undo with operation rollback guard, backup/restore.
- Telegram WebApp init-data auth, automatic schedule status refresh, and OpenAPI discovery endpoint.

Non-goals:
- CI/deploy automation, Telegram bot webhooks beyond WebApp auth.
- Fully normalized relational schema/Drizzle layer.

Commands used:
- `rg --files -g '!node_modules' -g '!dist' -g '!output'`
- `nl -ba ...`
- `npm run check`
- `npm test`
- `npm run build`
- `npm audit --omit=dev`
- Local API smoke for `/api/openapi.json`, `/api/auth/telegram`, `/api/imports/preview` with XLS/XLSX.
- Playwright CLI smoke checks from previous run.

Known constraints:
- This is a single-folder prototype with SQLite-backed app state in `data/dvorik.sqlite`.
- No CI config.
- Import supports CSV, simple `.xlsx`, and simple BIFF8 `.xls` table files.
