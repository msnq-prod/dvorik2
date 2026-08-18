# P04 — Draft alternatives

## Option A — Hermetic modular release harness (initial recommendation)

Build once, start Core/Warehouse/Staff from artifacts with temporary databases and local dependency endpoints, wait on service-level readiness, run authenticated critical-flow probes, then backup/restore all stores.

**Pros:** deterministic CI evidence; tests the actual artifacts and boundaries.

**Cons:** more test harness work; camera still requires a separate device gate.

## Option B — Docker Compose as the only release test

Run production-like Compose and probe it.

**Pros:** closest packaging topology.

**Cons:** slower, environment-dependent, harder diagnostics; does not replace focused artifact tests.

## Option C — Repair only the current Core artifact smoke

Add Warehouse config/stubs and keep existing test shape.

**Pros:** fastest local repair.

**Cons:** proves Core only; misses actual Warehouse/Staff start, readiness and cross-service behavior.

## Draft delivery sequence

1. Define release manifest and exact required artifacts/config keys.
2. Replace stale Core-only smoke with modular artifact harness; keep focused process tests.
3. Add health checks and health-gated dependencies to Compose.
4. Probe auth, scan resolve/action, warehouse reconciliation and staff profile/status paths.
5. Rehearse backup/restore for all three SQLite stores and media; verify hashes/state.
6. Add deploy, migration, observation and rollback runbook with stop conditions.
7. Keep physical camera/Telegram validation as a signed manual release gate.

## Draft gates

- `verify:release` exits non-zero on any unavailable dependency or broken critical flow.
- Built artifacts, not source runners, are exercised.
- Restore rehearsal proves all authoritative stores and media.
- Compose never reports Core ready while mandatory services are unready.
