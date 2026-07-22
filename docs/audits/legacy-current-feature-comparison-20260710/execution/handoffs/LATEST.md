# Последний handoff

Дата: 2026-07-15.

## Цель

Довести `gpt-version` до Definition of Done из `../../94_FULL_COMPLETION_PLAN.md`, не теряя зависимости и evidence.

## Где продолжить

`EPIC-P7` complete locally. External cutover is the only remaining action and
requires a supplied host and secret store; use `gpt-version/docs/RELEASE_RUNBOOK.md`.

## Что уже известно

- `DOC-001` закрыт evidence: `../evidence/DOC-001.md`.
- `DOC-002` closed evidence: `../evidence/DOC-002.md`. Заказчик подтвердил personal-project scope; перед любым production release потребуется новый approval SLO/RPO/RTO/window.
- `DOC-003` closed evidence: `../evidence/DOC-003.md`; матрица содержит 153 P0/P1 IDs, owner roles и gates.
- `SEC-001` closed evidence: `../evidence/SEC-001.md`; shared fail-fast config rejects missing/unsafe production configuration before state/listen/workers.
- `SEC-000` closed evidence: `../evidence/SEC-000.md`; demo/dev routes only with explicit flag + loopback, absent from OpenAPI/UI when disabled.
- `FIX-501` closed evidence: `../evidence/FIX-501.md`; JSON/CSV/PDF/UI используют `MovementReportRow`, real-row и empty-state regression прошли.
- `FIX-502` closed evidence: `../evidence/FIX-502.md`; seller API возвращает только own shifts, seller swap DTO скрывает foreign shift ID, UI fallback удалён.
- `FIX-503` closed evidence: `../evidence/FIX-503.md`; shared 5 МиБ limit, endpoint parser, route `413`, picker/copy и exact/+1 smoke проверены.
- `FIX-504` closed evidence: `../evidence/FIX-504.md`; mandatory sharp processor, startup capability, EXIF/resize/bytes/failure fixture.
- `DB-101..103` reopened 2026-07-12 after negative revalidation: raw cause leak, incomplete-schema
  false readiness, overprecision `1.000001` accepted by migration/triggers.
- `DB-101` remediated/reaccepted: raw cause removed; exact leak-probe and full gate pass.
- `DB-102` remediated/reaccepted: versions + required runtime tables + writable probe;
  incomplete-schema negative, fresh-runtime smoke and full gates pass.
- `DB-103` remediated/reaccepted: overprecision migration/trigger negatives and full gates pass.
- `DB-104` accepted: sync UoW/context, atomic four-boundary rollback, nested/manual commit/savepoint/
  async/escape guards; independent adversarial review and full gates pass.
- `DB-105` accepted: reviewed repository contracts, fake service, explicit revision/hash/lease/page/role
  semantics; no raw DB in service context; full gates pass.
- `DB-106` mapper code covers all 27 current normalized domain tables and focused tests pass, but
  completion is blocked: v3 lacks workflow revisions/outbox lease fields/notifications. `MIG-402` selected.
- `MIG-402` accepted: v4 runtime schema, fresh/upgrade parity, converter and negative constraints.
- `DB-106` accepted: 30 application table mappers, actual-schema/corrupt-row/full gates.
- `TX-201` accepted: trusted actor resolver, request/correlation/channel/idempotency/clock context,
  one UoW for audit/outbox, arbitrary-header/cross-channel/UTC/async/escape negatives; full gate pass.
- `TX-202` accepted: canonical JSON hash, SQLite atomic claim/replay/conflict, exact status/response,
  timeout/NULL-deadline recovery, stale-claim guard, fault rollback and overlapping-writer tests; full gate pass.
- `TX-203` accepted: BEGIN IMMEDIATE stock service, real repository slice, exact CAS, aggregate
  threshold/zero events, all-boundary rollback, overflow distinction and independent-writer gates.
- TX-203 runtime endpoint remains intentionally legacy until DB-108/109; otherwise global
  `AppState.saveState()` can overwrite normalized service writes.
- `TX-204` accepted: all-row inventory validation, signed discrepancy facts, correct reversal shapes,
  shared events, all-boundary rollback and concurrent inventory/reversal gates; full gate pass.
- TX-204 endpoints also remain legacy until DB-108/109 for the same projection-overwrite reason.
- `TX-206` accepted: transactional day/shift/assignment/swap services, captured preview revision,
  stale/legacy expiry, provenance-preserving assignment diff, fault and real concurrency gates.
- TX-206 runtime routes remain intentionally legacy until DB-108/109 for the same projection-overwrite risk.
- `SEC-002` accepted: HMAC-only opaque sessions, exact production cookie/clear flags, SQLite identity recheck,
  cross-process rotation/revoke, legacy purge, browser and fault gates.
- Fail-closed pre-mutation revoke closes the current security boundary; full user/role/outbox atomicity remains TX-207.
- `TX-207` accepted: SQLite atomic user/role/onboarding/session revoke/audit/outbox;
  webhook callback uses SQLite only, callback replay/two-process/app_state regression pass.
- `EPIC-P1` accepted: deferred imports/merge/archive sweep/tablet buffer/rotation/
  future replacement/external URL/report Telegram/daily digest physically disabled
  in UI/API/jobs; OpenAPI and production two-process negative smoke pass.
- `DB-107` accepted: dashboard/catalog/search/stock/inventory/reports/schedule/
  audit production reads идут через SQLite adapter; Unicode search, stable
  pagination, corrupt-row, permissions/visibility, CSV/PDF и two-process
  SQL-visibility gates pass (`../evidence/DB-107.md`).
- `DB-108` accepted: full-state normalized projection выполняется только при
  bootstrap пустой SQLite; stock/inventory/reverse/schedule/product/media/
  preferences production writes используют SQLite path; two-process unchanged
  AppState gate pass (`../evidence/DB-108.md`).
- `DB-109` accepted: production entrypoint/active workers no longer static
  import AppState; SQLite outbox lease/retry/recovery and two-process webhook
  gates pass (`../evidence/DB-109.md`). `EPIC-P2` accepted.
- `EPIC-P3` accepted: catalog, transactional enqueue, leases, classified
  Telegram transport, supervised worker and race/restart/backlog gate pass
  (`../evidence/EPIC-P3.md`).
- `EPIC-P4` accepted: route policy, security headers, origin/body/rate limits,
  structured logs, readiness and metrics gate pass (`../evidence/EPIC-P4.md`).
- `EPIC-P5` accepted: checksummed migrations, bundle backup, preflight restore,
  two rehearsals and rollback pass (`../evidence/EPIC-P5.md`).
- `EPIC-P6` accepted: core/resilience/security/release suites, browser catalog
  and PDF smoke, and fresh built-artifact production smoke pass
  (`../evidence/EPIC-P6.md`).
- `EPIC-P7` accepted locally: fresh production startup migrates before listen,
  `/ready`/`/live` are green, shutdown exits 0, dry-run is non-mutating and the
  staged runbook has backup/rollback thresholds (`../evidence/EPIC-P7.md`).
- Функциональные контуры последних итераций присутствуют, но runtime persistence остаётся transitional.
- Главный P0 — global `AppState`/full-state projection и отсутствие repository/UoW source of truth.
- Новый execution-комплект создан; task/evidence-карточки следует создавать по мере выбора ID.

## Не делать

- не начинать production cutover;
- не считать старую документацию или прошлый зелёный build доказательством текущего ID;
- не чистить и не перезаписывать несвязанный dirty worktree;
- не выполнять production cutover до зелёных `EPIC-P1–P6`, rehearsal и rollback evidence.

## Команды восстановления контекста

```sh
git status --short
git diff --stat
sed -n '1,260p' docs/audits/legacy-current-feature-comparison-20260710/execution/tasks/TX-206.md
```

Latest full gate is green through EPIC-P7: `npm run verify:release` includes
full tests, build and a fresh built production-artifact smoke on 2026-07-15.

После завершения ID записать изменённые файлы, команды/результаты, риски и новый `Next` сюда и в `../04_PROGRESS.md`.
