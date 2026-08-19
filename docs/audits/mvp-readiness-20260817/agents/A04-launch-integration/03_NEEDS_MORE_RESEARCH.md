# A04 — Needs more research

- Run the full modular stack with a real non-secret production-equivalent environment and verify Core, Staff and Warehouse `/ready` endpoints plus cross-service requests.
- Determine whether the two unverified opening lots are permitted, then reconcile against signed source documents before enabling write-offs/sales.
- Confirm HTTPS public routing for the secure `__Host-` cookie and Telegram WebApp, plus real object-storage permissions.
- Establish backup schedules and restore rehearsal for all three SQLite volumes; compose defines volumes but does not schedule backup jobs (`docker-compose.modular.yml:55-57`).
