# Автономный план окончательного завершения

Дата: 2026-07-12. Источники истины: `94_FULL_COMPLETION_PLAN.md`,
`TASK_REGISTRY.md`, iteration packets и evidence.

## Режим

- Ведущий агент работает непрерывно до Definition of Done всего реестра.
- Ручные approval/stop-паузы не требуются. Красная проверка создаёт следующий
  fix-step и устраняется в текущей итерации.
- Технические gates не отменяются: transaction, migration, security,
  concurrency, browser, backup/restore и rollback должны быть фактически доказаны.
- До трёх субагентов одновременно: discovery/review, bounded implementation,
  focused tests. Shared contracts, migrations, UoW, integration и финальное
  принятие остаются у ведущего агента.
- Production cutover допускается автономно только после зелёного release gate,
  двух rehearsal, проверенного restore/rollback и доступности production target.
  При отсутствии внешнего target работа завершается статусом `release-ready`,
  а не ложным `done` для cutover-ID.

## Цикл каждого ID

1. Перечитать карточку, зависимости, затронутый код и последний evidence.
2. Провести read-only discovery и зафиксировать contract checkpoint.
3. Назначить непересекающиеся bounded задачи субагентам.
4. Реализовать минимальный полный vertical slice без compatibility dual-write.
5. Пройти focused negative/fault/concurrency tests.
6. Пройти затронутые integration/browser проверки и полный `check/test/build`.
7. Провести независимый review утверждений и diff.
8. Создать `evidence/<ID>.md`; обновить карточку, `TASK_REGISTRY.md`,
   `04_PROGRESS.md` и `handoffs/LATEST.md`.
9. Только после этого поставить `done` и перейти к следующему dependency-ready ID.

## Фаза A — закрыть текущую транзакционную итерацию

1. Завершить `TX-207`: identity/onboarding SQLite UoW, AppState overwrite guard,
   callback replay, cross-process/fault tests, HTTP/worker visibility, review и full gate.
2. Закрыть `TX-205`, `FIX-505`, `FIX-508`.
3. Повторно проверить exit gate итерации 03: business write + audit + outbox +
   idempotency атомарны; stale/fault/concurrency не дают partial commit.

## Фаза B — outbox, security, observability

Порядок: `OUT-301–309` → `SEC-303–307` → `OBS-301–304` → `FIX-507` →
`TST-1307`, `TST-1309`.

Результат: единый event catalog, inbox/outbox split, lease/reaper, retry/DLQ,
supervised worker, transport contract, permissions, structured logs, health,
metrics и failure evidence.

## Фаза C — единый SQLite source of truth и миграция данных

1. `TX-208`, `TX-209`, затем `DB-107–109` и `FIX-506`.
2. `MIG-401`, `MIG-403–406`, `BKR-401`.
3. `IMP-801–809` с реальными fixtures, commit/undo и supplier/SKU invariants.
4. Удалить runtime `AppState`/`stateTransaction` после semantic parity.

Результат: API, workers и scheduler читают одну БД; `rg` не находит
application runtime global state; converter повторяем и неразрушителен.

## Фаза D — продуктовые контуры Web/Telegram

Параллельные независимые линии после фиксации общих contracts:

- `SRCH-1001–1005`;
- `SCH-601–611`;
- `BOT-701–706`, `NTF-701–703`;
- `TST-1306`.

Результат: одинаковые IDs/ranking/visibility/date semantics в Web и Telegram,
безопасные callbacks, VLAT edges, seller privacy, preferences и digest watermark.

## Фаза E — reports, archive, merge, media

Порядок: shared DTO/schema → `RPT-901–906` → `ARC-901–904` →
`MRG-1001–1007` → `MED-1101–1107` + `SEC-308` → focused `TST-1310–1312`.

Результат: JSON/CSV/PDF/UI parity; полный archive/merge lifecycle; object storage,
variants, deletion и SSRF protection; бинарные artifacts не хранятся base64 в БД.

## Фаза F — tablet, UI, accessibility, browser E2E

Порядок: `TAB-1201–1206` → `UI-1201–1205` → `TST-1308` и остаток
`TST-1312`.

Результат: buffer resume/idempotency, role isolation, 320–1440 px, Telegram
WebView, keyboard, axe, refresh/back/deep-link и visual evidence.

## Фаза G — release, rehearsal, rollback

1. `BKR-402–404`, `MIG-407`.
2. `TST-1301–1305`, `TST-1309–1314`.
3. Две production-like migration rehearsal и независимый semantic/invariant review.
4. `REL-1401–1408`, `RBK-1401–1403`.
5. Автономный go/no-go по измеримым thresholds; при зелёном результате —
   staged cutover, hypercare, post-cutover backup и legacy read-only closure.

## Политика сходимости

- Не поддерживать два канонических write-path дольше одной текущей фазы.
- Любой найденный P0/P1 привязывать к существующему ID либо создавать
  evidence-linked fix subtask внутри владельца ID.
- Не переносить красные tests в следующую итерацию.
- Не объединять статусы нескольких ID; каждый получает собственное evidence.
- После compaction читать `00_INDEX.md`, этот файл, `04_PROGRESS.md`, текущую
  карточку и `handoffs/LATEST.md`, затем продолжать с первого незакрытого check.

## Окончательный Definition of Done

- В `TASK_REGISTRY.md` нет `pending`, `in_progress` или `blocked` для scope плана.
- Для каждого ID существует evidence с фактическими командами и результатами.
- Нет process-local canonical business state и неподтверждённых dual-write путей.
- Все P0/P1 security, transaction, migration, worker и product findings закрыты.
- Полные unit/integration/concurrency/failure/browser/visual/performance gates зелёные.
- Backup, restore, migration и rollback воспроизводимы в измеренном RPO/RTO.
- Release artifact, config, readiness, observability и runbooks согласованы с кодом.
- Production cutover либо доказан evidence, либо единственным остатком явно указан
  недоступный внешний production target; ложное завершение запрещено.

