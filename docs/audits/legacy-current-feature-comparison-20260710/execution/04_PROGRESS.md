# Прогресс исполнения

Дата: 2026-07-15. Этот файл — навигатор, а не доказательство завершения.

## Next

`EPIC-P7` completed — staged release package is accepted locally. External
cutover requires a supplied production target and secret store; it is not claimed.

Режим: ускоренный production scope по `06_PRODUCTION_ACCELERATION_PLAN.md`;
полный post-launch DoD сохраняется в `05_AUTONOMOUS_COMPLETION_PLAN.md`.
Красные технические проверки исправляются без паузы на ручное согласование.

## Статус блоков

| Блок | Статус | Примечание |
| --- | --- | --- |
| Функциональный фундамент | implemented/transitional | Перечень в `02_CURRENT_STATE.md`; hardening впереди |
| `DOC-001` | done | Evidence: `evidence/DOC-001.md`; карта приведена к коду, P0 cutover blocker подтверждён |
| `DOC-002` | done | Evidence: `evidence/DOC-002.md`; заказчик подтвердил personal-project scope, production release requirements deferred |
| `DOC-003` | done | Evidence: `evidence/DOC-003.md`; 153 P0/P1 IDs покрыты owner role и обязательными gates |
| `SEC-001` | done | Evidence: `evidence/SEC-001.md`; shared fail-fast config до state/listen/worker runtime |
| `SEC-000` | done | Evidence: `evidence/SEC-000.md`; dev/demo routes explicit flag + loopback, negative HTTP contract |
| `SEC-002` | done | Evidence: `evidence/SEC-002.md`; hash/cookie/cross-process/browser/full gates pass |
| `FIX-501` | done | Evidence: `evidence/FIX-501.md`; canonical movement DTO и UI regression закрыты |
| `FIX-502` | done | Evidence: `evidence/FIX-502.md`; server privacy, UI empty state и admin view проверены |
| `FIX-503` | done | Evidence: `evidence/FIX-503.md`; exact/+1/parser/UI boundary проверены |
| `FIX-504` | done | Evidence: `evidence/FIX-504.md`; required sharp, startup smoke, real dimensions/bytes/error fixture |
| `FIX-505..508` | pending verification/fix | Имеют более поздние зависимости |
| `DB-101` | done | Reaccepted: raw cause удалён; leak-probe, focused test, `check/test/build` pass |
| `DB-102` | done | Reaccepted: versions + required runtime tables + writable probe; negative/smoke/full gates pass |
| `DB-103` | done | Reaccepted: `1.000001` rejected by migration/trigger; focused/full gates pass |
| `DB-104` | done | Evidence: `evidence/DB-104.md`; sync UoW, nested/manual commit/async/escape/fault tests pass |
| `DB-105` | done | Evidence: `evidence/DB-105.md`; reviewed domain contracts + fake/stale/hash/lease/page negatives |
| `DB-106` | done | Evidence: `evidence/DB-106.md`; all 30 application tables, actual v4 schema and corrupt-row negatives |
| `MIG-402` | done | Evidence: `evidence/MIG-402.md`; runtime v4, fresh/upgrade parity, converter negatives |
| `TX-201` | done | Evidence: `evidence/TX-201.md`; trusted actor resolver, shared correlation/UoW/clock gates pass |
| `TX-202` | done | Evidence: `evidence/TX-202.md`; atomic replay/conflict/recovery/concurrency gates pass |
| `TX-203` | done | Evidence: `evidence/TX-203.md`; immediate/CAS/events/fault/concurrency gates pass |
| `TX-204` | done | Evidence: `evidence/TX-204.md`; batch/reversal/fault/concurrency gates pass |
| `TX-206` | done | Evidence: `evidence/TX-206.md`; stale expiry/provenance/fault/concurrency/full gates pass |
| `TX-207` | done | Evidence: `evidence/TX-207.md`; SQLite UoW/callback replay/two-process gate pass |
| `EPIC-P1` | done | Evidence: `evidence/EPIC-P1.md`; deferred UI/API/jobs disabled, production smoke pass |
| `DB-107` | done | Evidence: `evidence/DB-107.md`; production SQL reads/two-process visibility pass |
| `DB-108` | done | Evidence: `evidence/DB-108.md`; projection removed from ordinary save, command paths pass |
| `DB-109` | done | Evidence: `evidence/DB-109.md`; production AppState runtime removed |
| `EPIC-P2` | done | Evidence: `evidence/EPIC-P2.md`; unified SQLite runtime accepted |
| `EPIC-P3` | done | Evidence: `evidence/EPIC-P3.md`; production outbox and Telegram worker accepted |
| `EPIC-P4` | done | Evidence: `evidence/EPIC-P4.md`; security and operations baseline accepted |
| `EPIC-P5` | done | Evidence: `evidence/EPIC-P5.md`; migration, backup and rollback accepted |
| `EPIC-P6` | done | Evidence: `evidence/EPIC-P6.md`; release matrix and built artifact smoke accepted |
| `EPIC-P7` | done | Evidence: `evidence/EPIC-P7.md`; staged runbook and rollback thresholds accepted locally |
| Остальные блоки | pending | Следовать зависимостям плана |

## Правило смены Next

Менять `Next` только когда для текущего ID создан `evidence/<ID>.md`, пройдены обязательные проверки и нет открытого stop gate. Если ID заблокирован — оставить его в blockers и выбрать только независимую задачу, разрешённую зависимостями.

## Blockers

- External production cutover is outside this workspace until a host and secret store are supplied; the local staged package is complete.
- Linux release потребует clean native install/smoke; текущая personal target darwin/arm64 проверена.
- Полный git status содержит внешние/неотслеживаемые изменения; работать только в целевом контуре и не очищать их.

## Последнее evidence

`evidence/EPIC-P7.md` — accepted locally; external cutover is not asserted.
