# Неизменяемые правила агента

1. Источник требований — `../94_FULL_COMPLETION_PLAN.md`; источник фактов — текущий код, БД и результаты проверок.
2. Не считать прежнюю пометку `done` доказательством. Проверять код, контракт и evidence.
3. Простая модель выполняет один ID за цикл. Крупная модель может вести кластер, только если один ведущий агент владеет интеграцией, а подзадачи независимы по файлам и контрактам.
4. Субагентам отдавать bounded-задачи: аудит, тесты, один adapter/UI slice. Не отдавать им одновременно общий source of truth, миграционную стратегию или финальную интеграцию.
5. Перед mutation проверить authentication, permission, schema validation, transaction, idempotency, version/stale state, audit, outbox и UI error state.
6. Business write, audit, idempotency и outbox должны commit/rollback вместе.
7. Preview ничего не меняет; commit проверяет version/hash preview. Повтор одного key с другим payload даёт `409`.
8. Local date — `YYYY-MM-DD` в `Asia/Vladivostok`; timestamp — UTC ISO. Количество проходит единый converter.
9. Не скрывать ошибку fallback-ом и не выдавать partial success за success.
10. Не добавлять production dev/demo bypass, JSON persistence fallback, локальное media fallback или секреты.
11. Не переписывать несвязанные пользовательские изменения. Для правок использовать `apply_patch`.
12. `done` допустим только при положительном и негативном evidence. Typecheck сам по себе недостаточен.
13. При изменении контракта синхронно обновить тесты, OpenAPI/runbook/PROJECT_STATE и этот progress.
14. После сбоя оставить рабочее дерево диагностируемым: записать точную команду, ошибку и безопасный `Next`.

## Минимальный пакет evidence

- ссылки на изменённые файлы;
- focused test и его результат;
- негативный сценарий;
- для UI — browser/E2E или датированная ручная проверка;
- для блока — полный `check`, `test`, `build`;
- остаточные риски и непройденные проверки.

