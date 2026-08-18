# A03 — verification notes

## Выполнено

- `npm run check` — passed.
- `npm run test:staff-migration` — passed.
- `npm run test:staff-finalize` — passed.
- `NODE_ENV=test node --import tsx src/server/identity-service.test.ts` — passed.
- `NODE_ENV=test node --import tsx src/server/session-service.test.ts` — passed.

## Не пройдено

- `npm run test:staff-process` — child Staff process завершился с кодом 1 до readiness; stderr отсутствует в output теста. Это P1 release blocker до воспроизведения и исправления.

## Не проверено

- Реальная Telegram webhook/WebApp цепочка и отзыв production cookie.
- Rehearsal migration/cutover на копии production DB.
- UI/E2E UsersPage, включая employment dismissal.
- Непрерывная core → Staff репликация статусов.

## Остаточный риск

Без runbook и rehearsal запуск с существующими кадровыми данными не одобряется. Без identity outbox возможен временный разрыв статуса между core и Staff.
