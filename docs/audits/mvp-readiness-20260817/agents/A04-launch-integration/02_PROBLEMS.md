# A04 — Problems

### P1-A04-01: Production smoke test cannot prove the current Core composition

- **Promise:** `test:release-artifact` is part of `verify:release` (`package.json:26,32`) and claims to smoke-test a production artifact.
- **Reality:** the test config enables external Staff but omits the now-required external Warehouse mode/base URL (`src/server/release-artifact-smoke.test.ts:30-32`), while production requires both (`src/server/config.ts:134-137`). The test was executed after a successful build and exited with Node's “unsettled top-level await” warning at line 78, without its success message.
- **Effect:** the production verification gate is red or indeterminate; startup failure caused by an incompatible service configuration can reach launch day.
- **Cause:** release test drifted from the production runtime contract.
- **Status:** confirmed.

### P1-A04-02: No health/readiness dependency gate in the modular composition

- **Promise:** Core depends on Warehouse and Staff (`docker-compose.modular.yml:17`); Core has readiness endpoints in the release smoke test (`src/server/release-artifact-smoke.test.ts:70-74`).
- **Reality:** Compose uses only startup ordering, with no health checks or dependency condition (`docker-compose.modular.yml:17,53`).
- **Effect:** Core can start before dependencies are usable, producing temporary failed staff/warehouse operations after restart.
- **Cause:** operational composition lacks readiness orchestration.
- **Status:** confirmed.

### P1-A04-03: Seed contains unverified opening lots

- **Promise:** warehouse seed verification runs in the release chain (`package.json:26,40`).
- **Reality:** its own result reports `unverifiedOpeningLots:2`.
- **Effect:** initial stock/cost basis has a known unresolved data-quality exception before launch.
- **Cause:** incomplete source-data verification.
- **Status:** confirmed.
