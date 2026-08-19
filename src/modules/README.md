# Module boundaries

| Module | Owns |
|---|---|
| `platform` | users, roles, permissions, sessions, audit, notifications, transport outbox/inbox |
| `warehouse` | products, suppliers, supplies, lots, balances, inventory, FIFO, cost basis |
| `staff` | employee profiles, HR events, schedules and exchanges |
| `cash` | external cash integrations, mappings, sales, returns, reconciliation |
| `company` | read-only projections, dashboard and combined reporting |

Rules:

1. A module may import only another module's public `index.ts` contract.
2. A module never reads or writes another module's owned tables.
3. Cross-module state changes use versioned events from `src/contracts`.
4. `company` owns no operational facts and never mutates source modules.

