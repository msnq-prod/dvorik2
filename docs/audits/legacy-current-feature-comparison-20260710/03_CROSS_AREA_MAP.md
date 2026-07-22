# Cross-Area Map

| Shared concept | Legacy owner | Current owner | Merge direction |
|---|---|---|---|
| User identity | Telegram roles/registration | User status, permissions, sessions | Current model + legacy request/approval flow |
| Schedule | SQLite day/assignment/transfer | Shift/swap domain | Current domain + legacy day/rotation/export/bot adapter |
| Notifications | Telegram preferences and scheduler | In-memory notification list | Durable outbox + Telegram/WebApp adapters |
| Product search | SQLite FTS + aliases | Client-side filtering | Server search/FTS behind current API |
| Stock | Normalized stock rows | Operations + balances + idempotency | Current operation contract on normalized DB |
| Import | Supplier parsing/mapping/log | Preview/commit/undo | Legacy normalization + current safety state machine |
| Merge | Similarity discovery + field modes | Snapshot/commit/undo | Legacy discovery + current transaction/audit |
| Media | Telegram/local photo cache | External URL field | Managed media service + current product entity |
| Dashboard | Operational cockpit | Menu plus orphaned DashboardPage | Current shell + legacy information architecture |
| Reports | CSV/web/bot + archive sweep | No product surface | Current report API/page + worker delivery |

## Primary conflict

Current writes the entire application state as one JSON payload. Adding bot, scheduler, reports and multi-user admin load on top of that would amplify concurrency and query limitations. Normalize persistence before completing the merge.

