# A01 — что исследовать дальше

Итерация 1 подтверждает неполноту, но не строит новый каталог.

## Обязательно

1. Зафиксировать mode map до повторного анализа:
   - `current`: `gpt-version` согласно `gpt-version/docs/PROJECT_STATE.md:19-23`;
   - `legacy`: `recovered-dvorik` как read-only reference;
   - определить, является ли root loyalty CRM отдельным legacy/prototype или должна быть исключена;
   - определить набор нормативных target-документов между `docs/crm` и `dvorik-docs-staging/docs/webapp-rebuild`.
2. Перестроить inventory до синтеза процессов:
   - UI pages/actions;
   - HTTP endpoints и Telegram commands/webhooks;
   - migrations/tables и owners состояния;
   - workers, schedulers, outbox, backup/restore;
   - Telegram, media/object storage, PDF/file exports;
   - roles/permissions/feature flags.
3. Для каждого claim проверить точный locator. Запретить `confirmed/declared`, если quoted range не содержит утверждение.
4. Изменить coverage semantics: `unknown` не может иметь `covered`; локально доступный closure source не может давать `externally_blocked`.
5. Создать двусторонние links process ↔ role/data/job/integration/notification/state до handoff.

## Требует отдельной проверки

- Какой release `gpt-version` реально развернут: `PROJECT_STATE` указывает, что production release не подтверждён (`gpt-version/docs/PROJECT_STATE.md:1-17`).
- Какие функции current физически отключены feature flags/deferred launch и не должны попадать в пользовательские инструкции.
- Runtime-поведение Telegram, object storage и фоновых workers — нужны окружение/логи либо честный `COMPLETE_WITH_GAPS` после полного локального анализа.
- Реальное количество process candidates после полного inventory; endpoint/handler не всегда равен отдельному бизнес-процессу.
- Повторная сверка fingerprints после фиксации всех in-scope sources.

## Следующая итерация A01

После утверждения mode map составить полный surface manifest для `gpt-version`, затем выполнить обратную сверку каждого surface с process candidate. До этого текущие презентации нельзя считать полным описанием проекта.

