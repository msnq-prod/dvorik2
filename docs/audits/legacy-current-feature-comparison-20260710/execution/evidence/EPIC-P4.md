# EPIC-P4 evidence

Дата: 2026-07-15.

## Covered IDs

`SEC-303..307`, `OBS-301..304` and required operational part of `TST-1310`.

## Result

- Declarative dangerous-route policy, permission boundary, CSP/HSTS and
  anti-framing headers are active.
- Mutations reject cross-origin/non-JSON/malformed/unsafe payloads and are
  rate-limited; signed Telegram endpoints are explicit exceptions.
- Correlation IDs, structured logs, controlled 500s, live/ready/metrics are
  available. Ready checks exact migrations, write probe and stale outbox lease.

## Gate

- `npm run check` — pass.
- route-policy and observability tests — pass.
- production two-process HTTP: headers, ready, direct seller denial, malformed
  body, non-JSON body and cross-origin mutation negatives — pass.
- `npm run build` — pass.
