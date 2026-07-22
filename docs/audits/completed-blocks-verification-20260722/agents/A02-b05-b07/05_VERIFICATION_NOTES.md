# Проверка

## Выполнено

В `gpt-version` успешно пройдены:

```text
NODE_ENV=test npx tsx src/server/inventory-session-service.test.ts
NODE_ENV=test npx tsx src/server/inventory-session-concurrency.test.ts
NODE_ENV=test npx tsx src/server/inventory-reversal-concurrency.test.ts
NODE_ENV=test npx tsx src/server/inventory-reminder-service.test.ts
NODE_ENV=test npx tsx src/server/staff-schedule-service.test.ts
NODE_ENV=test npx tsx src/server/staff-schedule-concurrency.test.ts
NODE_ENV=test npx tsx src/server/schedule-swap-service.test.ts
NODE_ENV=test npx tsx src/server/schedule-swap-concurrency.test.ts
```

Первый запуск был заблокирован sandbox из-за временного IPC `tsx`; тот же набор затем выполнен с разрешением и прошёл.

## Остаточный риск

Тесты подтверждают реализованный нефинансовый срез. Они не подтверждают закрытие полного B05/B07, в частности cancellation/reconciliation/time-order B05 и весь payroll B07.
