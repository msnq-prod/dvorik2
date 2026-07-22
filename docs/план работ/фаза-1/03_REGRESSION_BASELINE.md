# Regression baseline

## Команда

```bash
cd gpt-version
npm run verify:release
```

## Результат 2026-07-20

| Проверка | Результат |
| --- | --- |
| TypeScript `check` | pass |
| Unit/integration/concurrency tests | pass |
| Vite client build | pass |
| Bundled server build | pass |
| SQL migrations copy | pass |
| Production artifact smoke | pass |

Итог: команда завершилась с exit code 0.

## Что доказано

- текущий исходный код типизируется и собирается;
- автоматический regression-набор зелёный;
- миграции и два disposable rollback rehearsal проходят;
- production artifact стартует, отдаёт `/ready`, `/live` и UI;
- dev endpoints отсутствуют в production smoke.

## Что не доказано

- реальные Saby и supplier contracts;
- browser/device E2E и проверка на реальном телефоне;
- production Linux, TLS, supervisor и реальные секреты;
- восстановимость production backup и заявленный RTO;
- бизнес-приёмка продавцами и владельцем.

## Особенность среды

В ограниченном sandbox `tsx` не смог создать локальный IPC socket (`EPERM`).
Повтор той же команды с разрешённым локальным выполнением прошёл полностью.
