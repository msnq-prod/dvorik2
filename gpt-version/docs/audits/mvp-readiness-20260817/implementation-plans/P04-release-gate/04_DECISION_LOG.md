# P04 — Decision log

| Review feedback | Decision | Final-plan change |
|---|---|---|
| Use A+B, not one test style | accepted | Deterministic harness plus exact-digest Compose rehearsal. |
| `/seed` is absent from runtime image | accepted | Packaging/bootstrap is the first implementation gate. |
| Warehouse lacks existing-volume migration | accepted | Added migration/preflight/checksum contract for all stores. |
| Current readiness is shallow | accepted | Added dependency/schema/reconciliation/worker semantics. |
| Existing E2E is dev/embedded | accepted | Added production-auth real-artifact probes. |
| Backups share failure domain | accepted | Added off-volume coordinated three-store+media restore point. |
| Core-only Option C | rejected | May be repaired, but cannot approve a release. |
