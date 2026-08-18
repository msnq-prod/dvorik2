# P04 — Acceptance gates

- [ ] One immutable image/manifest/digest is used across all gates.
- [ ] Warehouse clean bootstrap asset/path exists and existing-volume migration passes.
- [ ] Required configuration validates before mutation and secrets are redacted.
- [ ] Core/Warehouse/Staff schema checksums and expand/contract compatibility pass.
- [ ] Real-artifact harness starts all three services and reports bounded diagnostics.
- [ ] Production-auth critical flows assert state and side effects.
- [ ] Compose fresh-install and production-shaped upgrade pass on the same digest.
- [ ] Health-conditioned dependencies and aggregate readiness pass.
- [ ] Coordinated off-volume backup and semantic restore pass with recorded RPO/RTO.
- [ ] P01–P03 gates are green; opening-lot evidence has no stale exception.
- [ ] Manual HTTPS QR/camera, Telegram, object-storage and rollback-control evidence is current for the digest.
- [ ] Stop conditions, owners, observation window and compatible-image rollback are signed.
