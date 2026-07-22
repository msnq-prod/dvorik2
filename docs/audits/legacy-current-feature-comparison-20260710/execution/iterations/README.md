# Крупные итерации

Эти пакеты предназначены для ведущей модели с субагентами. Они не заменяют
атомарные карточки: внутри каждой итерации каждый ID получает отдельное evidence.

## Порядок

| Итерация | Фокус | Главный gate |
|---|---|---|
| 00 | Baseline, решения, production guards | факты/решения актуальны, dev bypass закрыт |
| 01 | Подтверждённые независимые дефекты | contract/UI regressions закрыты |
| 02 | SQLite, UoW, repositories foundation | настоящая DB transaction и test harness |
| 03 | Транзакционные application services | stock/schedule/auth atomicity |
| 04 | Outbox, security, observability | multi-process delivery без stuck/loss |
| 05 | Import/catalog persistence и migration | runtime больше не зависит от AppState |
| 06 | Schedule, Telegram, notifications, search | Web/bot parity |
| 07 | Reports, archive, merge, media | полные lifecycle и artifacts |
| 08 | Tablet, UI, accessibility, browser E2E | cross-device critical flows |
| 09 | Rehearsal, backup, release, rollback | production go/no-go evidence |

Следующая итерация не открывается, пока exit gate предыдущей не доказан, кроме
явно независимой read-only разведки или fixtures.
