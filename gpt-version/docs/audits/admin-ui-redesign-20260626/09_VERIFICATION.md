# Verification

## Automated

- `npm run check` — pass.
- `npm run test` — pass.
- `npm run build` — pass.
- `npm audit --omit=dev` — pass, 0 vulnerabilities.

## HTTP/API smoke

Локальный сервер: `http://127.0.0.1:5177`.

Проверено:

- `/` — 200, HTML содержит Dvorik.
- `POST /api/auth/demo` — 201, cookie session создана.
- `GET /api/session` — 200.
- `GET /api/summary` — 200.
- `GET /api/products?status=all&limit=100` — 200.
- `GET /api/locations` — 200.
- `GET /api/balances` — 200.
- `GET /api/stock/operations` — 200.
- `GET /api/imports` — 200.
- `GET /api/merges` — 200.
- `GET /api/schedule` — 200.
- `GET /api/schedule/swaps` — 200.
- `GET /api/users` — 200.
- `GET /api/audit` — 200.
- `GET /api/backups` — 200.
- `GET /api/labels/jobs` — 200.

## Browser smoke

Не выполнен через Playwright CLI из-за закрытой сети к `registry.npmjs.org`.
