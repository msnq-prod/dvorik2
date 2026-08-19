# P04 — Blind review

## Verdict

Use a **hybrid of A and B**, with A as the fast deterministic CI gate and a bounded B rehearsal as the packaging/topology gate. Build one immutable image once, run the modular artifact harness against that image, then run the exact release Compose definition with the same image digest and production-shaped persistent data. Option C may be used only as a short repair step; it is not release evidence.

The draft is directionally correct but not implementation-ready. It does not define the artifact identity, migration contract, readiness semantics, cross-store restore point, rollback boundary, or exact automated/manual evidence. A single command can orchestrate the gates, but it must not imply that physical-device and production-infrastructure checks are hermetic CI tests.

## Option comparison

| Criterion | A — modular harness | B — Compose only | C — Core smoke only |
|---|---|---|---|
| Urgent MVP | Best feedback speed after modest harness work | Useful but too slow as the only feedback loop | Fastest patch, false confidence |
| Real artifacts | Strong only if it launches the built Core, Staff and Warehouse artifacts, not source runners or behavioral stubs | Strongest when it uses the exact promoted image digest | Core only; currently does not even assert `dist/warehouse/index.js` |
| Real topology | Can verify process and HTTP boundaries, but not container packaging, volumes, health ordering or image contents | Verifies those boundaries directly | Does not verify mandatory external services |
| Diagnostics | Best: per-service logs, named probes and bounded failure reasons | Acceptable only with captured health, logs, inspect output and probe results | Narrow and misleading |
| Deterministic CI | Best with isolated temp roots, reserved ports, fixtures, fake external systems and bounded waits | Weaker due to Docker state, image build/cache, volumes and networking | Deterministic but incomplete |
| Config/secrets | Can validate a generated non-secret contract and redaction | Proves Compose wiring and secret injection | Misses service-specific configuration |
| Migrations/readiness | Can test clean and existing-volume cases precisely | Required to prove startup order and real mounted volumes | Core schema only |
| Critical flows | Best for authenticated API-level flow probes across three services | Required final confirmation on packaged topology | Cannot prove cross-service behavior |
| Backup/restore | Best for fault injection and semantic restore assertions | Required for real volume/path/permission proof | Core backup only |
| Rollback/device gates | Needs explicit deployment/manual stages | Best deployment substrate, still cannot automate physical devices | Not covered |

**Reject B as the only release test.** It delays precise failures until the slowest stage and remains susceptible to stale images, volumes and ambient host state.

**Reject C as release acceptance.** The current smoke starts only `dist/index.js`, supplies Staff configuration without starting Staff, omits mandatory Warehouse configuration, and treats Core's database-only `/ready` as sufficient. Repairing that test without launching the dependencies would preserve the central blind spot.

## Confirmed artifact/topology gaps

- `Dockerfile` copies only `dist` into the runtime image, while the Warehouse Compose command copies `/seed/warehouse.sqlite`. No `/seed` content is present in that image, so a clean `warehouse-data` volume cannot start as declared.
- The Warehouse runtime opens an existing database with `fileMustExist: true` and has no migration runner. Existing Warehouse volumes therefore have no repeatable upgrade path; a seed-only clean-start check is insufficient.
- Staff applies migrations on startup, Core applies its own migrations, and Warehouse applies none. The release plan does not define migration order, compatibility, failure handling or schema-version gates.
- Core Compose dependency ordering is startup-only. Core `/ready` checks Core schema/database/worker state, not mandatory Staff and Warehouse readiness. Staff `/ready` checks only `SELECT 1`; it does not verify expected schema, writability or worker/outbox health.
- Compose schedules no backups. Core and Staff have backup artifacts, Warehouse has none, and the current Core backup directory shares `core-data` with the source database/media, so volume loss can remove both source and backup.
- Existing E2E starts `src/server/index.ts` with dev tools and an embedded Warehouse. It is useful UI coverage but is not production-artifact, production-auth or modular-topology evidence.
- The seed verifier reports two unverified opening lots. Technical FIFO reconciliation must not turn that known business-data exception into a green release silently.

## Required invariants

### Artifact and CI

1. One build produces a versioned image/artifact manifest with commit, image digest, migration set/checksums, seed/fixture hash and UI asset presence. All later gates consume that immutable output; no gate rebuilds or invokes `tsx`/source files.
2. The harness launches real Core, Staff and Warehouse artifacts. Stubs are allowed only for systems outside this deployable topology, such as Telegram and object storage, and must validate requests rather than return unconditional success.
3. Each run uses fresh isolated databases, media, backup paths, ports and Compose project/volumes. It must ignore ambient production variables, use bounded deadlines, kill every child on failure, and retain per-service stdout/stderr plus the failed probe name.
4. The Compose gate pulls/loads the selected digest and verifies running container digests. It must test both an empty install and an upgrade from a production-shaped backup; stale local images or volumes cannot satisfy the gate.

### Configuration and secrets

5. A machine-readable release manifest lists every required variable by service, type and secret/non-secret classification. Validation fails before mutation for missing values, placeholders, invalid URLs/paths, weak secrets, unwritable mounts or inconsistent shared internal secrets.
6. Secret values never appear in commands, generated reports, Compose output or retained logs. CI uses ephemeral injected secrets; the runbook names the secret provider, ownership and rotation procedure, not values.
7. Production external URLs are explicit. Staff and Warehouse must not silently rely on localhost defaults. Public HTTPS, the `__Host-` secure cookie contract, Telegram webhook origin/secret and object-storage read/write/delete permissions require pre-traffic checks.

### Migrations and readiness

8. Every authoritative store has an idempotent migration mechanism, expected schema version/checksum and read-only preflight. Migrations run only after verified backups, in a declared order, and stop before traffic on drift, checksum mismatch, collision or reconciliation failure.
9. Releases use expand/contract compatibility: the new and previous application versions must both tolerate the migrated schema and inter-service contract during rollout/rollback. Destructive migrations are a separate, later operation.
10. Liveness means only that a process is alive. Readiness means expected schema, readable/writable store, required seed/import reconciliation, usable dependency contract and no worker/outbox condition beyond the declared threshold. The ingress gate checks all three services; Compose uses `service_healthy`, and the company worker starts only after Core is healthy.
11. Warehouse readiness includes schema/seed identity and zero unexplained reconciliation differences, not only matching FIFO totals. The two unverified lots must be physically reconciled or covered by a named, signed, expiring waiver visible in release evidence.

### Critical flows

12. Automated probes use production authentication behavior or a narrowly scoped signed test identity unavailable in the shipped runtime. A dev demo login cannot satisfy the release gate.
13. At minimum, evidence must cover:
    - Telegram onboarding/approval, login, authenticated session, logout, block and rejection of the old session;
    - Staff identity propagation/migration comparison, profile update/reload and `/api/staff/status` through Core;
    - scan-code resolution for known/unknown code, an authorized Warehouse mutation with idempotent replay, updated FIFO/balance/journal through Core, and Warehouse outbox delivery/projection;
    - denial for an unauthorized role, static UI load, object upload/read, and explicit confirmation that deferred Cash/Saby paths remain disabled.
14. Probes assert state and side effects, not only HTTP status. They use unique correlation/idempotency keys and report which boundary failed.

### Backup, restore and rollback

15. A release restore point covers Core SQLite, Warehouse SQLite, Staff SQLite and media with a shared manifest/cutover timestamp. The procedure defines quiescing or a consistent watermark so independently captured stores cannot restore to contradictory business state.
16. Backups are integrity-checked, encrypted, retained outside the source volumes/failure domain and tied to release/schema metadata. Restore is rehearsed into isolated fresh volumes, then all three artifacts start and semantic counts, identities, balances, outbox state and media hashes are checked. Record measured RPO/RTO.
17. Rollback normally means stop exposure, redeploy the previous compatible image digest and retain forward-migrated data. It must never re-enable legacy Core Warehouse writes. Data restore is a separate destructive decision used only for corruption/irreversible migration, with declared data-loss window, owner and approval.
18. The runbook defines stop conditions, decision owner, traffic enable/disable command, observation window and thresholds for readiness failures, auth failures, reconciliation drift and stuck outboxes. A failed post-deploy gate keeps traffic closed or triggers rollback automatically.

## Ordered delivery and release sequence

1. Freeze the retained MVP scope, artifact manifest and exact automated/manual acceptance matrix.
2. Fix packaging first: include the Warehouse bootstrap asset or replace it with a Warehouse-owned migration/bootstrap artifact; assert every required runtime and migration artifact in the manifest.
3. Add preflight validation and migrations for all three stores, including existing-volume fixtures and backward-compatible schema rules.
4. Implement Option A with real built Core/Staff/Warehouse processes, deterministic external fakes, authenticated cross-service probes, structured diagnostics and isolated restore rehearsal.
5. Add meaningful service health checks and health-conditioned Compose dependencies. Do not expose public traffic from Compose itself before an external aggregate readiness check passes.
6. Implement a separate three-store-plus-media backup command and isolated restore verifier; store backups outside application volumes.
7. Add Option B as a bounded clean-install and production-copy upgrade rehearsal using the exact image digest. Run the same critical probes and restore verification against it.
8. Reconcile opening lots, rehearse Staff migration/finalization, then execute backup → migration → deploy → readiness → critical-flow → observation in staging on a sanitized production copy.
9. Execute the manual HTTPS/device gate and record signer, device/browser/version, timestamp and evidence.
10. In production: create and verify the restore point, migrate, deploy with traffic closed, run automated gates, open traffic gradually, observe thresholds, then sign release. On any stop condition, follow the predeclared rollback branch.

## Release gate model

- `verify:release` is the deterministic pre-merge gate: checks, tests, one build, manifest validation, Option A critical flows and isolated restore rehearsal.
- `verify:compose-release` is the packaging gate: same immutable image, fresh and upgrade volumes, health ordering, critical flows, backup/restore, captured diagnostics.
- `verify:environment` is a non-mutating deployment preflight for mounts, secret presence/redaction, HTTPS, Telegram and object storage.
- `deploy:release` orchestrates backup, migration, deployment and automated post-deploy checks but remains blocked until separately recorded manual gates are current for the same release digest.
- Any skipped probe, unavailable dependency, stale waiver, schema drift, backup failure, restore mismatch or missing evidence is a hard non-zero failure. Warnings cannot yield a green release.

## Manual gates

- On each supported iOS/Android device and Telegram/browser combination over the real HTTPS origin: first camera permission, denial, retry, background/resume, duplicate scan suppression, known and unknown codes, every claimed symbology, and one authorized mutation with visible refreshed state.
- Telegram: real launch/callback, approval, cookie persistence, logout, blocked-user session rejection and webhook validation.
- Infrastructure: real object upload/read, external backup visibility, restore operator access, monitoring/alert receipt and traffic rollback control.
- Evidence is bound to the release digest and environment and expires on changes to scanner/auth/runtime packaging. A named release owner signs each gate; “not run” is a blocker, not a waiver.

## Required changes

- [ ] Adopt A+B: deterministic real-artifact harness first, exact-image Compose rehearsal second; do not accept C as release proof.
- [ ] Define and verify one immutable release manifest/digest across all gates.
- [ ] Fix the missing Warehouse bootstrap asset and add an idempotent existing-volume Warehouse migration/readiness mechanism.
- [ ] Define fail-closed config validation and secret redaction for every service.
- [ ] Strengthen Staff/Warehouse/Core readiness and add health-conditioned Compose startup/traffic gating.
- [ ] Add production-authenticated Core→Staff/Warehouse critical-flow probes with state and outbox assertions.
- [ ] Provide an off-volume, consistent Core+Warehouse+Staff+media backup and semantic restore rehearsal.
- [ ] Specify migration order, compatibility, stop conditions, observation thresholds and image/data rollback branches.
- [ ] Resolve the two opening lots or attach a signed expiring waiver to the release evidence.
- [ ] Require signed real-HTTPS camera, Telegram, object-storage and rollback-control gates for the same release digest.
