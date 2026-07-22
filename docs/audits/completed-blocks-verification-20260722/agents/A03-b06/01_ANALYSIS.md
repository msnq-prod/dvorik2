# A03 — B06: анализ заявления `code-ready`

Дата: 2026-07-22. Проверен только `gpt-version`; продуктовый код не изменялся.

## Вердикт

Заявление **частично подтверждено**: базовый кодовый контур существует и собирается, но B06 нельзя считать полностью готовым по собственному плану. Не реализованы обязательная ночная полная сверка/отчёт о расхождениях и предупреждение для возврата сверх принятой продажи. Это внутренние недоработки, а не внешняя активация.

## Подтверждённая кодовая готовность

| Обещание из `99_PROGRESS.md` | Доказательство |
| --- | --- |
| Service auth и Retail polling | `gpt-version/src/server/saby-client.ts:20-61`: OAuth, повтор при 401, пагинация по 100, `pointId`, интервал. Тест `saby-client.test.ts:4-25`. |
| Durable ledger, cursor и reconciliation runs | миграция `012_saby_sales.sql:9-108`; обработка и cursor `saby-sync-service.ts:42-76,132-153`. |
| Webhook — только сигнал | endpoint с проверкой секрета: `index.ts:665-672`; запись сигнала: `saby-sync-service.ts:28-40`; worker немедленно синхронизируется при pending-сигнале: `saby-worker.ts:20-39`. |
| Поздние удаления, изменения, возвраты, идемпотентность | revision-delta и компенсация: `saby-sync-service.ts:134-176`; проверены тестом `saby-sync-service.test.ts:44-58`. |
| Mapping/backfill, роли, аудит, outbox | mapping/backfill/audit: `saby-sync-service.ts:92-120,180-220`; permission и UI: `012_saby_sales.sql:1-4`, `index.ts:674-701`, `SabyPage.tsx:9-61`. |
| Штучный stock и защита весового/инвентаризации | `saby-sync-service.ts:156-177`; базовые случаи покрыты `saby-sync-service.test.ts:33-70`. |
| Отдельный worker и release artifact | `saby-worker.ts`, scripts/build: `package.json:14-18`; artifact проверяется `release-artifact-smoke.test.ts:32-35`. |

## Разделение готовности

- **Внутренняя кодовая готовность:** частичная; два P1 и один P2 в `02_PROBLEMS.md`.
- **Внешняя активация:** не подтверждена и не выполнялась. Это отдельная задача, не причина скрывать внутренние P1.

