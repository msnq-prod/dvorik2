# A01 — проблемы полноты анализа

P0 не выявлены: итерация проверяла качество анализа, а не безопасность/целостность runtime.

### P1-A01-01: Неверно выбран актуальный продукт

- **Promise:** анализ разделяет `current`, `target`, `legacy` и охватывает весь frozen scope.
- **Reality:** `gpt-version` документирован как единственный current-продукт (`gpt-version/docs/PROJECT_STATE.md:19-23`), но отсутствует среди трёх sources. В `current` попал один фрагмент root loyalty API.
- **Evidence:** `00_PROJECT.json:35-52`; `records/sources/src_current_routes.json`; `90_PROCESS_INDEX.md:5-8`; `gpt-version/docs/PROJECT_STATE.md:19-36`.
- **Effect:** обучение описывает не фактическое приложение; ключевые UI и backend-процессы current-продукта отсутствуют.
- **Cause:** не прочитан/не применён source-of-truth о границе продукта до Inventory Gate.
- **Status:** confirmed.

### P1-A01-02: Inventory Gate закрыт при массовых пропусках

- **Promise:** zero-delta pass не нашёл дополнительных source/surface/process candidate (`00_PROJECT.json:14-31`).
- **Reality:** зафиксированы 3 sources и 4 surfaces (`94_COVERAGE_REPORT.md:12-26`), хотя в scope есть 71 current endpoints, 9 current UI-областей, 30 current DB tables, Telegram/outbox; 48 root endpoints и 8 страниц; 12 legacy routers и 116 handlers; target catalog с 10+ семействами.
- **Evidence:** `gpt-version/src/client/src/main.tsx:61-93`; `gpt-version/src/server/index.ts:545-1464`; `gpt-version/src/server/migrations/002_normalized_schema.sql:11-333`; `client/src/App.tsx:10-31`; `server/routes.ts:30-840`; `recovered-dvorik/app/routers.py:6-22`; `recovered-dvorik/app/main.py:45-95`.
- **Effect:** почти все бизнес-процессы не попали ни в анализ, ни в последующие материалы.
- **Cause:** inventory строился по трём заранее выбранным файлам вместо перечисления всех surface classes по каждому корню.
- **Status:** confirmed.

### P1-A01-03: Evidence не доказывает часть утверждений

- **Promise:** каждый поведенческий факт связан с точным первоисточником.
- **Reality:** один evidence range `requirements.md:35-74` использован для label-фактов из строк 76-87, auth/audit-фактов из строк 21-32 и NFR из строк 97-108. `Idempotency-Key` и background PDF объявлены target-требованиями без такого текста в source.
- **Evidence:** `cards/processes/proc_target_stock_receipt.md:39-44`, `102-107`, `137-149`; `cards/processes/proc_target_label_print.md:15-149`; исходник `docs/crm/requirements.md:21-32`, `35-87`, `97-108`.
- **Effect:** downstream-материалы смешивают подтверждённые требования, реализацию другой версии и предположения.
- **Cause:** evidence привязано крупным диапазоном к process, а не точным наблюдением к claim; reviewer не перечитал locator.
- **Status:** confirmed.

### P1-A01-04: `unknown` ошибочно считается `covered`

- **Promise:** coverage отражает исследованные измерения и показывает actionable gaps.
- **Reality:** роли, permissions, user steps, states, retry, integrations и другие измерения одновременно имеют `Status: covered` и claim `[unknown]`; итоговый report говорит `Actionable issues: None`.
- **Evidence:** `cards/processes/proc_current_user_api.md:18-142`; `cards/processes/proc_legacy_supply_import.md:18-149`; `94_COVERAGE_REPORT.md:28-39`.
- **Effect:** незавершённые карточки проходят в handoff и визуализацию как готовые.
- **Cause:** gate проверяет наличие dimension/claim, но не требует подтверждённого содержания либо честного incomplete-статуса.
- **Status:** confirmed.

### P1-A01-05: Доступные локальные источники помечены внешне недоступными

- **Promise:** `externally_blocked` используется для недоступных внешних систем.
- **Reality:** gaps требуют handlers, DB и notifications, но все они находятся в scope. У gap при этом `unavailable_source_ids: []`.
- **Evidence:** `records/gaps/gap_legacy_supply_import_scope.json:5-17`; `recovered-dvorik/app/handlers/supply.py:47-258`; `recovered-dvorik/app/db.py:52-565`; `recovered-dvorik/app/services/notify.py:102-216`. То же для current: `records/gaps/gap_current_user_api_scope.json:5-17`, при доступных `gpt-version/src/server/*`.
- **Effect:** агент легализовал остановку исследования как внешний blocker.
- **Cause:** gap-status не проверяет наличие closure sources внутри frozen scope.
- **Status:** confirmed.

### P1-A01-06: Отсутствуют обязательные связи ролей, данных, jobs и интеграций

- **Promise:** итог пригоден для объяснения работы пользователя, backend, Telegram и БД.
- **Reality:** handoff имеет пустые `role_map`, `data_map`, `integration_map`; coverage имеет `links: 0`; во всех карточках отсутствуют role/data/integration/job/notification IDs.
- **Evidence:** `98_HANDOFF.json:2-31`; `94_COVERAGE_REPORT.md:18`; `cards/processes/proc_target_stock_receipt.md:151-162`.
- **Effect:** невозможно построить достоверные схемы «кто делает», «что сохраняется», «что происходит в backend» и «куда уходит уведомление».
- **Cause:** типы evidence graph объявлены, но inventory не создаёт канонические records/links для этих классов.
- **Status:** confirmed.

### P2-A01-07: Snapshot не фиксирует значительную часть исследуемого проекта

- **Promise:** версия системы зафиксирована commit/fingerprint и может быть проверена на staleness.
- **Reality:** `00_PROJECT.json` сохраняет git commit при `git_dirty: true` (`00_PROJECT.json:54-57`), а `gpt-version`, `recovered-dvorik`, `docs/crm` и сам analysis — untracked по `git status`. Индивидуальные fingerprint существуют только у трёх выбранных sources.
- **Evidence:** `00_PROJECT.json:54-57`; вывод `git status --short`; `records/sources/*.json`.
- **Effect:** изменения большинства фактических источников не могут пометить связанные процессы stale, поскольку связей и fingerprints нет.
- **Cause:** snapshot опирается на commit, который не содержит основные roots, и не строит manifest всех in-scope файлов.
- **Status:** confirmed.

