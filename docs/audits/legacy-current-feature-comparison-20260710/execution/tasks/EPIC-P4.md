# EPIC-P4 — Security and operations baseline

## Статус

- `done`; P0; dependencies `EPIC-P3`, `SEC-001`, `SEC-002`.

## Цель

Close route policy, CSRF/origin/headers, bounded request validation, structured
logging, readiness and minimal metrics for production runtime.

## Evidence criteria

- direct-route permission and malformed/oversized request negatives pass;
- live/ready distinguish DB/schema/media/worker failures;
- controlled errors, correlation and worker health are observable;
- shutdown remains graceful.

## Текущий checkpoint

- Production replies have CSP/HSTS/anti-framing/nosniff/referrer/permissions
  headers; `x-powered-by` is disabled.
- Every HTTP response receives validated/generated correlation ID; production
  writes structured method/path/status/duration records without request data.
- `/live` and Prometheus-text `/metrics` are available; focused observability,
  two-process HTTP and build checks pass.
- Production rejects cross-site mutating API requests by `Origin` and
  `Sec-Fetch-Site`; signed Telegram mutation endpoints are explicitly scoped
  exceptions.
- Production two-process HTTP regression proves cross-origin stock mutation
  returns `ORIGIN_FORBIDDEN` before command execution.
- Mutating production API requires JSON body when present and is bounded to
  120 requests/minute per client; `415` contract is covered by HTTP regression.
- `/ready` verifies exact migrations, SQLite write capability and stale worker
  leases; production HTTP regression covers ready response and security headers.
- Unexpected 500s now return correlation ID and log only bounded structured
  error metadata, without raw stack/object output.
- Malformed JSON returns a controlled `400`; mutation payloads reject unsafe
  prototype keys and excessive depth/array/object sizes before handlers.
- Accepted: security/operations baseline and EPIC gate are green.
