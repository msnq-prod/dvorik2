# EPIC-P3 evidence

Дата: 2026-07-15.

## Covered IDs

`OUT-301..307`, required `NTF-701`, `BOT-701`, `BOT-704`, `TST-1307`.

## Result

- Versioned Telegram event catalog renders stock/swap/identity events and
  terminally rejects unknown/schema-invalid events.
- SQLite outbox claim is atomic; expired leases recover; retry backoff,
  retry-after and max-attempt terminal failure are persisted.
- Telegram worker classifies timeout/network/429/400/5xx, runs supervised with
  signal-graceful stop, and does not claim deferred types.

## Gate

- `npm run check` — pass.
- stock, schedule, identity transactional enqueue tests — pass.
- SQLite two-worker race/crash-recovery/retry tests — pass.
- Telegram 429/400/5xx, backlog drain, catalog tests — pass.
- two-process HTTP and `npm run build` — pass.
