# A04 — Solution plan

## Recommended launch sequence

1. **Repair the release gate.** Align the production artifact smoke test with the mandatory external Warehouse and Staff contract; make it start actual dependency stubs or the full compose stack. Treat a green process-level test as required evidence.
2. **Make composition deterministic.** Add service health checks/readiness dependencies and a short launch runbook that lists environment provisioning, migrations, seed import, health checks, and rollback.
3. **Rehearse data cutover.** On copies of production data: build the Warehouse seed, reconcile every opening lot, migrate Staff, prove Core-to-service requests and backup/restore for Core, Warehouse and Staff.
4. **Deploy only the retained MVP flow.** Keep Cash/Saby and other deferred functions disabled; publish Core over HTTPS and validate Telegram callback/cookie behavior.

## Launch gates

- Every `verify:release` component passes, including a repaired production-composition test.
- Warehouse and Staff are both ready before Core is exposed; Core `/ready` and key authenticated calls succeed.
- Opening lots have zero unexplained exceptions, or each exception has an approved, signed launch waiver.
- A backup and restore rehearsal exists for all persisted volumes.

## Alternative

For fastest safe launch, deploy an embedded single-process Core only in non-production mode. This is **not** a production option because `src/server/config.ts:134-137` expressly forbids it; changing that rule would expand scope and reintroduce the legacy/Warehouse ownership conflict.
