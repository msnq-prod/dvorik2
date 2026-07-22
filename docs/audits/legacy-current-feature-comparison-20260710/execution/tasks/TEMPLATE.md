# <ID> — <название>

## Статус и границы
- Статус: `pending`
- Приоритет: `<P0|P1|P2>`
- Зависимости: `<ID|—>`
- Не входит: `<явные исключения>`

## Цель
<Наблюдаемое итоговое поведение.>

## Предусловия
- Зависимости доказаны evidence.
- Прочитаны route/service/repository/UI/tests данного контура.
- Сняты baseline и `git status`.

## Кодовые контуры
- API/transport: `<paths>`
- Application/domain: `<paths>`
- Persistence/worker: `<paths>`
- UI: `<paths|нет>`
- Tests/docs: `<paths>`

## Пошаговая реализация
1. Зафиксировать текущий контракт и негативные сценарии.
2. Внести минимально полный сквозной набор изменений.
3. Добавить миграцию/compatibility, если меняется persisted/API contract.
4. Добавить focused, negative и concurrency/reload tests по риску.
5. Выполнить gates и записать evidence.

## Скрытые детали
- Permissions, validation, transaction, idempotency, audit и outbox проверяются отдельно.
- Ошибки не превращаются в false success; повтор/reload сохраняет корректный результат.
- Даты, количества, версии, stale preview и конкурентная запись проверяются явно.

## Проверки
- Focused: `<command>`
- Block: `npm run check && npm run test && npm run build`
- Manual/E2E: `<scenario>`

## Definition of Done
- [ ] Контракт реализован end-to-end.
- [ ] Негативный и повторный путь доказаны.
- [ ] Документация/схема обновлены при изменении контракта.
- [ ] Evidence создано, review замечания закрыты.

## Evidence
Создать `../evidence/<ID>.md` по шаблону.
