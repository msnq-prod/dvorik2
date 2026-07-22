# Reuse / rework / remove matrix

Первичная классификация. Она не разрешает запуск B02–B10 до прохождения gates.

| Контур | Решение | Основание |
| --- | --- | --- |
| Runtime config и production guards | reuse | fail-fast конфигурация и запрет JSON state |
| SQLite adapter и migrations | reuse | checksums, FK/WAL, rehearsal tests |
| Repositories, UoW, command context | reuse/extend | уже покрывают ключевые mutation-контуры |
| Idempotency, audit, SQLite outbox | reuse/extend | есть контракты и concurrency/retry tests |
| Session и identity services | reuse/extend | hardened cookie и отзыв сессий реализованы |
| Stock, inventory, reversal services | reuse/extend | рабочие SQLite-команды с тестами |
| Schedule/swap service | reuse/extend | основной lifecycle реализован |
| React shell и responsive navigation | reuse/rework | пригодная база, нужны ролевые сценарии B09 |
| Catalog route handlers с прямым SQL | rework | перенести mutation в application service |
| Labels и media | reuse/rework | рабочие, но часть SQL остаётся в transport |
| Reports | reuse/rework | базовые отчёты есть, финансовая модель ещё вне scope текущего runtime |
| Import поставок | rework | legacy-only и заблокирован; нужен реальный fixture catalog |
| Merge/undo | rework | legacy-only и заблокирован; нужен новый транзакционный контракт |
| Archive/rotation/future replacement/buffer | re-evaluate | заблокированы и не подтверждены как первый release scope |
| Daily digest | rework | entrypoint есть, функция отключена |
| `AppState` production use | remove/forbid | production уже защищён; удалить остаточные fallbacks после паритета |
| `recovered-dvorik` runtime dependency | forbid | только исторический reference |

## Следующее уточнение

Матрица обновляется после traceability и проверки критических пользовательских
сценариев. Удаление legacy-кода до этого запрещено.
