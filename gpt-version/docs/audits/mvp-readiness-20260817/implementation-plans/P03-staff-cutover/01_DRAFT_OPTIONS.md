# P03 — Draft alternatives

## Option A — External Staff with durable identity event bridge (initial recommendation)

Keep Core identity/session ownership and Staff employment ownership. Rehearse one-time migration; publish idempotent identity-status events from Core to Staff; finalize only after parity and rollback checkpoints.

**Pros:** matches production policy and service ownership; removes stale status snapshots.

**Cons:** requires outbox/event contract plus deployment choreography.

## Option B — Synchronous Core-to-Staff status update

On block/activate, Core directly calls Staff in the same request.

**Pros:** simpler initial implementation.

**Cons:** distributed transaction failure; access may succeed while Staff update fails; needs durable retry anyway.

## Option C — Temporarily restore embedded Staff

Relax production policy and defer service separation.

**Pros:** avoids cutover now.

**Cons:** reverses current architecture, expands production modes and delays the same migration; high regression surface.

## Draft delivery sequence

1. Make Staff process smoke diagnostic and green.
2. Write backup/migrate/validate/start/finalize/rollback runbook.
3. Rehearse on a production copy and compare all staff entities plus foreign keys.
4. Add versioned identity-status event/outbox delivery and idempotent Staff application.
5. Define dismissal rule; add `dismissedOn` UI and explicit access/future-shift behavior.
6. Run Telegram onboarding/login/block and employee-profile/HR E2E.
7. Finalize only after a defined observation window.

## Draft gates

- Staff smoke is green with actionable failure output.
- Entity counts, key samples and FK checks match after migration.
- Blocked Core identity is reflected in Staff and old cookie receives 401.
- Finalization has a passed precheck and a tested pre-finalize rollback.
