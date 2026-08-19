# P04 — Final implementation plan

## Decision

Use hybrid A+B: a fast deterministic real-artifact harness for every release, followed by a bounded Compose clean-install/upgrade rehearsal using the exact same immutable image digest. A repaired Core-only smoke is not release evidence.

## Release evidence model

- `verify:release`: checks/tests, one build, artifact manifest, real Core/Staff/Warehouse processes, critical probes and isolated restore rehearsal.
- `verify:compose-release`: exact image digest, clean and upgrade volumes, health ordering, same probes and backup/restore.
- `verify:environment`: non-mutating validation of mounts, secret presence/redaction, HTTPS, Telegram and object storage.
- `deploy:release`: backup → migration → traffic-closed deploy → automated probes → observation; traffic opens only after current manual gates for the same digest.

Any skipped probe, schema drift, stale waiver, backup/restore mismatch or missing manual evidence is a hard failure.

## Phase 1 — Immutable packaging contract

1. Produce one manifest with release/commit, image digest, artifact list, migration checksums, seed/fixture hashes and UI assets.
2. Fix Warehouse bootstrap packaging: include an owned bootstrap artifact or replace `/seed` copy with a Warehouse bootstrap/migration command. Assert `dist/warehouse/index.js` and every runtime migration/asset.
3. All later gates consume the same digest; no `tsx`, source runner, rebuild or ambient host volume may satisfy them.

**Exit:** clean Warehouse volume and production-shaped existing volume both start from the promoted image.

## Phase 2 — Configuration and migrations

1. Add machine-readable required-variable manifest per service with type and secret classification.
2. Fail before mutation on placeholders, weak/mismatched shared secret, invalid URL/path or unwritable mount; redact secrets from commands/logs/evidence.
3. Give Core, Warehouse and Staff idempotent migration/preflight, expected schema/checksum and declared migration order.
4. Require expand/contract compatibility with previous image; destructive cleanup is later approval.

**Exit:** clean install, upgrade and compatible rollback preflight are deterministic.

## Phase 3 — Real-artifact modular harness

1. Launch built Core, Staff and Warehouse with isolated temp stores, media/backups, ports and bounded waits; retain per-service stdout/stderr and named failed probe.
2. Use validating fakes only for external Telegram/object storage; never stub Staff/Warehouse.
3. Probe production authentication or a narrowly scoped signed release identity absent from shipped runtime.
4. Assert state/side effects for onboarding/login/block/session rejection, Staff projection/profile reload, QR/barcode resolve, idempotent Warehouse mutation, FIFO/balance/journal, outbox delivery, unauthorized denial, UI assets/media and deferred Cash/Saby.

**Exit:** one command proves cross-service contracts and fails with actionable diagnostics.

## Phase 4 — Readiness and Compose gate

1. Separate liveness from readiness. Readiness includes expected schema, store R/W, import/reconciliation, dependency contract and worker/outbox thresholds.
2. Add service health checks and `service_healthy` ordering; company worker waits for healthy Core.
3. Run exact Compose digest twice: fresh isolated volumes and upgrade from sanitized production-shaped backups. Verify running digests and repeat critical probes.
4. Keep traffic closed until an aggregate external readiness check passes all services.

**Exit:** Core cannot be declared externally ready while mandatory Staff/Warehouse is unready.

## Phase 5 — Consistent backup, restore and rollback

1. Capture Core SQLite, Warehouse SQLite, Staff SQLite and media under one manifest/timestamp/watermark.
2. Store encrypted integrity-checked backups outside application volumes/failure domain.
3. Restore into fresh isolated volumes, start the same artifacts and verify semantic identities, balances/lots, inbox/outbox watermarks and media hashes; record RPO/RTO.
4. Normal rollback redeploys previous compatible image over forward-migrated data and never enables legacy Warehouse writes. Data restore is a separate destructive approval for corruption only.

## Phase 6 — Staging and production runbook

1. On sanitized production copy: backup, migrate, deploy, readiness, critical probes, restore proof and observation thresholds.
2. Bind manual QR/camera, Telegram, object-storage, monitoring and traffic-control evidence to release digest/environment with signer and expiry.
3. Production: verify restore point, migrate, deploy traffic-closed, probe, gradually expose, observe and sign. Any stop condition keeps traffic closed or triggers declared compatible-image rollback.

P01–P03 acceptance gates are inputs to P04; P04 cannot waive them.
