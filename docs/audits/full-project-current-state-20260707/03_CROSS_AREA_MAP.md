# Cross-Area Map

## Main Layers

| Layer | Status | Role |
|---|---|---|
| Root `msnq-prod/dvorik2` | current tracked repo | loyalty/admin scaffold |
| `docs/crm` | target docs | warehouse CRM requirements |
| `gpt-version` | local prototype | closest TS implementation of target warehouse product |
| `recovered-dvorik` | local legacy/reference | Python Telegram/Flask warehouse system |
| `ТЗ-склад-смены-маркировки` | local handoff spec | Russian target requirements |

## Shared Concepts

| Concept | Root | Docs | gpt-version | recovered-dvorik |
|---|---|---|---|---|
| Users/roles | admins/cashiers, weak auth | required | roles/permissions/session | Telegram roles |
| Products | absent | required | implemented | implemented |
| Stock | absent | required | operations/balances | SQLite stock/services |
| Shifts | absent | required | implemented | implemented |
| Labels | absent | required | PDF labels | reports/print flows |
| Telegram | placeholder webhooks | required | WebApp auth, no production webhooks | bot-first system |

## Conflicts

1. Root stack is PostgreSQL/Drizzle; `gpt-version` uses SQLite state.
2. Root UI is loyalty; target docs are warehouse CRM.
3. `recovered-dvorik` has mature Telegram flows, but wrong stack for root.
4. `replit.md` claims a more complete loyalty product than frontend reality supports.

