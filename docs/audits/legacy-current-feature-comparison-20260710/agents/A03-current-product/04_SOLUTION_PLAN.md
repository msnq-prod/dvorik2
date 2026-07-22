# A03 Solution Plan

1. Treat current domain contracts, permissions, audit, idempotency and undo as the base.
2. Normalize persistence behind repository interfaces before adding bot/background workloads.
3. Add bot, worker/outbox and report adapters against the same application services.
4. Restore the operational dashboard and add real notification state/preferences.
5. Extend schedule with day detail, closed-day rules, rotation templates, export and safe swap validation.
6. Extend import/merge/media using the legacy capabilities while keeping current preview/commit/undo.
7. Add integration tests for cross-surface consistency: WebApp action -> DB -> Telegram notification -> audit.

