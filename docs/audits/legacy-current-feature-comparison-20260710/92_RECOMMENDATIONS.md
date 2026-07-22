# Recommendations

## R1 — Build one current domain for bot and WebApp

Current API/application services own schedule, users, stock and audit. Telegram becomes an adapter, never a second business-logic implementation.

## R2 — Normalize persistence before adding background work

Create real tables/repositories for users, products, identifiers, locations, balances, operations, shifts, swaps, imports, notifications and audit. Preserve current IDs/contracts during migration.

## R3 — Merge calendars

Keep current web calendar. Add legacy's personal Telegram calendar, work/closed markers, day detail, swap approval, rotation preview and export. Use 42 cells and current overlap/audit rules.

## R4 — Restore the operational admin home

Route current `DashboardPage`, keep quick actions, add schedule preview and location stock. Add optional graphite dark mode and dense mode.

## R5 — Restore real notifications and onboarding

Add pending registration requests, admin approval, per-event notification preferences and a durable Telegram/WebApp outbox with retry.

## R6 — Combine import strengths

Use legacy supplier/header/mapping normalization before current preview. Keep current idempotent commit, conflict-aware undo and audit.

## R7 — Restore reports and lifecycle automation

Add report page/API, downloadable exports, scheduled digests and audited archive sweep with recovery.

## R8 — Combine merge strengths

Use legacy candidate scoring/aliases/field choices and current snapshot/commit/undo/audit.

## R9 — Add managed media and optional touch buffer

Support image upload/compression/storage and a reusable multi-item worklist for tablet/store tasks.

