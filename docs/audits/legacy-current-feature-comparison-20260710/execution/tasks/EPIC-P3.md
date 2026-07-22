# EPIC-P3 — Production outbox and Telegram worker

## Статус

- `done`; P0; dependencies `EPIC-P2`, `TX-201`, `TX-207`.

## Цель

Close `OUT-301..307`, required `NTF-701`, `BOT-701/704` and `TST-1307` as one
SQLite outbox vertical slice.

## Evidence criteria

- catalog/versioned payload and transactional enqueue are enforced;
- leases are atomic, recover after crash, retry with classified Telegram errors
  and become terminal at max attempts;
- worker loop is supervised and graceful shutdown does not abandon ownership;
- race, 429/400/5xx, restart and backlog drain tests pass;
- deferred worker types remain physically unclaimable.

## Текущий checkpoint

- SQLite dispatcher has transactional claim/lease/recovery/retry/max-attempt
  primitives from `DB-109`.
- Telegram delivery now classifies timeout/network/429/400/5xx, preserves
  retry-after, and runs in a signal-stoppable supervised loop.
- Versioned Telegram event catalog renders stock/swap/identity events before
  transport and terminally rejects unknown or incompatible payloads.
- Integration gate covers 429, permanent 400, transient 5xx, restart recovery
  and graceful backlog drain.
- Accepted: event catalog, transactional producers, atomic lease/recovery,
  classified transport, supervised loop and required gate are complete.
