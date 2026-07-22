# A03 Analysis — Current Product

## Current strengths that must remain canonical

1. **Permissions and sessions.** Roles map to fine-grained permissions; user changes revoke active sessions (`gpt-version/src/server/permissions.ts:3-40`; `gpt-version/src/server/index.ts:549-575`).
2. **Verified Telegram WebApp identity.** Current verifies signed `initData` and creates HttpOnly sessions (`gpt-version/src/server/auth.ts:4-30`; `gpt-version/src/server/index.ts:254-275`).
3. **Stock operation contract.** Current requires idempotency keys, blocks negative stock, records actor/reason and supports reversal (`gpt-version/src/server/domain.ts:149-255`).
4. **Inventory contract.** Snapshot/apply records adjustments as operations and protects invalid values (`gpt-version/src/server/domain.ts:257-312`).
5. **Schedule domain.** Locations, statuses, overlap protection, permissions, audit and automatic status transitions are implemented and tested (`gpt-version/src/server/domain.ts:91-147`, `315-416`; `gpt-version/src/server/domain.test.ts:157-217`).
6. **Safer irreversible workflows.** Import and merge use preview/commit/undo with conflict checks, audit and idempotency (`gpt-version/src/server/domain.ts:418-627`).
7. **Labels.** PDF/barcode generation, print jobs and reprint endpoints are stronger than legacy's basic generator (`gpt-version/src/server/index.ts:647-688`).
8. **Operational controls.** Audit log and backup/create/list/restore are exposed through a dedicated page (`gpt-version/src/client/src/pages/AuditPage.tsx:25-144`).
9. **Modern shell.** Grouped permission-aware navigation, responsive layout and mobile bottom nav are in place (`gpt-version/src/client/src/main.tsx:64-96`, `240-309`, `413-421`).

## Current regressions against legacy

- no production Telegram bot or delivery worker;
- no self-service registration request;
- no rotation templates, closed days or schedule exports;
- dashboard page exists but is not routed;
- no reports page/API or automated archive workflow;
- no real notification preference/delivery system;
- import lacks legacy's supplier mapping and irregular-document inference;
- merge lacks automatic duplicate candidate groups and field-level resolution;
- product media is URL-only;
- persistence stores the entire `AppState` as one JSON payload inside SQLite (`gpt-version/src/server/store.ts:204-252`) instead of normalized searchable tables.

## Current-specific gaps discovered during comparison

- `createShift` and `updateShift` ignore supplied times and force full-day `00:00-23:59` (`gpt-version/src/server/domain.ts:315-359`).
- `acceptSwap` does not run overlap validation for the target (`gpt-version/src/server/domain.ts:966-986`).
- current seller schedule visibility is restricted to own/swap-related shifts, while legacy day view shows working/free staff (`gpt-version/src/server/index.ts:469-480`). This needs an explicit product decision.
- notification records are only created for accepted swaps; no Telegram sender exists (`gpt-version/src/server/domain.ts:976-984`).

