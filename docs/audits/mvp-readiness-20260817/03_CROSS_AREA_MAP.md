# Cross-area map

| Concept | Current owner | Consumer | Conflict |
|---|---|---|---|
| FIFO lots and balances | Warehouse | Core proxy, Stock/Inventory UI | UI still submits legacy Core stock commands, disabled in production. |
| Product identifiers / scanned values | Core legacy catalog | Scanner UI | Warehouse owns production catalog but has no identifier contract. |
| Employee access/status | Core identity | Staff process | Status change revokes Core sessions but is not immediately replicated to Staff. |
| Employment data and shifts | Staff | Core UI/proxy | Requires one-time migration/cutover absent from Compose runbook. |
| Production topology | Core + external Warehouse + Staff | all MVP flows | Smoke test and Compose do not prove dependency readiness or full user flow. |

## Dominant dependency

The mandatory external Warehouse mode disables the legacy Core actions on which both the warehouse screen and scanner rely. This is the primary P1 launch blocker; resolving it is prerequisite to meaningful device testing.
