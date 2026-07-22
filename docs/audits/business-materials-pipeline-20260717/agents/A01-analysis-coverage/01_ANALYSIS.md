# A01 — полнота анализа и доказательств

## Граница итерации 1

- Проверен только аналитический слой `docs/process-analysis/dvorik-20260717` относительно файлов репозитория.
- Проверялись: границы `current/target/legacy`, UI, API, Telegram, БД, jobs, интеграции и доказательная трассировка.
- Продуктовый код и созданные материалы не изменялись.

## Итог

Каталог **не покрывает фактический проект**. Он завершён после трёх источников, четырёх поверхностей и четырёх процессов, хотя внутри зафиксированной границы находятся несколько приложений и десятки самостоятельных процессов.

Особенно критично: доступный документ о границе продукта называет `gpt-version` единственным актуальным продуктом, а `recovered-dvorik` — read-only legacy-источником (`gpt-version/docs/PROJECT_STATE.md:19-23`). Анализ вместо этого назначил `server/routes.ts` источником `current`, не включил `gpt-version` и построил current-материал вокруг одного GET API пользователей.

## Что фактически зафиксировал анализ

- Вся корневая папка включена без исключений: `docs/process-analysis/dvorik-20260717/00_PROJECT.json:43-52`.
- Discovery объявил bottom-up и zero-delta завершёнными: `docs/process-analysis/dvorik-20260717/00_PROJECT.json:14-31`.
- Coverage: 3 источника, 4 поверхности, 4 процесса, 3 evidence, 0 links; Inventory Gate закрыт: `docs/process-analysis/dvorik-20260717/94_COVERAGE_REPORT.md:3-26`.
- Финальный handoff содержит только четыре процесса и пустые карты ролей, данных и интеграций: `docs/process-analysis/dvorik-20260717/98_HANDOFF.json:2-31`.

## Что реально существует в границе

### Current-продукт `gpt-version`

- Документированная граница: единственный актуальный продукт — `gpt-version`: `gpt-version/docs/PROJECT_STATE.md:19-23`.
- UI содержит отдельные области: dashboard, товары, склад, инвентаризация, маркировки, график, пользователи, отчёты и аудит: `gpt-version/src/client/src/main.tsx:61-93`.
- UI поддерживает Telegram WebApp и Telegram init data: `gpt-version/src/client/src/main.tsx:36-45`, `137-180`.
- Backend содержит Telegram auth, webhook и onboarding: `gpt-version/src/server/index.ts:545-612`.
- Backend содержит отдельные процессы товаров, медиа, склада, отмены операции, отчётов, инвентаризации, расписания, обменов смен, пользователей, backup/restore, import/undo, merge/undo и маркировок: представительные входы `gpt-version/src/server/index.ts:736-1030`, `1111-1293`, `1305-1464`.
- Механический поиск обнаружил 71 регистрацию HTTP endpoint в `gpt-version/src/server/index.ts`; в аналитическом inventory нет ни одного source/surface из `gpt-version`.
- Нормализованная схема содержит роли, права, пользователей, сессии, товары, идентификаторы, поставщиков, локации, остатки, движения, смены, импорты, merge jobs, label jobs, notification preferences, outbox, audit и idempotency: `gpt-version/src/server/migrations/002_normalized_schema.sql:11-333`; runtime добавляет Telegram updates и WebApp notifications: `gpt-version/src/server/migrations/004_runtime_schema.sql:1-35`.

### Отдельная root CRM-заготовка

- UI имеет восемь самостоятельных страниц: dashboard, users, discount templates, cashiers, broadcasts, campaigns, logs, settings: `client/src/App.tsx:10-31`.
- Backend имеет 48 регистраций endpoint; уже видны отдельные контуры пользователей, администраторов, кассиров, скидок, кампаний, рассылок, настроек, event logs и двух bot webhook: `server/routes.ts:30-840`.
- PostgreSQL-схема содержит 10 таблиц и самостоятельные сущности пользователей, ролей, кассиров, скидок, кампаний, рассылок и журналов: `shared/schema.ts:25-47`, `53-305`.
- Документация прямо говорит, что эта заготовка ориентирована на loyalty, а не на новую складскую CRM: `docs/crm/current-state.md:19-42`.

### Legacy `recovered-dvorik`

- Регистратор подключает 12 router-модулей: core, reports, supply, inline, stock, admin, notify, product, product admin, create, schedule, registration: `recovered-dvorik/app/routers.py:6-22`.
- Механический поиск обнаружил 116 message/callback registrations в handlers.
- Есть отдельный ежедневный job архивирования и рассылки digest, а также перезапуск polling: `recovered-dvorik/app/main.py:45-95`.
- Даже один выбранный процесс импорта можно было проследить полностью по локальным файлам: UI trigger и permissions (`recovered-dvorik/app/handlers/supply.py:47-80`), формат/дубликат/нормализация (`80-193`), транзакционный вызов и ошибки (`194-214`), результат и уведомление (`216-258`).
- Legacy БД содержит 21 таблицу/контур, включая stock, users/roles, notifications, event log, import, merge, schedule и registration (`recovered-dvorik/app/db.py:52-565`).

### Target

- Единственный выбранный target-source сам описывает не два, а как минимум семь семейств: авторизация/аудит, сотрудники, смены, товары, склад, маркировки, dashboard: `docs/crm/requirements.md:23-95`.
- В критериях MVP есть сквозные процессы сотрудника/смены, товара/прихода, контроля остатка, печати и RBAC/audit: `docs/crm/requirements.md:110-120`.
- Более полный feature catalog содержит auth, каталог, локации, склад, инвентаризацию, поставки, merge, печать, отчёты/уведомления, расписание и эксплуатацию: `dvorik-docs-staging/docs/webapp-rebuild/02_FEATURE_CATALOG.md:3-251`.

## Проверка доказательств

1. `ev_target_stock` ограничен `docs/crm/requirements.md:35-74`, но используется для всех утверждений о маркировках, которые находятся в исходнике на строках 76-87.
2. Утверждение про `Idempotency-Key` помечено `declared` и ссылается на строки 35-74 (`cards/processes/proc_target_stock_receipt.md:102-107`), хотя такого требования в `docs/crm/requirements.md` нет.
3. Утверждения о фоновом формировании большого PDF помечены `declared` (`cards/processes/proc_target_label_print.md:81-86`, `109-114`), хотя target requirements этого не устанавливают. Фактический current endpoint формирует PDF синхронно и отклоняет overflow: `gpt-version/src/server/index.ts:1423-1441`.
4. Неизвестные измерения помечены `Status: covered`; пример roles, permissions, user steps и states: `cards/processes/proc_current_user_api.md:18-65`.

## Выполненные проверки

- `rg --files` по репозиторию и каталогу анализа.
- Поиск регистраций HTTP routes, Telegram handlers, tables, jobs/outbox и интеграций.
- Сопоставление source/evidence/surface/process/gap/handoff с точными первоисточниками.
- Сверка трёх сохранённых SHA-256: сохранённые файлы не изменились; проблема не в drift этих трёх файлов, а в том, что остальные источники не были включены.

