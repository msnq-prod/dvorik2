# EPIC-P6 evidence

Дата: 2026-07-15.

## Covered IDs

`TST-1301..1314`.

## Result

- `core`: domain, repositories, migrations, catalog and API contracts pass.
- `resilience`: two-process HTTP, idempotency/concurrency, outbox lease/retry,
  worker restart and migration/rollback rehearsals pass.
- `security`: session/permission/origin/body/rate-limit/deferred-route negatives
  pass; production dev routes are 404.
- `release`: browser catalog/report smoke, CSV/PDF export, A4 PDF render and
  built production artifact smoke pass.

## Gate

`npm run verify:release` passes: `check`, full `test`, `build`, and a fresh
production-configured `dist` process with `/ready`, `/live`, built UI,
migrations, disabled dev route and graceful SIGTERM exit 0.

Browser console contained only the expected initial unauthenticated
`GET /api/session` 401 before demo-session selection; no unexpected warning.
