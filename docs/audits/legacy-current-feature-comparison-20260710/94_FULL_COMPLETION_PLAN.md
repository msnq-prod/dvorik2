# Полный план доведения Dvorik до production-ready состояния

Дата: 2026-07-11  
Целевой продукт: `gpt-version`  
Исходный roadmap: `93_IMPLEMENTATION_PLAN.md`

## 1. Назначение документа

Этот документ продолжает исходный план и учитывает фактическое состояние кода после реализованных инкрементов. Он предназначен для последовательной работы ИИ-агента: каждый пункт достаточно мал, имеет зависимости, ожидаемое поведение, скрытые детали и проверяемый результат.

Главный оставшийся P0-разрыв: нормализованные таблицы уже создаются, но runtime продолжает работать через глобальный `AppState`. API и отдельные workers получают собственные копии состояния и способны перезаписать изменения друг друга. Production cutover запрещён до завершения блоков `SEC-00`, `DB-*`, `TX-*`, `OUT-*`, `MIG-*`.

## 2. Что уже реализовано и не должно переписываться без причины

- dashboard и основные current-страницы;
- базовые stock/inventory/reversal операции с audit и idempotency;
- schedule days, календарь, ротация preview/commit, будущая замена, swaps;
- Telegram webhook, inline-календарь, onboarding callbacks, swaps, outbox transport;
- import CSV/XLS/XLSX, autodetect заголовков, warnings/rejected rows, supplier SKU;
- отчёты, CSV/PDF, inventory discrepancies, Telegram document delivery;
- archive preview/commit;
- duplicate candidates, merge preview/commit/undo, частичный field resolution;
- media upload, compression fallback, URL validation, storage adapter;
- tablet work buffer и dense mode;
- схема SQLite v2, converter и базовые migration tests.

Эти функции считаются функциональным фундаментом, но часть из них должна быть переведена на нормализованные repositories и настоящие транзакции.

## 3. Общие правила для ИИ-агента

1. Выполнять один ID или один тесно связанный кластер за итерацию. Не смешивать migration, UI redesign и новую бизнес-функцию в одном изменении.
2. Перед изменением прочитать текущий route, service, persistence, UI и тесты. Наличие кнопки или таблицы не доказывает, что цепочка работает до конца.
3. Для каждого mutation проверять: permission, validation, transaction, idempotency, audit, outbox, ответ UI, retry/reload.
4. Preview не изменяет бизнес-данные. Commit обязан проверять версию или hash preview, потому что данные могли измениться после просмотра.
5. Одинаковый idempotency key с другим payload возвращает `409`, а не старый ответ.
6. Business write, audit, idempotency и outbox фиксируются одной DB-транзакцией.
7. Локальные даты расписания хранятся как `YYYY-MM-DD` в `Asia/Vladivostok`; абсолютные timestamps — UTC ISO. Нельзя преобразовывать local date через системную timezone.
8. Количества нормализуются одним converter; запрещены `NaN`, `Infinity`, отрицательные значения и скрытая потеря точности.
9. Ошибка не должна превращаться в false success. UI сохраняет введённые данные и показывает конкретную строку/объект, который не применился.
10. Telegram callbacks считаются повторяемыми и устаревающими: проверять actor, текущий статус, версию объекта и дедупликацию update.
11. Не использовать production JSON fallback, dev secrets, demo auth или silent local media fallback.
12. После каждого ID выполнить focused tests; после каждого блока — `check`, полный `test`, `build`, integration/E2E соответствующего контура.
13. Обновлять `PROJECT_STATE.md`, OpenAPI, runbook и progress одновременно с изменением фактического контракта.
14. Не отмечать задачу выполненной только по typecheck. Нужна проверка поведения и негативного пути.

## 3.1. Исполняемый комплект

Сам план остаётся полным справочником требований. Для повседневной работы агент
должен использовать комплект `execution/`:

- `execution/00_INDEX.md` — точка входа и обязательный порядок чтения;
- `execution/01_AGENT_RULES.md` — неизменяемые ограничения;
- `execution/02_CURRENT_STATE.md` — короткий фактический контекст;
- `execution/03_DECISIONS.md` — утверждённые решения и открытые вопросы;
- `execution/04_PROGRESS.md` — единственный оперативный status/Next/blockers;
- `execution/TASK_REGISTRY.md` — реестр всех ID;
- `execution/tasks/` — атомарные карточки;
- `execution/evidence/` — доказательства приёмки;
- `execution/handoffs/LATEST.md` — восстановление после нового чата;
- `execution/iterations/` — пакеты для большой модели-оркестратора.

Если содержимое краткого контекста расходится с кодом, код является фактом, а
агент обязан обновить `02_CURRENT_STATE.md` до реализации. Если краткий контекст
расходится с этим roadmap по целевому поведению, roadmap является целевым
контрактом до появления нового решения в `03_DECISIONS.md`.

## 3.2. Режим S — простая модель

Простая модель не получает весь roadmap в активный контекст. Ей передаются:

1. `01_AGENT_RULES.md`;
2. `02_CURRENT_STATE.md`;
3. `03_DECISIONS.md` только в части выбранного ID;
4. `04_PROGRESS.md`;
5. одна карточка `tasks/<ID>.md`;
6. только связанные source/test files.

За один запуск разрешён один ID. Модель сначала сверяет карточку с кодом, затем
реализует, проверяет, создаёт `evidence/<ID>.md`, обновляет progress и handoff.
Если готовой карточки нет, ведущий агент создаёт её из соответствующего раздела
этого документа по `tasks/TEMPLATE.md`; создавать карточку и писать production-код
одновременно простой модели не рекомендуется.

Контекст простой модели должен оставаться малым: не загружать все audit-файлы,
весь `domain.ts`, все UI-страницы и весь git diff без доказанной необходимости.
Большой файл читается точечными диапазонами вокруг найденных symbols/routes.

## 3.3. Режим L — большая модель с субагентами

Большая модель работает одной крупной итерацией из `execution/iterations/`, но не
отмечает её выполненной как единый неделимый пункт. Внутри сохраняются атомарные
ID и отдельное evidence.

Рекомендуемый цикл итерации:

1. **Preflight:** прочитать index/rules/state/decisions/progress/iteration packet,
   проверить git status, dependencies и входные gates.
2. **Параллельная разведка:** отдать субагентам независимые read-only трассировки,
   test-gap анализ или непересекающиеся UI/backend участки.
3. **Contract checkpoint:** ведущая модель утверждает source of truth, DTO,
   transaction boundary, migration и integration order до массовых edits.
4. **Implementation waves:** субагенты получают bounded задачи с file ownership;
   ведущая модель оставляет за собой shared types, migrations, application-service
   contracts, conflict resolution и общую интеграцию.
5. **Integration:** перечитать каждый diff, проверить claims субагентов и запустить
   focused tests до объединения следующей волны.
6. **Iteration gate:** полный test/build/E2E набор, evidence для каждого ID,
   обновление state/decisions/progress/handoff.

В окружении с четырьмя concurrency slots ведущая модель запускает не более трёх
субагентов одновременно. Запрещено выдавать двум агентам одни и те же файлы или
одну transaction boundary без явного порядка. Субагент не объявляет крупную
итерацию завершённой — это делает только ведущая модель после интеграционного
gate.

Хорошие задачи для субагента:

- read-only аудит одного контура;
- написание isolated fixtures/tests;
- UI-компонент после фиксации DTO;
- repository mapper после фиксации interface;
- документация/evidence;
- независимая проверка security/accessibility.

Не делегировать без контроля ведущей модели:

- выбор канонического source of truth;
- schema migrations и cutover semantics;
- shared DTO/permissions/idempotency contracts;
- transaction boundaries между несколькими services;
- финальное разрешение конфликтов и completion claim.

## 3.4. Обязательный формат задания субагенту

Каждое поручение содержит:

```text
Task ID и конкретный результат.
Предусловия и уже принятые решения.
Разрешённые файлы/каталоги.
Запрещённые файлы и действия.
Нужен read-only анализ или разрешены edits.
Ожидаемый контракт/output shape.
Негативные сценарии и focused tests.
Команды проверки.
Формат отчёта: изменённые файлы, результаты, риски, незакрытое.
```

Нельзя поручать «сделай этап целиком» или передавать только ссылку на этот план.
Субагент должен получить bounded результат, который можно независимо проверить.

## 3.5. Context checkpoint и восстановление

После каждого атомарного ID и перед возможной compaction обновляются:

- `04_PROGRESS.md`: done/in progress/next/blockers;
- `evidence/<ID>.md`: фактические tests и skipped checks;
- `03_DECISIONS.md`: только новые решения;
- `02_CURRENT_STATE.md`: только изменившаяся фактическая архитектура;
- `handoffs/LATEST.md`: последний стабильный checkpoint и точная следующая команда.

Новый агент не полагается на историю чата. Он восстанавливает работу только из
этих файлов, `git status`, текущего diff и кода. Completion claim из предыдущего
сообщения без evidence не считается фактом.

## 4. Definition of Done приложения

Приложение полностью доработано только если одновременно выполнено следующее:

- normalized SQLite — единственный runtime source of truth;
- API, Telegram worker и scheduler безопасно работают разными процессами с одной БД;
- нет global `AppState` и full-state rewrite в production path;
- все mutations транзакционны и защищены permission/idempotency/version checks;
- outbox поддерживает lease, retry limit, failed/DLQ, manual retry и наблюдаемость;
- production auth не содержит demo/dev bypass;
- migration и restore дважды отрепетированы на production-like копии;
- все P0/P1 требования связаны с автоматическим или ручным evidence;
- browser E2E проходят для super admin/admin/seller/pending/blocked;
- критичные сценарии проходят на desktop/tablet/mobile и с клавиатуры;
- cutover и rollback отрепетированы, RPO/RTO измерены;
- legacy технически read-only после открытия current writes.

---

# Этап 0. Зафиксировать baseline и защитить production path

## DOC-001. Обновить карту фактического состояния

**Сделать:** обновить `gpt-version/docs/PROJECT_STATE.md`, `08_PROGRESS.md`, `09_VERIFICATION.md`: отделить implemented от transitional и target. Удалить устаревшие заявления об отсутствии Telegram/календаря.

**Мелкие детали:** рядом с каждой функцией указать текущий source of truth; отдельно отметить, что normalized tables пока projection, а не runtime storage.

**Приёмка:** документация не противоречит routes, scripts и schema; дата и commit/release указаны.

## DOC-002. Зафиксировать topology и эксплуатационные решения

**Сделать:** описать один API, supervised outbox worker, daily scheduler, SQLite на persistent volume, object storage и backup storage. Утвердить SLO, RPO, RTO, maintenance window и ответственных.

**Как работает:** API обслуживает HTTP/webhook, worker только арендует и отправляет outbox, scheduler только создаёт digest/archive jobs. Ни один процесс не держит каноническую копию всей БД в памяти.

**Приёмка:** есть утверждённая topology diagram, owners, no-go criteria и числа RPO/RTO.

## DOC-003. Создать матрицу требований и evidence

**Сделать:** каждому пункту `93_IMPLEMENTATION_PLAN.md` назначить ID, статус, owner, automated test, manual test и ссылку на evidence.

**Мелкие детали:** отдельные строки для ролей, reload, duplicate click, stale preview, worker restart, timezone boundary и rollback.

**Приёмка:** 100% P0/P1 требований имеют проверку; «проверено вручную» содержит дату, среду и результат.

## SEC-000. Закрыть dev/demo endpoints

**Сделать:** регистрировать `/api/auth/demo`, `/api/dev/config`, `/api/dev/telegram/init-data` только при явном `DVORIK_DEV_TOOLS=1`; в production route должен отсутствовать или возвращать `404`.

**Мелкие детали:** `NODE_ENV != production` недостаточно; staging тоже может быть публичным. Dev route дополнительно ограничить loopback/test secret.

**Приёмка:** production contract test не позволяет создать сессию по известному user ID; dev harness продолжает работать только с флагом.

## SEC-001. Ввести fail-fast production config

**Сделать:** централизованно валидировать DB path, timezone, cookie settings, Telegram token/secret, object storage, media/backup dirs, release version.

**Как работает:** production startup завершается non-zero до listen, если конфигурация отсутствует, имеет dev-значение или каталоги недоступны.

**Приёмка:** тесты покрывают каждый missing/unsafe параметр; JSON и local-storage fallback запрещены в production.

## SEC-002. Исправить session cookie

**Сделать:** использовать `__Host-dvorik_session`, `HttpOnly`, production `Secure`, `Path=/`, без `Domain`, утверждённый `SameSite`; logout очищает cookie с теми же атрибутами.

**Мелкие детали:** ротировать session ID после login/role change; хранить hash token, а не raw token; старые сессии отзывать транзакционно.

**Приёмка:** browser test проверяет flags, logout, expiry, revoke и невозможность повторного использования старой сессии.

---

# Этап 1. Сделать normalized SQLite единственным источником истины

## DB-101. Выбрать in-process SQLite driver

**Зависит от:** `SEC-001`.

**Сделать:** заменить `spawnSync("sqlite3")` на поддерживаемый in-process driver и единый `DatabaseAdapter` с `query`, `execute`, `transaction`, `close`.

**Мелкие детали:** проверить native package на целевой macOS/Linux архитектуре; не передавать async callback в sync transaction API; определить test adapter.

**Приёмка:** SQL не запускается отдельным процессом; одна business transaction использует одно соединение.

## DB-102. Настроить каждое соединение

**Сделать:** включать `foreign_keys=ON`, WAL, `busy_timeout`, выбранный `synchronous`, проверку schema version и graceful close.

**Мелкие детали:** `foreign_keys` — connection-local; запись pragma в migration-файле не защищает новое соединение. Параметры логируются без секретов.

**Приёмка:** FK реально отклоняет orphan; второй writer ждёт busy timeout; readiness видит DB/schema mismatch.

## DB-103. Утвердить хранение количеств

**Сделать:** выбрать integer minor units (например, тысячные) либо доказанную decimal strategy; создать единый `Quantity` converter для API/import/report/storage.

**Мелкие детали:** отдельно решить допустимую дробность `шт`; округление выполняется один раз на границе, не после каждого сложения.

**Приёмка:** 1000 дробных операций не дают drift; migration до/после совпадает в утверждённой точности.

## DB-104. Создать Unit of Work

**Сделать:** `UnitOfWork.transaction(ctx => ...)`, где `ctx` содержит transaction-scoped repositories. Вложенный service использует существующий context и не commit самостоятельно.

**Мелкие детали:** savepoint разрешать только для явно описанного partial-success процесса; обычный nested transaction запрещён.

**Приёмка:** fault injection между domain write, audit, idempotency и outbox откатывает всё.

## DB-105. Создать repository contracts

**Сделать:** интерфейсы Users/Sessions/Roles, Products/Suppliers, Locations/Stock, Schedule/Swaps, Imports/Merges/Labels, Notifications/Outbox, Audit/Idempotency.

**Мелкие детали:** интерфейсы не содержат SQLite column names; внешний ID/API shape сохраняется; JSON payload получает версию.

**Приёмка:** application services получают repositories через context/constructor; PostgreSQL adapter теоретически подключается без изменения service contract.

## DB-106. Реализовать row mappers

**Сделать:** явный mapper каждой таблицы: enums, NULL, JSON, UTC timestamp, local date, quantity.

**Мелкие детали:** не смешивать SQLite `datetime('now')` и ISO `Z`; повреждённый JSON не заменять тихо на `{}`.

**Приёмка:** round-trip test каждой сущности; corrupt payload даёт диагностируемую ошибку с entity ID.

## DB-107. Перевести read/query paths

**Сделать:** dashboard, products/search, reports, schedule/day detail, inventory snapshot, audit/outbox reads выполняются SQL с filters/sort/pagination.

**Мелкие детали:** permission visibility применяется до получения результата; не загружать весь audit/catalog в память.

**Приёмка:** endpoints не обращаются к global `db`; большие выборки имеют stable pagination и deterministic order.

## DB-108. Удалить full-state projection из каждого save

**Сделать:** прекратить `DELETE + INSERT` всех normalized tables при любом изменении; `buildNormalizedStateSql` оставить только converter.

**Приёмка:** одна складская операция изменяет только нужные balances/operation/audit/outbox/idempotency rows.

## DB-109. Удалить production `AppState`

**Зависит от:** всех `TX-*` ниже.

**Сделать:** удалить runtime `db`, `saveState`, `stateTransaction`, `findBalance`; `app_state.payload` доступен только migration tool/tests.

**Приёмка:** `rg '\bdb\.' src/server` не находит application code; API и worker сразу видят изменения друг друга.

---

# Этап 2. Перевести mutations на настоящие application services

## TX-201. Общий command context

**Сделать:** context содержит actor, requestId, channel (`web|telegram|worker`), transaction, idempotency key и clock.

**Мелкие детали:** Telegram и HTTP вызывают один service; actor не восстанавливается из произвольного header; tests используют fixed clock.

**Приёмка:** audit/outbox связываются с HTTP request или Telegram update одним correlation ID.

## TX-202. Каноническая idempotency

**Сделать:** атомарно claim `(scope,key)`, хранить request hash/status/response; одинаковый key+payload возвращает сохранённый ответ, key+другой payload — `409`.

**Мелкие детали:** сохранять исходный HTTP status; `processing` имеет timeout/recovery; нормализовать порядок JSON fields перед hash.

**Приёмка:** два параллельных запроса создают одну операцию; ключ нельзя переиспользовать с другим количеством.

## TX-203. Stock operation service

**Сделать в одной `BEGIN IMMEDIATE`:** permission, idempotency claim, product/location validation, balance/version read, insufficient-stock check, conditional updates, operation, audit, notifications/outbox, response.

**Мелкие детали:** transfer блокирует одинаковые locations; reversal link уникален; нулевой/пороговый event вычисляется по переходу before→after.

**Приёмка:** два writers не теряют остаток; отрицательный balance и operation без balance update невозможны.

## TX-204. Inventory и reversal

**Сделать:** inventory сначала проверяет версии всех строк, затем применяет весь набор атомарно; discrepancy сохраняет expected/actual/delta. Reversal повторно проверяет состояние original operation.

**Приёмка:** один stale row отклоняет весь inventory; повторный reversal невозможен; audit и outbox не остаются после rollback.

## TX-205. Tablet buffer semantics

**Сделать:** каждый entry — отдельная атомарная audited operation; entries идут строго по порядку; failure останавливает хвост; stable child idempotency keys позволяют безопасный resume.

**Мелкие детали:** ответ содержит `applied`, `failed`, `not_started`; общий buffer-run audit не утверждает rollback уже применённых entries.

**Приёмка:** network loss после третьей entry не повторяет первые три.

## TX-206. Schedule и swaps

**Сделать:** shift/day/assignments/version/conflicts/swap status/sibling cancellation/audit/outbox — одна transaction.

**Мелкие детали:** повторно проверить active users и closed day после preview; два concurrent accept дают один success; stale Telegram callback получает понятный ответ.

**Приёмка:** принятая подмена не существует без назначения и уведомления; blocked target не назначается.

## TX-207. Auth, users, roles, onboarding

**Сделать:** sessions и role assignments читать из таблиц; approve/reject меняет user/roles/revokes sessions/audit/outbox атомарно.

**Мелкие детали:** permissions не хранить копией внутри User; защитить последнего super admin, self-block и self-demotion.

**Приёмка:** изменение роли сразу видят API и worker; callback onboarding идемпотентен.

## TX-208. Imports

**Сделать:** preview immutable; commit проверяет preview hash/version; products/supplier SKUs/receipts/rows/result/audit/idempotency — одна transaction; undo проверяет dependent movements.

**Мелкие детали:** rejected rows не участвуют; supplier SKU уникален внутри supplier; строка import хранит raw, normalized, warning/error и committed product/operation IDs.

**Приёмка:** ошибка последней строки не оставляет первые продукты; повтор commit возвращает тот же result.

## TX-209. Merge, archive, catalog, labels

**Сделать:** merge commit/undo атомарны; archive commit проверяет preview token; barcode/SKU collisions блокируются; label job получает явный state и snapshot.

**Мелкие детали:** stale merge preview возвращает `409`; undo не перетирает новые движения; PDF failure не должен создавать job со статусом success.

**Приёмка:** fault injection не оставляет полуобъединённый товар или ложный label job.

---

# Этап 3. Outbox, workers, permissions и наблюдаемость

## OUT-301. Каталог доменных событий

**Сделать:** зафиксировать типы stock zero/threshold/receipt, swap lifecycle, schedule changed, onboarding, report ready, archive run, worker failure. Для каждого: payload version, recipients, channels, preference key.

**Приёмка:** event type не задаётся произвольной строкой в разных services; contract tests проверяют payload.

## OUT-302. Разделить WebApp inbox и delivery outbox

**Сделать:** notifications хранят read/unread для интерфейса; outbox хранит только доставку. Resolver применяет `off/instant/daily` по eventType/channel.

**Мелкие детали:** чтение WebApp notification не отмечает Telegram delivery; daily не создаёт instant message.

**Приёмка:** одна domain event даёт ожидаемый набор inbox/outbox rows без дублей.

## OUT-303. Transactional enqueue

**Сделать:** outbox insert находится в transaction породившего business event; idempotency key строится из business entity+event+recipient+version.

**Приёмка:** business commit без обязательного outbox невозможен; rollback удаляет оба.

## OUT-304. Lease и atomic claim

**Сделать:** поля `lease_owner`, `locked_at`, `lease_until`; worker атомарно арендует batch; expired processing возвращается в pending.

**Мелкие детали:** два workers не читают один message; clock задаётся dependency; lease продлевается для большого PDF.

**Приёмка:** kill после claim → другой worker подбирает message после timeout.

## OUT-305. Retry, failed и DLQ

**Сделать:** exponential backoff+jitter, max attempts, terminal `failed`, Telegram `429 retry_after`, классификация permanent `400/403`, безопасный lastError.

**Приёмка:** timeout/429/400/5xx/max attempts покрыты tests; permanent error не крутится бесконечно.

## OUT-306. Supervised worker loop

**Сделать:** постоянный polling loop, configurable batch/concurrency, graceful SIGTERM, heartbeat/readiness, stop taking jobs before shutdown.

**Приёмка:** worker не завершается после пустой очереди; active jobs корректно завершаются или освобождают lease.

## OUT-307. Telegram transport hardening

**Сделать:** request timeout, разбор Telegram JSON error, `sendMessage`, `sendDocument`, `answerCallbackQuery`, edit message; документ передавать storage reference, а не base64 в outbox.

**Мелкие детали:** учитывать text/caption/file limits; токен никогда не попадает в log; заблокировавший бота recipient получает terminal reason.

**Приёмка:** большой PDF не раздувает DB; fake Telegram тестирует transport methods и failures.

## OUT-308. Admin outbox UI

**Сделать:** страницы pending/processing/failed/sent, filters, attempts, last/next attempt, manual retry/cancel; отдельное permission `outbox:retry`.

**Мелкие детали:** retry пишет audit и не разрешён для sent; два нажатия не создают две deliveries.

**Приёмка:** admin видит реальную причину и status; seller не имеет доступа.

## OUT-309. Daily digest correctness

**Сделать:** группировать только подходящие не включённые events по локальному дню VLAT; хранить digest membership/watermark.

**Мелкие детали:** unread не означает «включать каждый день»; два scheduler запуска создают один digest.

**Приёмка:** UTC/VLAT boundary tests и повторный scheduler не дублируют сообщения.

## SEC-303. Declarative route policy

**Сделать:** middleware `auth + permission + validation`; составить role/route matrix; критичные права повторно проверить в service.

**Приёмка:** contract test проходит каждый endpoint для super admin/admin/seller/pending/blocked.

## SEC-304. Разделить опасные права

**Сделать:** отдельные permissions для backup create/restore, outbox retry, user block, role manage, audit read.

**Мелкие детали:** `techlog:read` не даёт restore; нельзя заблокировать последнего super admin.

**Приёмка:** negative role tests возвращают стабильный `403`.

## SEC-305. CSRF, Origin и headers

**Сделать:** Origin/Host validation или CSRF token для cookie mutations; отдельное исключение webhook; CSP, nosniff, referrer policy, CORS allowlist, HTTPS HSTS.

**Мелкие детали:** CSP/frame policy не должна ломать Telegram WebView.

**Приёмка:** cross-site mutation отклоняется, штатный WebApp работает.

## SEC-306. Request schemas и limits

**Сделать:** строгая validation body/query/params, unknown-field policy, лимиты массивов/строк/files/import rows, endpoint-specific body limits.

**Приёмка:** NaN, wrong enum, oversized array, prototype key и malformed query отклоняются до service.

## SEC-307. Rate limits

**Сделать:** отдельные limits для auth/dev, webhook, media URL, import/report/PDF, backup/restore; корректный trusted proxy.

**Приёмка:** тяжёлый endpoint ограничен; health/read не блокируются общим лимитом.

## SEC-308. SSRF и secret hygiene

**Сделать:** проверять DNS/private IP на каждом redirect, блокировать mapped IPv6/link-local, limit redirects; webhook secret сравнивать безопасно; redaction cookies/token/initData/base64.

**Приёмка:** public→localhost redirect и DNS rebinding блокируются; log snapshot не содержит secrets.

## OBS-301. Structured logs и correlation

**Сделать:** JSON logs: UTC timestamp, service/release/env, requestId, actorId, normalized route, status/duration, entity/action. Протянуть requestId в audit/outbox.

**Мелкие детали:** не использовать user/product IDs как metric labels; не логировать report base64 и Telegram IDs без необходимости.

**Приёмка:** один ID связывает HTTP/Telegram → service → audit → outbox.

## OBS-302. Health/readiness

**Сделать:** `/live` проверяет процесс, `/ready` schema/config/DB writable/media adapter/worker freshness; internal details защищены permission/network.

**Мелкие детали:** readiness не создаёт бизнес-строки и не делает внешний upload.

**Приёмка:** missing migration, read-only DB и dead worker делают readiness красным.

## OBS-303. Metrics и alerts

**Сделать:** HTTP latency/errors, DB busy, stock conflicts, import/report durations, webhook duplicates/errors, outbox age/fail/retry, worker heartbeat, digest run, backup age, media fallback.

**Приёмка:** намеренно вызванные 500, stuck outbox, failed backup и missed worker видны на dashboard и вызывают actionable alert.

## OBS-304. Graceful shutdown и retention

**Сделать:** stop accepting requests, finish in-flight, release leases, close DB/WAL; правила хранения logs/metrics/audit/failed payloads/backups.

**Приёмка:** SIGTERM не теряет accepted business operation; рост audit/outbox имеет retention/archival policy.

---

# Этап 4. Миграция, backup и restore

## MIG-401. Migration metadata/checksum

**Сделать:** `schema_migrations` хранит version/name/checksum/start/completion; изменённая применённая migration блокирует startup.

**Приёмка:** failed migration не applied; изменение старого SQL обнаруживается.

## MIG-402. Расширить schema для runtime

**Сделать:** добавить `telegram_updates`, WebApp notifications, outbox lease/max attempts/error code, session token hash, migration batch/source, quantity representation и недостающие timestamps/versions.

**Приёмка:** schema покрывает application services без compatibility JSON.

## MIG-403. Настоящий dry-run

**Сделать:** отдельная команда ничего не пишет и выдаёт JSON+Markdown: counts, per-location balances, orphans, duplicates, invalid enums/dates/quantities, jobs, outbox, estimated disk/time.

**Мелкие детали:** `db:migrate`, который меняет schema, нельзя называть dry-run.

**Приёмка:** source checksum и report сохраняются; P0 conflict завершает non-zero.

## MIG-404. Полное mapping coverage

**Сделать:** перенести suppliers/SKUs/aliases, import warnings/rejected, merge resolution/result, swap resolution, notification read state, outbox/idempotency без collisions.

**Мелкие детали:** каждый legacy field имеет mapping или явно утверждённый discard rule; placeholder supplier не перетирает real data.

**Приёмка:** mapping matrix не содержит неизвестных полей.

## MIG-405. Неразрушительный повторный converter

**Сделать:** не удалять все таблицы; использовать migration batch и controlled insert/upsert; запретить conversion после normalized writes.

**Приёмка:** второй запуск same batch не меняет counts/checksums; новая normalized запись не исчезает.

## BKR-401. Консистентный backup bundle

**Сделать:** SQLite backup API/`VACUUM INTO`, checkpoint WAL; bundle включает DB, media manifest, schema/release, counts, checksums и encryption key ID.

**Мелкие детали:** временное имя → fsync/checksum → atomic publish; обычная копия `.sqlite` без WAL/SHM запрещена.

**Приёмка:** backup отдельно открывается и проходит `integrity_check`/`foreign_key_check`.

## BKR-402. Retention и remote copy

**Сделать:** local short-term + encrypted remote; daily/weekly/monthly retention; pruning только после подтверждённой remote copy.

**Приёмка:** metrics видят age/size/result; backup старше RPO вызывает alert.

## BKR-403. Restore preflight

**Сделать:** проверять manifest/checksum/decryption/schema/free disk; показывать dry-run diff counts/totals/age/release; требовать re-auth и typed confirmation.

**Мелкие детали:** предупредить о sessions, pending/sent outbox и media. Path/name validation обязательна.

**Приёмка:** corrupt/incompatible bundle блокируется до maintenance mode.

## BKR-404. Safe restore

**Сделать:** maintenance, остановка writers/workers/schedulers, rescue backup, restore в новый путь, integrity/invariants, atomic switch.

**Мелкие детали:** после restore решить revoke sessions; sent outbox не переотправлять; pending сохранить с idempotency; refresh expired swaps.

**Приёмка:** live DB не перезаписывается до успешной проверки новой копии.

## MIG-406. Invariant verifier

**Сделать:** counts и IDs, balances каждой product/location пары, operation/reversal links, users/roles, shifts/assignments/swaps, imports, merges, outbox, audit, media refs.

**Мелкие детали:** общая сумма недостаточна — она может скрыть перестановку между локациями.

**Приёмка:** mismatch показывает expected/actual/IDs и возвращает non-zero.

## MIG-407. Production-like rehearsal

**Сделать:** дважды пройти preflight→backup→migration→invariants→API semantic diff→E2E→rollback на обезличенной production-копии.

**Мелкие детали:** включить pending outbox/import/merge, old schema, unicode/ё, decimals, corrupt references; измерить disk/temp/time с 30–50% запасом.

**Приёмка:** два запуска детерминированы; rollback укладывается в RTO.

---

# Этап 5. Сначала устранить подтверждённые функциональные P0/P1-разрывы

## FIX-501. Синхронизировать movements report DTO

**Проблема:** UI ожидает `createdAt/productId`, а report service отдаёт `date/product`; вызов `row.createdAt.slice(...)` может упасть.

**Сделать:** утвердить единый DTO, использовать его для JSON/CSV/PDF/UI, добавить API→component contract test.

**Приёмка:** movements page рендерит реальные строки без runtime error.

## FIX-502. Удалить fallback чужих смен продавцу

**Проблема:** при отсутствии своих смен Web UI подставляет весь список.

**Сделать:** фильтрация выполняется server-side и повторяется UI; показать empty state «Нет своих смен для обмена».

**Приёмка:** seller без смен не видит IDs, имена и детали чужих смен.

## FIX-503. Согласовать media body limit

**Проблема:** upload обещает 5 МБ, но общий JSON limit 2 МБ режет base64 раньше.

**Сделать:** перейти на streaming multipart (`MED-701`); до этого временно согласовать ingress/decoded limits и error message.

**Приёмка:** файл ровно лимита принимается, +1 byte отклоняется с `413`, без false «5 МБ».

## FIX-504. Гарантировать реальное сжатие

**Проблема:** `sharp` отсутствует в dependencies, поэтому production может молча хранить оригинал.

**Сделать:** обязательный processor dependency, startup capability check, fixture с доказанным resize/compression.

**Приёмка:** большой image уменьшается и получает ожидаемые dimensions; fallback в production запрещён.

## FIX-505. Реактивировать archived товар при приходе

**Сделать:** receipt в archived product атомарно меняет status→active, пишет audit/event; deleted product не восстанавливается автоматически.

**Приёмка:** товар сразу снова доступен продавцу и поиску после прихода.

## FIX-506. Supplier SKU должен сопоставлять существующий товар

**Проблема:** import всегда создаёт новый product.

**Сделать:** exact `(supplierId, normalizedSku)` → receipt существующего product; no match → create; ambiguous/conflict → rejected/needs resolution.

**Приёмка:** повторная поставка того же supplier SKU не создаёт дубль.

## FIX-507. Открыть tablet buffer нужным ролям

**Сделать:** убрать ранний admin-only return; показывать операции по permissions каждой строки.

**Приёмка:** seller с stock правами использует buffer; запрещённые action недоступны и server возвращает `403` при direct call.

## FIX-508. Зафиксировать inventory snapshot в buffer

**Проблема:** expected/version сейчас могут перечитываться при apply, скрывая конкурентное изменение после подсчёта.

**Сделать:** сохранять expected/version при вводе actual; commit сравнивает сохранённую версию.

**Приёмка:** движение между подсчётом и apply даёт `409`, а не молчаливую корректировку.

---

# Этап 6. Расписание и календарь

## SCH-601. Единый date contract

**Сделать:** убрать `start/end` из нового входного DTO дневной смены; compatibility response может временно отдавать `00:00–23:59`. Создать VLAT date helpers.

**Мелкие детали:** browser local timezone и UTC Telegram не используются для month/day key.

**Приёмка:** Web/API/bot дают один день около 00:00 VLAT, December→January и leap day.

## SCH-602. Строгая shift state machine

**Сделать:** допустимые transitions draft→scheduled→in_progress→completed, cancel из разрешённых статусов; запрет ручного создания in_progress/completed и редактирования terminal states.

**Приёмка:** invalid/repeated/past transitions дают стабильный `409`; UI скрывает невозможные actions.

## SCH-603. Полный multi-employee UI

**Сделать:** multi-select при create/edit, отображение всех assignments, validation active status каждого сотрудника.

**Мелкие детали:** изменение одного assignment не должно случайно удалить остальных; conflict message указывает employee/date/location.

**Приёмка:** одна смена сохраняет несколько сотрудников и корректно показывается Web/Telegram/export.

## SCH-604. Политика capacity локации

**Сделать:** решить и закрепить ADR: одна location/date — одна Shift с assignments либо явно разрешённая capacity. Preview различает employee conflict и location conflict.

**Приёмка:** несколько независимых shift rows не обходят capacity.

## SCH-605. Полный day detail

**Сделать:** по каждой location показывать working/closed/comment/staff/shift status/pending swaps. При filter=all нельзя молча выбирать первую location.

**Приёмка:** закрытие/редактирование требуют явной location; seller видит закрытие без раскрытия чужого staff.

## SCH-606. Массовое закрытие дня через preview

**Сделать:** preview затронутых draft/scheduled shifts, выбор cancel/перенести, commit с idempotency/audit.

**Приёмка:** commit не удаляет назначения молча; stale preview возвращает `409`.

## SCH-607. Rotation template CRUD

**Сделать:** name/location/ordered cycle/active weekdays/start offset/status; использовать таблицу `rotation_templates`.

**Мелкие детали:** archive template не меняет уже созданные shifts; reorder cycle явно инвалидирует preview.

**Приёмка:** сохранённый template повторно используется после restart.

## SCH-608. Детальный versioned rotation preview

**Сделать:** возвращать строки `create|skip_closed|conflict_employee|conflict_location|keep_manual|change`; previewId/hash/version/TTL.

**Мелкие детали:** изменение формы инвалидирует preview; commit принимает preview token, не пересчитывает невидимый результат.

**Приёмка:** stale preview `409`, повтор commit idempotent, manual assignment не удаляется.

## SCH-609. Future replacement preview parity

**Сделать:** подробный список shifts/conflicts, versioned preview, повторная проверка fromUser/target; уведомления обоим.

**Приёмка:** смена, изменённая после preview, блокирует commit без partial changes.

## SCH-610. Swap invariants

**Сделать:** unique pending per assignment, target conflict on create/accept, fromUser still assigned, target active, working day; sibling pending cancel атомарно.

**Приёмка:** concurrent accepts, blocked-after-preview, expired/cancelled callback покрыты tests.

## SCH-611. Экспорт и calendar acceptance

**Сделать:** 1/2 months, staff/location filters, closed days/comments, bundled Unicode font; тесты 4/5/6-row months, VLAT boundary, multi-staff.

**Приёмка:** PDF рендерится на Linux и визуально проверен PNG, CSV содержит тот же набор.

---

# Этап 7. Telegram и уведомления

## BOT-701. Полный Telegram update DTO

**Сделать:** сохранить callback ID/chat/message ID/inline query; каждый callback получает `answerCallbackQuery`; календарь редактирует существующее message, а не создаёт новое.

**Мелкие детали:** «уже обработано» — дружелюбный callback answer, не webhook 5xx.

**Приёмка:** повтор callback не плодит сообщения и не меняет бизнес-данные.

## BOT-702. Calendar parity

**Сделать:** `✅` scheduled/in_progress own shift, `✖` closed location, noop внешние days, русское название месяца, day detail location/comment/status, VLAT month.

**Приёмка:** 42 cells и данные совпадают с Web для одного user/date.

## BOT-703. Swap preview/conversation

**Сделать:** detail перед решением, Accept/Decline, disable buttons после результата, actor/status/version checks.

**Приёмка:** чужой/repeated/expired callback не меняет shift; используется общий service `TX-206`.

## BOT-704. Полный onboarding dialogue

**Сделать:** шаги имя→фамилия→подтверждение; super admin buttons seller/admin/reject; blocked/rejected `/start` не отвечает welcome.

**Мелкие детали:** callback approve отзывает sessions тем же service, что HTTP; conversation state переживает restart.

**Приёмка:** все роли/actions и duplicate callbacks покрыты fake Telegram tests.

## BOT-705. Реальные «Наличие» и «Поиск товара»

**Сделать:** state ожидания запроса, top-N, balances по location, pagination/back/cancel; общий SearchService.

**Приёмка:** Web и bot возвращают одинаковые product IDs/ranking при одинаковой visibility.

## BOT-706. Меню и ограничения

**Сделать:** setMyCommands/reply keyboard, unsupported text, max query length, per-user rate limit, cancel/back.

**Приёмка:** blocked/pending не получают данные; длинный/spam input не перегружает API.

## NTF-701. Event dispatcher

**Сделать:** события zero/threshold/receipt/swap lifecycle/schedule change проходят preference resolver `off|instant|daily`.

**Приёмка:** матрица событий/режимов/каналов проверена table-driven tests.

## NTF-702. UI настроек

**Сделать:** Web UI preferences по channel/eventType; bot меняет общий режим или даёт WebApp link.

**Приёмка:** reload показывает server truth; denied role не меняет чужие settings.

## NTF-703. Webhook negative paths

**Сделать:** duplicate/concurrent update, retry after callback error, inactive user, unsupported update, wrong/missing secret; webhook отвечает быстро и не ждёт network send.

**Приёмка:** одна update row и не более одного business effect.

---

# Этап 8. Импорт поставок

## IMP-801. Полная parse metadata

**Сделать:** `sheets[]`, selectedSheet, actual headerRow, headers, suggestedMapping, raw source row numbers.

**Мелкие детали:** XLSX не всегда первый sheet; пустые/preamble строки не должны сдвигать displayed row number.

**Приёмка:** fixture со вторым sheet и header после preamble правильно распознаётся.

## IMP-802. Надёжный CSV/encoding parser

**Сделать:** delimiter по нескольким candidate rows; BOM/UTF-8/cp1251 policy; multiline quoted CSV; limits на zip/rows/cells/length.

**Приёмка:** malformed/oversized/zip bomb отклоняются до большой memory allocation.

## IMP-803. Sheet/header/mapping UI

**Сделать:** выбор sheet/header, preview headers, dropdown article/name/quantity/unit/category; suggestion видна, manual override всегда выигрывает.

**Мелкие детали:** один source column нельзя назначить двум обязательным fields без предупреждения; любое изменение запускает новый preview.

**Приёмка:** request реально передаёт `columnMapping`, UI показывает normalized preview.

## IMP-804. Quantity и unit parser

**Сделать:** `12 шт`, `1,5 кг`, NBSP, unit в той же/отдельной колонке; разрешённые UOM и явные conversions.

**Мелкие детали:** пустое quantity не превращать в 0 молча; политика empty/zero документирована.

**Приёмка:** golden fixtures дают точные normalized quantities или rejected reason.

## IMP-805. Action-based row preview

**Сделать:** row action `create|receipt_existing|warning|rejected|ambiguous`, normalized values и source row; tabs и download rejected CSV.

**Приёмка:** до commit пользователь видит точное число новых products/receipts/rejected.

## IMP-806. Supplier registry

**Сделать:** выбирать supplierId из справочника; создание нового supplier — отдельное подтверждённое действие; display name хранится без потери регистра/формы.

**Приёмка:** похожие строки поставщика не создают случайные hash IDs.

## IMP-807. Duplicate policy

**Сделать:** raw file hash + supplier/sheet/mapping; отдельно supplier+invoice policy; одинаковое содержимое другого supplier предупреждает, но не всегда блокирует.

**Приёмка:** duplicate decision объясняется пользователю и audit.

## IMP-808. Previewed undo

**Сделать:** undo preview показывает reversals существующих receipts, удаляемые created products и blockers; commit undo атомарен.

**Мелкие детали:** created product удалять только без dependent changes; partial undo запрещён либо оформлен отдельной явной политикой.

**Приёмка:** conflict report содержит каждую строку/operation ID.

## IMP-809. Regression fixture pack

**Сделать:** anonymized files разных suppliers: second sheet, comma decimal, bad unit, duplicate invoice, cp1251, malformed, large.

**Приёмка:** golden expected actions/quantities хранятся рядом и запускаются в CI.

---

# Этап 9. Отчёты и жизненный цикл товаров

## RPT-901. Единый query/row contract

**Сделать:** typed DTO для каждого report type; from/to/product/location/min/max/type/actor filters, validation и stable ordering.

**Мелкие детали:** invalid date/min>max → `400`; VLAT date boundaries; UI не кастует несовместимый union через `unknown`.

**Приёмка:** JSON, CSV, PDF и UI используют одну query semantics.

## RPT-902. Полные наборы отчётов

**Сделать:** low/zero/range/all/archive/movements/discrepancies. Зафиксировать per-location или total policy.

**Мелкие детали:** zero включает active products без balance row; archive — archived без balances; legacy discrepancy без metadata показывает «нет данных», не нули.

**Приёмка:** fixture проверяет точный состав каждого отчёта.

## RPT-903. Movements/discrepancy details

**Сделать:** product/location/actor/reason/reversed link, expected/actual/delta, pagination.

**Приёмка:** reverse и inventory adjustment прослеживаются до original operation/audit.

## RPT-904. Безопасный CSV

**Сделать:** UTF-8 BOM, локализованные headers, formula-injection escaping для `= + - @`, стабильный filename.

**Приёмка:** Excel/LibreOffice корректно открывают кириллицу; опасная ячейка не выполняется как формула.

## RPT-905. Переносимый PDF

**Сделать:** bundled Unicode font, repeat table header, page numbers, generatedAt VLAT, no-data page, большие наборы без clipping.

**Приёмка:** render to PNG на Linux, visual test кириллицы и pagination.

## RPT-906. Snapshot и Telegram delivery

**Сделать:** report artifact имеет query+data hash+generatedAt/storage key; Telegram enqueue возвращает outbox ID/status. Повтор с изменёнными данными создаёт новый snapshot.

**Мелкие детали:** не хранить PDF base64 в основной DB; UI говорит «поставлен в очередь», а не «отправлен» до sent.

**Приёмка:** queued/sent/failed видны пользователю/admin; sendDocument использует тот же artifact.

## ARC-901. Добавить lifecycle timestamps

**Сделать:** product createdAt/lastReceiptAt/archivedAt/archiveReason/version.

**Мелкие детали:** товар без receipt не считается автоматически старым; grace для новых products.

**Приёмка:** archive candidate reason объясним и воспроизводим.

## ARC-902. Корректный candidate query

**Сделать:** active, все balances zero, no receipt after cutoff, no pending import/merge/label dependency.

**Приёмка:** balance >0 в одной location исключает product; receipt ровно cutoff покрыт тестом.

## ARC-903. Archive UI и restore

**Сделать:** dry-run table, выбор, refresh, typed confirm, stale revalidation; ручное restore с audit.

**Приёмка:** product, изменённый после preview, не архивируется.

## ARC-904. Scheduled sweep

**Сделать:** configured VLAT schedule, distributed DB lock/run ID/idempotency, dry-run mode, admin summary/outbox.

**Мелкие детали:** concurrent receipt выигрывает revalidation и активирует product; repeated run не дублирует audit.

**Приёмка:** concurrent archive/receipt test и metrics результата.

---

# Этап 10. Единый поиск и дубли

## SRCH-1001. Канонический SearchService

**Сделать:** `q/status/location/limit/cursor`, response title/identifiers/aliases/balances/score/matchedBy; Web и Telegram используют только его.

**Приёмка:** одинаковый query и role дают одинаковые IDs/ranking в Web/bot.

## SRCH-1002. Нормализация и ranking

**Сделать:** official/local/manufacturer, supplier SKU, barcode, aliases; exact barcode/SKU > prefix name > FTS. Нормализация ё/е, punctuation, whitespace, case.

**Мелкие детали:** одинаковый SKU разных suppliers различается context; исходная строка сохраняется для display.

**Приёмка:** acceptance corpus фиксирует ranking.

## SRCH-1003. FTS5 и fallback

**Сделать:** FTS external-content + triggers/reindex command; fallback LIKE по тем же normalized fields, metric/log fallback.

**Приёмка:** отключённый FTS сохраняет корректность, хотя может быть медленнее.

## SRCH-1004. Aliases CRUD

**Сделать:** permissions/audit/source/uniqueness; aliases создаются manual/import/merge осознанно.

**Приёмка:** conflict виден, alias удаляется без удаления product.

## SRCH-1005. Server search UI migration

**Сделать:** Products/Stock/Merge используют debounce, AbortController, cursor; stale response не перетирает новый query; filters URL-persisted.

**Приёмка:** каталог >100 items полностью доступен без client full load.

## MRG-1001. Candidate engine

**Сделать:** сигналы exact barcode, supplier SKU scoped, names/aliases, fuzzy; score 0..1 и per-signal explanation.

**Приёмка:** одинаковое normalized localName больше не единственный алгоритм; false positives измеряются fixture.

## MRG-1002. Persist candidate groups

**Сделать:** `open|dismissed|merged`, algorithmVersion/generatedAt, dismiss reason/audit, pagination/filter/expand.

**Приёмка:** dismissed group не появляется до изменения algorithm/data; можно выбрать любую пару.

## MRG-1003. Manufacturer decision

**Сделать:** добавить manufacturer в product schema/UI либо ADR явно исключить его из модели и обновить исходное требование.

**Приёмка:** field-level resolution не обещает отсутствующее поле.

## MRG-1004. Полная final-card resolution

**Сделать:** official/local/manufacturer/unit/category/tags/photo/threshold; preview показывает final card. Любое изменение source/target/choice инвалидирует preview.

**Приёмка:** commit target точно совпадает с показанной final card.

## MRG-1005. Identifier resolution

**Сделать:** include/drop/replace каждого identifier; barcode и `(supplier,SKU)` conflicts блокируют commit; blind append запрещён.

**Приёмка:** duplicate identifier не создаётся; пользователь видит причину conflict.

## MRG-1006. Balance resolution

**Сделать:** before/after каждой location, default sum; manual/source/target override требует permission+reason и создаёт audited merge operation.

**Приёмка:** global/per-location totals и operation journal согласованы.

## MRG-1007. Versioned preview/undo

**Сделать:** versions/hash/TTL/idempotency; stale commit `409`; undo preview перечисляет later product/identifier/media/stock dependencies.

**Приёмка:** undo атомарно восстанавливает обе карточки, identifiers, balances и operation links либо полностью отказывает.

---

# Этап 11. Управляемое медиа

## MED-1101. Streaming upload

**Сделать:** multipart streaming вместо JSON base64; magic bytes, MIME, decode success, dimensions/max pixels, EXIF rotation, size limits до storage.

**Приёмка:** spoofed/truncated/decompression bomb отклоняются; memory не растёт пропорционально большому base64.

## MED-1102. Обязательный image pipeline

**Сделать:** resize max dimension, strip metadata, JPEG/WebP quality, PNG transparency; card/thumb variants и policy original.

**Приёмка:** fixture подтверждает dimensions, mime, metadata removal и уменьшение bytes.

## MED-1103. Media records

**Сделать:** id/productId/storageKey/checksum/mime/dimensions/size/status/reference count/createdAt; product хранит media ID/variants.

**Приёмка:** файл прослеживается и не удаляется по голому URL.

## MED-1104. Production object storage

**Сделать:** `put/head/get/delete`, S3-compatible SDK/signing, bucket/prefix/ACL/public base, startup health. Silent object→local fallback запрещён или явно ограничен single-instance policy.

**Приёмка:** storage outage даёт retryable error, а не success с недоступным локальным файлом.

## MED-1105. External URL validation

**Сделать:** DNS/IP на каждом redirect, GET-range/content sniff при HEAD 405/no length, timeout/max redirects, raster MIME allowlist.

**Приёмка:** redirect на private IP, DNS rebinding, oversized/no-length и non-image блокируются.

## MED-1106. Product media UI

**Сделать:** create/edit picker, preview/progress/cancel/retry, external validation, PATCH photo support, broken-image fallback.

**Мелкие детали:** отменённый orphan upload удаляется grace worker, не мгновенно.

**Приёмка:** create/edit/reload показывает один и тот же stored variant.

## MED-1107. Safe delete lifecycle

**Сделать:** reference check в products/merge snapshots/jobs, `pending_delete`→worker delete→audit, backup/retention и restore window.

**Приёмка:** referenced media физически не удаляется; failed delete повторяется через outbox/job.

---

# Этап 12. Планшетный buffer и UI-polish

## TAB-1201. Общий buffer component и permissions

**Сделать:** seller/admin используют один component; каждое action проверяется отдельно, inventory-only не зависит от canMove.

**Приёмка:** role matrix UI/API согласована.

## TAB-1202. Версионированный local draft

**Сделать:** key содержит userId/workspace; schemaVersion, createdAt, batchId/idempotency; runtime validation/migration/expiry.

**Мелкие детали:** при logout/switch user чужой draft не виден; corrupt JSON очищается с notice, а не ломает page.

**Приёмка:** reload/switch user/old schema tests.

## TAB-1203. Добавление и duplicate policy

**Сделать:** добавлять из server search/location/zero stock; одинаковый product/location либо осознанно aggregate, либо сохранять отдельные ordered steps с warning.

**Приёмка:** user заранее понимает итоговый порядок и количество.

## TAB-1204. Порядок и projected balances

**Сделать:** accessible move up/down/drag; projection каждой строки учитывает предыдущие operations.

**Приёмка:** transfer→writeoff→inventory preview совпадает с server result.

## TAB-1205. Row validation

**Сделать:** source≠target, qty>0, projected nonnegative, reason; inventory expected/version captured at count.

**Приёмка:** errors показываются у строки до submit; server всё равно revalidates.

## TAB-1206. Run preview/status/resume

**Сделать:** preview order/warnings, stable batch key, `GET buffer-run`; statuses applied/failed/not_run/unknown, resume from failed.

**Мелкие детали:** UI удаляет только подтверждённо applied entries; network uncertainty не считается failed или success без lookup.

**Приёмка:** lost response + retry не создаёт duplicate operations.

## UI-1201. Typed async state

**Сделать:** success/error tone не определяется substring; typed idle/loading/success/error, field errors, `aria-live` status.

**Приёмка:** message language change не ломает цвет/состояние.

## UI-1202. Dialog/focus/navigation

**Сделать:** focus trap/initial/Escape/return, `aria-describedby`, body scroll lock; `aria-current` nav, pressed tabs, skip link.

**Приёмка:** все destructive flows полностью выполняются keyboard-only.

## UI-1203. Touch/contrast/reflow

**Сделать:** target ≥44px, WCAG 2.2 AA light/dark, dense не уменьшает controls, 200%/400% zoom, убрать global overflow masking.

**Приёмка:** нет hidden content/horizontal page scroll на 320px; таблицы имеют осознанный accessible scroll/cards.

## UI-1204. Responsive/device matrix

**Сделать:** 320/360/390/768/820/1024/1280/1440, portrait/landscape, Telegram WebView safe area/keyboard/back.

**Приёмка:** критичные workflows проходят на iPhone/Android/iPad и desktop.

## UI-1205. Routing и reload safety

**Сделать:** real URL/deep link, back/forward, filter persistence, dirty-form guard, AbortController against stale responses.

**Приёмка:** refresh возвращает на ту же page/filter и не теряет подтверждённый server state.

---

# Этап 13. Автоматическая и ручная приёмка

## TST-1301. Изолированный test harness

**Сделать:** temporary SQLite/media, fixed clock/VLAT/IDs, fake Telegram/object storage, teardown. Тесты не читают и не пишут `gpt-version/data`.

**Приёмка:** parallel CI runs не влияют друг на друга.

## TST-1302. Domain unit matrix

**Покрыть:** stock/inventory/reversal decimals/version/idempotency; shift/swap states; import headers/quantities/SKU/undo; merge resolution/undo; archive; media invalid cases.

**Приёмка:** каждый mutation имеет happy, permission, validation, stale, duplicate и rollback tests.

## TST-1303. Repository integration

**Покрыть:** constraints, transaction rollback, two writers, busy timeout, crash points, atomic business+audit+outbox.

**Приёмка:** тесты используют два DB connections/processes, а не только одну память.

## TST-1304. Migration/invariant fixtures

**Покрыть:** empty, seed, production-like, old schema, max size, corrupt refs, unicode/ё, decimal, pending outbox/import/merge; idempotent second run и rollback.

**Приёмка:** fixture hash и machine-readable reports сохраняются.

## TST-1305. API contract/OpenAPI

**Покрыть:** auth/cookies, role matrix, status/error shape, idempotency, pagination, filters, CSV/PDF headers, media limits, webhook secret.

**Приёмка:** OpenAPI snapshot не меняется незаметно; undocumented breaking change блокирует CI.

## TST-1306. Telegram integration

**Покрыть:** duplicate/out-of-order callback, stale button, blocked user, concurrent accept/decline, calendar edges, onboarding roles, 429/5xx/timeout, sendDocument/edit/answer callback.

**Приёмка:** fake Bot API сохраняет точные requests и business effect.

## TST-1307. Worker resilience

**Покрыть:** crash after lease, after external success before local sent, lease reaper, jitter/max attempts/DLQ/manual retry, two workers.

**Мелкие детали:** at-least-once duplicate risk после внешнего success должен быть явно наблюдаем и описан.

**Приёмка:** stuck processing автоматически восстанавливается.

## TST-1308. Browser E2E

**Сделать:** Playwright для roles и flows dashboard/product/search/media/stock/inventory/schedule/swap/import/report/merge/archive/buffer/outbox/backup.

**Мелкие детали:** destructive flow проверяет operation/audit/outbox, не только toast.

**Приёмка:** critical suite стабильно проходит без flaky retry masking.

## TST-1309. Failure injection

**Покрыть:** DB read-only/full/locked, object storage down, Telegram timeout, corrupt backup, worker kill, API restart, lost response.

**Приёмка:** UI не показывает false success; данные/события не теряются.

## TST-1310. Security suite

**Покрыть:** dev route production, session/CSRF, upload traversal/SSRF/rebinding, restore path, log redaction, rate limits, permission escalation.

**Приёмка:** serious findings отсутствуют или явно блокируют release.

## TST-1311. Performance/capacity

**Покрыть:** p95 dashboard/search/report/import, large PDF, migration time/disk, concurrent stock, outbox backlog drain.

**Приёмка:** утверждены numeric thresholds; «не упало» не является критерием.

## TST-1312. Visual/PDF/accessibility

**Сделать:** screenshot baselines light/dark × density × viewport; axe; manual VoiceOver+NVDA; PDF→PNG visual comparison.

**Приёмка:** axe 0 serious/critical, keyboard 100%, PDF без clipping/битой кириллицы.

## TST-1313. Исполняемый smoke

**Сделать:** `/live`, `/ready`, auth roles, read, reversible stock op, schedule, webhook duplicate, outbox delivery, media read, backup list. Smoke entities маркируются и очищаются/reverse.

**Приёмка:** один command создаёт machine-readable release evidence.

## TST-1314. Расширить release gate

**Сделать:** `check + unit + integration + E2E + axe + build + dependency audit + migration rehearsal + restore drill`.

**Приёмка:** `verify:release` запускает все обязательные gates или вызывает CI workflow с сохранёнными artifacts.

---

# Этап 14. Production cutover и rollback

## REL-1401. Immutable artifact и config inventory

**Сделать:** version/commit/schema внутри build; тот же artifact проходит rehearsal/production. Таблица required/default/sensitive/owner для всех env.

**Приёмка:** в release window ничего не пересобирается.

## REL-1402. T-7 дней

**Сделать:** утвердить окно/roles/comms, freeze features, secrets/capacity/cert/storage, rehearsal sign-off, rollback decider.

**Приёмка:** no-go checklist подписан.

## REL-1403. T-24 часа

**Сделать:** новый backup+restore verification, service health, сохранить Telegram webhook config, разобрать backlog, подготовить artifact.

**Приёмка:** backup проходит preflight и restore на isolated env.

## REL-1404. Технически остановить legacy writes

**Сделать:** maintenance/read-only API/DB, остановить legacy cron/bot/import, дождаться in-flight, зафиксировать pending outbox и baseline invariants.

**Мелкие детали:** проверить попыткой записи, что система реально отвечает maintenance, а не только показывает banner.

**Приёмка:** после baseline hash legacy не меняется.

## REL-1405. Final backup и migration

**Сделать:** immutable bundle в двух местах, checksums; запустить тот же migration command, сохранить stdout/stderr/report; при любом invariant fail не открывать writes.

**Приёмка:** schema/integrity/invariants green.

## REL-1406. Порядок запуска

**Сделать:** DB → API read-only → workers paused → read smoke → controlled reversible write smoke → webhook → worker → scheduler → limited users → all users.

**Мелкие детали:** webhook `drop_pending_updates=false`; daily scheduler включать последним, чтобы не дублировать digest.

**Приёмка:** каждый checkpoint имеет explicit go/no-go.

## REL-1407. Hypercare

**Сделать:** 5xx/latency/DB locks/disk/invariants/outbox age/webhook/media fallbacks; balance сверки 15m/1h/end-day; post-cutover backup.

**Приёмка:** approved soak, no unexplained diff/P0/P1, outbox within SLO.

## RBK-1401. Численные rollback triggers

**Сделать:** thresholds для migration/invariant/readiness/auth breach/lost stock/outbox duplication/error rate. Один decider.

**Приёмка:** решение не принимается импровизацией в инциденте.

## RBK-1402. Разделить rollback до/после открытия writes

**Сделать:** до writes — restore pre-cutover bundle. После writes — freeze и сохранить post-cutover journal; hard restore без replay/reconciliation запрещён.

**Мелкие детали:** иначе новые stock/user/schedule изменения будут потеряны.

**Приёмка:** runbook явно содержит две ветки и ответственного за reconciliation.

## RBK-1403. Выполнить rollback rehearsal

**Сделать:** maintenance current, stop worker/scheduler, сохранить failed DB/WAL/media/logs, rescue backup, вернуть webhook, restore в новый path, old release read-only, invariants, затем writes.

**Приёмка:** RTO измерен; pending Telegram updates не сброшены; sent outbox не дублируется.

## REL-1408. Закрыть legacy

**Сделать:** legacy остаётся сетево/DB read-only на утверждённый срок; UI маркирован архивом; action links удалены; после окна сохраняется final archival backup.

**Приёмка:** ни один legacy endpoint/cron не может записать данные.

---

# 15. Рекомендуемый порядок выполнения

## Волна A — немедленно, P0

1. `DOC-001–003`.
2. `SEC-001`, затем `SEC-000`.
3. Независимые `FIX-501–504` с regression tests.
4. `DB-101–106`, `MIG-401–402`, `TST-1301/1303`.
5. `TX-201–207`, затем зависимые `SEC-002`, `FIX-505/508`.

## Волна B — единый source of truth

1. `OUT-301–309`, `SEC-303–307`, `OBS-301–304`, `FIX-507`.
2. `TX-208–209`, `DB-107–109`, `FIX-506`.
3. `MIG-403–406`, `BKR-401`.
4. Concurrency/failure tests `TST-1302–1307/1309`.

## Волна C — закончить продуктовые контуры

1. `SRCH-1001–1005` как общая зависимость Telegram/duplicates/UI.
2. `SCH-601–611`, `BOT/NTF-701–703`.
3. `IMP-801–809`.
4. `RPT/ARC-901–906`.
5. `MRG-1001–1007`, `MED-1101–1107`, `TAB/UI-1201–1205`.

Подробная оркестрация волн находится в `execution/iterations/README.md`. Если
краткая волна выше и iteration packet расходятся, сначала сверить зависимости в
`execution/TASK_REGISTRY.md`, затем исправить оба документа до начала edits.

## Волна D — migration/release

1. `MIG/BKR-401–407`.
2. `TST-1308–1314`.
3. Два production-like rehearsal и restore drill.
4. `REL/RBK-1401–1408`.

# 16. Шаблон выполнения одного атомарного пункта

Для каждого ID агент создаёт запись:

```markdown
## <ID> <Название>

- Предусловия: выполнены/нет.
- Текущий promise и source of truth.
- Файлы и контракты, которые затрагиваются.
- Изменение backend/domain/persistence/UI/worker.
- Permission, validation, transaction, idempotency, audit, outbox.
- Happy path.
- Negative/stale/retry/reload/concurrency path.
- Focused tests.
- Full gate.
- Документация/OpenAPI.
- Rollback риска изменения.
- Evidence и статус.
```

Нельзя переходить к следующему ID, пока текущий не имеет проверяемого evidence либо явно записанного blocker/deferment.

# 17. Ключевые stop gates

- Cutover нельзя начинать, пока существует production global `AppState`.
- Worker нельзя считать надёжным без lease/reaper/max attempts/failed/manual retry.
- Backup нельзя считать рабочим без успешного restore drill.
- Migration нельзя считать проверенной по seed fixture и общим totals.
- UI нельзя считать принятым только по `tsc`, unit tests и desktop screenshot.
- Telegram callback нельзя считать завершённым без replay/stale/actor/concurrency checks.
- Preview/commit нельзя считать безопасным без version/hash и stale rejection.
- Release нельзя считать завершённым, пока legacy способен принимать writes.
