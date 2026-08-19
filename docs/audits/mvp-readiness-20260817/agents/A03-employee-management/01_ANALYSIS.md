# A03 — управление сотрудниками: анализ

## Вывод

Контур доступа и базового кадрового учёта реализован. Для MVP он условно готов: обязательны production-конфигурация, реальный Telegram webhook и отдельный cutover существующих кадровых данных. Без этого запуск с уже работающей базой сотрудников небезопасен.

## Проверенные границы

- Веб-интерфейс: `src/client/src/pages/UsersPage.tsx:11-215`, пункт навигации `src/client/src/main.tsx:85-90`.
- Identity/RBAC/onboarding: `src/server/identity-service.ts:95-328`, `src/server/permissions.ts:3-41`, `src/server/telegram-production.ts:16-40`.
- Сессии: `src/server/session-service.ts:68-167`, HTTP-граница `src/server/index.ts:304-320,713-735,843-855`.
- Staff process: `src/staff/index.ts:10-47`, `src/staff/staff-service.ts:27-193`; прокси core: `src/server/index.ts:1681-1755,1840-1875`.
- Миграция/cutover: `src/staff/migrate-from-core.ts:7-37`, `src/staff/finalize-core-cutover.ts:4-15`; compose: `docker-compose.modular.yml:1-52`.

## Фактическое поведение

- Есть роли `seller`, `admin`, `super_admin`; права вычисляются сервером из роли (`src/server/permissions.ts:3-41`). Изменять роль может только `super_admin` (`src/server/identity-service.ts:131-145`). Защищены самопонижение и удаление последнего super admin (`:265-275`).
- Telegram webhook создаёт pending-пользователя, а approve/reject меняет статус/роль; web-session создаётся только активному пользователю (`src/server/telegram-production.ts:23-40`, `src/server/index.ts:713-735`).
- Изменение статуса или роли атомарно отзывает все активные сессии, пишет audit и Telegram outbox (`src/server/identity-service.ts:278-324`). Проверка сессии повторно требует active identity (`src/server/session-service.ts:117-127`).
- В Users UI есть список, поиск, статусы, блокировка/активация, назначение роли для super admin, карточка с должностью/табельным номером/датой приёма и HR-события (`src/client/src/pages/UsersPage.tsx:124-191`).
- Staff вынесен в свой SQLite-процесс с HMAC internal HTTP; core синхронизирует identity перед сохранением профиля, HR-события и изменением смены (`src/server/index.ts:1699-1709,1733-1743,1547-1571,1609-1640`).
- Есть одноразовая миграция и отдельная необратимая финализация, архивирующая кадровые таблицы core (`src/staff/migrate-from-core.ts:17-36`, `src/staff/finalize-core-cutover.ts:6-14`).

## Проверки

- Прошли: `npm run check`; `npm run test:staff-migration`; `npm run test:staff-finalize`; `NODE_ENV=test node --import tsx src/server/identity-service.test.ts`; `NODE_ENV=test node --import tsx src/server/session-service.test.ts`.
- Не прошёл: `npm run test:staff-process` — дочерний Staff process завершился с кодом 1, без текста stderr (`src/staff/staff-http.test.ts:9-18`). Причина не локализована тестом.
- UI/E2E-теста UsersPage и полного production onboarding/cutover не найдено.
