# Итерация 00 — Baseline и production guards

## IDs
`DOC-001`, `DOC-002`, `DOC-003`, `SEC-000`, `SEC-001`.

`SEC-002` переносится в итерацию 03: cookie flags можно исследовать здесь, но
session hash/rotation должны опираться на repository/UoW.

## Вход
- Код и `94_FULL_COMPLETION_PLAN.md` доступны.
- Dirty worktree зафиксирован, несвязанные изменения не трогаются.

## Ведущий агент
- сверяет routes/scripts/schema с docs;
- утверждает topology и список открытых owner/SLO/RPO/RTO решений;
- определяет единый production config contract;
- интегрирует route registration и startup guards.

## Субагенты
1. Read-only current-truth audit docs/routes/scripts.
2. Security audit dev/demo endpoints и cookie baseline.
3. Test-gap анализ production config/dev route contract.

## Порядок
1. DOC-001 → current truth.
2. DOC-002 → решения/blockers владельца.
3. DOC-003 → requirements/evidence matrix.
4. SEC-001 → config validator/fail-fast.
5. SEC-000 → dev/demo route guard.

## Exit gate
- docs соответствуют коду;
- production не стартует с dev secrets/fallback;
- demo/dev routes недоступны production contract test;
- evidence каждого ID и новый handoff.
