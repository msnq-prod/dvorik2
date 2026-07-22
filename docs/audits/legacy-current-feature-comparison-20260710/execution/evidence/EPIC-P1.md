# EPIC-P1 evidence

Дата: 2026-07-15.

## Состав

- `TX-207` — `evidence/TX-207.md`.
- Deferred launch gate: UI, API и jobs до post-launch physically unavailable.

## Deferred gate

- UI: imports/merge removed from navigation and render map; tablet buffer,
  rotation/future replacement, external URL photo and Telegram report controls
  cannot render.
- API: imports, merge, archive sweep, tablet buffer, rotation, future
  replacement, external media URL and Telegram report delivery return
  `404 FEATURE_DISABLED`; they are absent from OpenAPI.
- Workers: daily digest returns `FEATURE_DISABLED`; production Telegram worker
  refuses deferred calendar/digest/report messages; Telegram webhook production
  path accepts only onboarding and `/start`.

## Gate

`npm run check`; `launch-scope.test.ts`; `identity-service.test.ts`;
`domain.test.ts`; two-process production `session-http.test.ts`; `npm run build`
— pass.

## Next

`DB-107` / EPIC-P2: cut over production stock/inventory/schedule/products/reports
routes to repositories and remove AppState write path.
