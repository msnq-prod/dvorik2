# Verification

Дата актуализации: 2026-07-11. Этот файл фиксирует baseline; полное evidence
текущей программы находится в
`../../../../docs/audits/legacy-current-feature-comparison-20260710/execution/evidence/`.

## Проверено в DOC-001

| Проверка | Результат | Ограничение |
| --- | --- | --- |
| `npm run check` | pass | typecheck, не production proof |
| `npm test` | pass | server tests; запущены вне sandbox из-за IPC pipe `tsx` |
| Routes/workers/schema/docs trace | pass | подтверждены code references в `PROJECT_STATE.md` |
| Негативный сценарий multi-process write | confirmed risk | отдельные process-local `AppState` и full-state rewrite не дают безопасной совместной записи |

## Что покрывают существующие тесты

Domain constraints, SQLite migrations/FK, state conversion и media URL/storage.
Они не доказывают browser E2E, HTTP integration, production auth/cookie/RBAC,
Telegram webhook end-to-end, migration/restore rehearsal или production release.

## Residual risk

- Normalized tables пока projection; P0 cutover blocker сохраняется.
- Demo/dev и production config hardening ещё pending (`SEC-000`, `SEC-001`,
  `SEC-002`).
- Local media fallback в offline test допустим только как test behavior, не как
  production contract.

Production cutover: **запрещён**.
