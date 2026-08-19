# A03 — подтверждённые проблемы

### P1-A03-01: Compose не выполняет обязательный перенос кадровых данных

- **Promise:** отдельные Staff SQLite/process готовы к production (`docker-compose.modular.yml:11-17,32-40`).
- **Reality:** compose создаёт пустой `staff-data` и запускает `start:staff`; `staff:migrate` не вызывается. Скрипт миграции намеренно одноразовый и нужен до cutover (`src/staff/migrate-from-core.ts:17-18`), а финализация затем архивирует core-таблицы (`src/staff/finalize-core-cutover.ts:10-14`). Репозиторий не содержит runbook запуска/переключения, хотя README ссылается на отсутствующий `docs/MODULAR_RUNTIME.md` (`README.md:79-80`).
- **Effect:** при запуске существующего проекта profiles/HR/график останутся в core, а Staff начнёт с пустой БД; финализация без проверенного rehearsal создаёт риск остановки кадрового контура.
- **Cause:** migration/cutover существуют как ручные скрипты, но не встроены в deploy-процедуру.
- **Status:** confirmed.

### P1-A03-02: Process-level Staff smoke test падает

- **Promise:** независимый Staff process проверяется CI-командой `test:staff-process` (`package.json:34`).
- **Reality:** `npm run test:staff-process` завершился ошибкой: child process вышел с кодом 1 до readiness (`src/staff/staff-http.test.ts:9-18`). Тест не выводит stderr child process, поэтому диагностики нет.
- **Effect:** перед срочным MVP нельзя считать отдельный кадровый сервис подтверждённо запускаемым в тестовой среде.
- **Cause:** неизвестна; текущий тест скрывает причину.
- **Status:** confirmed failure; root cause needs verification.

### P2-A03-03: Статус сотрудника не реплицируется в Staff в момент блокировки

- **Promise:** блокировка лишает сотрудника доступа немедленно (`src/client/src/pages/UsersPage.tsx:64-80`).
- **Reality:** Identity update меняет core и отзывает web sessions (`src/server/identity-service.ts:278-287`), но не публикует identity event в Staff. Внешний Staff получает статус только как побочный эффект следующих profile/HR/schedule writes (`src/server/index.ts:1702-1708,1736-1742,1609-1611`). До этого его snapshot сохраняет прошлый status (`src/staff/staff-service.ts:17-18`).
- **Effect:** уже заблокированный сотрудник остаётся active в Staff-данных до следующей операции; новые schedule writes обновят выбранных работников, но самостоятельной консистентности нет.
- **Cause:** отсутствует надежная core → Staff репликация identity snapshots.
- **Status:** confirmed.

### P2-A03-04: UI не покрыт тестами и скрывает часть кадровых полей

- **Promise:** карточка сотрудника поддерживает employment profile.
- **Reality:** UI показывает и сохраняет только personnel number, position и hiredOn (`src/client/src/pages/UsersPage.tsx:189-190`), хотя форма содержит `status`/`dismissedOn` (`:15`) и API/модель поддерживают их (`src/server/index.ts:1708`, `src/staff/staff-service.ts:35-45`). Тестов UsersPage не найдено; в `package.json:42` отсутствует UsersPage test.
- **Effect:** увольнение нельзя корректно оформить через MVP UI; изменение общего account status не заменяет dismissed employment profile.
- **Cause:** неполная форма и отсутствие UI regression coverage.
- **Status:** confirmed.
