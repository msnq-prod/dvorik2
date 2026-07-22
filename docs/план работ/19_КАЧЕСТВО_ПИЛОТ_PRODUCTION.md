# B10. Качество, пилот и production

## Фактический статус — 2026-07-21

Доступная без production-инфраструктуры часть B10 реализована: aggregate
release-gate, расширенная unit/integration/concurrency/role matrix,
`/healthz`/`/live`/`/ready`, production artifact smoke и отдельный backup job с
проверкой bundle, свободного места и retention. Runbook и фактические границы
обновлены. Linux deployment, supervisor, monitoring, реальный pilot и cutover
не выполнялись и остаются stop-gate.

## Результат блока

Полный scope проверен на production-like сборке, принят продавцами и владельцем,
развёрнут на Linux и сопровождается наблюдаемыми процессами и честно
зафиксированными эксплуатационными рисками.

## Границы

Включены test strategy, security, performance, release artifact, migrations,
пилот, cutover, monitoring и runbooks. Перенос legacy-данных и проверка
восстановления backup не входят.

## Цели

1. Доказать бизнес-корректность сквозных сценариев.
2. Проверить роли, конкуренцию, повторы и отказоустойчивость.
3. Подготовить воспроизводимый Linux release.
4. Провести пилот с реальными сотрудниками.
5. Не заявлять неподтверждённые RTO и сохранность данных.

## План работ

### 1. Объединённая test matrix

- Unit tests формул, инвариантов и state machines.
- Repository/migration tests.
- API contract tests success/forbidden/conflict/retry/idempotency.
- Concurrency tests stock, inventory, merge, mapping и workers.
- Integration replay Saby и supplier fixtures.
- Role E2E seller/admin/owner.
- Visual/responsive/accessibility checks.
- Security checks sessions, secrets, permissions, upload и rate limits.

### 2. Сквозные сценарии

- Весовая поставка → FIFO → полка → зал → инвентаризация → расход → отчёт.
- Штучная поставка → Saby sale/discount → return → прибыль.
- Неизвестная Saby-позиция → общая выручка → mapping → backfill.
- Merge → новые операции → undo.
- Откат поставки → отрицательный остаток → предупреждение → восстановление.
- Инвентаризация → blocked mutation → queued event → закрытие.
- Обмен сменами → кадровое событие → зарплата.
- Закрытие месяца → запрещённое изменение → owner reopen.

### 3. Performance и отказоустойчивость

- Объёмный реальный import.
- Полный Saby reconciliation window.
- Параллельные scans и stock commands.
- Финансовый отчёт за максимальный ожидаемый период.
- Перезапуск scheduler/outbox без потери и дублей.
- Controlled shutdown и readiness.

### 4. Release artifact и Linux

- Clean install, typecheck, tests и build.
- Production startup с обязательной конфигурацией.
- Reverse proxy/TLS для `dvorik.shop`.
- Supervised API, Saby scheduler, Telegram/outbox и scheduled jobs.
- Health checks, structured logs, metrics и Telegram alerts.
- Миграции на копии production-БД перед каждым релизом.
- Rehearsal migration/rollback на disposable копии, не являющийся тестом
  восстановления production backup.

### 5. Пилот

- Ограниченный набор реальных товаров и поставок.
- Проверка продавцами на рабочих устройствах.
- Контрольные сверки остатков, чеков и выручки.
- Сбор дефектов по severity и повторная приёмка.
- Пилот не переводится в production при открытом P0/P1.

### 6. Cutover

- Новая система стартует без legacy-данных.
- До отключения legacy вручную завести и сверить: owner/admin accounts,
  сотрудников, группы и цены, товары, массу пачек, barcode, производителей,
  полки, начальные остатки, поставщиков, Saby mappings, текущий график,
  payroll settings, расходы и УСН-конфигурацию.
- Зафиксировать подписанный протокол начальных данных и контрольных остатков.
- Запустить API и workers, выполнить smoke.
- Отключать legacy writes только после успешной сверки начальных данных, Saby
  mapping/reconciliation и ролевого smoke; затем отключить legacy целиком.
- Сохранить релизные логи и evidence.

### 7. Backup и recovery risk

- Недельный локальный backup, хранение один месяц.
- Проверить запуск backup job по расписанию, создание ожидаемого bundle,
  регистрацию ошибки и удаление копий старше одного месяца.
- Контролировать свободное место и уведомлять администратора при ошибке job.
- Внешней копии нет.
- Автоматической и ручной проверки restore нет.
- Runbook описывает предполагаемые шаги, но восстановимость и RTO до часа не
  гарантируются.
- Владелец подтверждает риск перед release decision.

## Средства

- CI/release aggregate command;
- isolated test databases;
- browser E2E и device testing;
- load/fault scripts;
- built-artifact smoke;
- process supervisor, reverse proxy и monitoring;
- release checklist и evidence registry.

## Артефакты

- master test matrix;
- traceability/evidence report;
- performance baseline;
- security report;
- migration rehearsal report;
- pilot protocol;
- cutover/rollback runbook;
- production topology;
- signed owner release decision.

## Критерии приёмки

- Все требования scope связаны с пройденным acceptance evidence.
- Полный check/test/build/release-smoke зелёный.
- Нет открытых P0/P1 дефектов.
- Ролевые E2E доказывают запрет закрытых данных.
- Повторы и перезапуски не создают дубли.
- Реальные supplier fixtures и Saby replay проходят.
- Миграция и технический rollback проходят на disposable копии БД.
- Linux artifact стартует и проходит health/smoke.
- Все обязательные процессы находятся под supervisor и наблюдаются.
- Продавцы подписали результаты пилота.
- Протокол начальных операционных данных и контрольных остатков подписан
  владельцем до отключения legacy.
- Backup job создаёт копию по расписанию и применяет месячный retention; restore
  содержимого при этом не проверяется.
- Владелец отдельно подтвердил принятый backup/RTO риск.
- Владелец дал финальное решение о релизе.
- Legacy не принимает изменения после cutover.

## Stop gate

Production запрещён при открытом P0/P1, неуспешной Saby reconciliation,
расхождении контрольных остатков или отсутствии решения владельца.
