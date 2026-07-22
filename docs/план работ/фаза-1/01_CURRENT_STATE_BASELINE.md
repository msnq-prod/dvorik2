# Current-state baseline `gpt-version`

Дата: 2026-07-20. Основание: статический анализ исходников и успешный полный
регрессионный прогон. Production-развёртывание не подтверждалось.

## Техническая база

| Область | Фактическое состояние |
| --- | --- |
| Runtime | Node.js, TypeScript, Express, React/Vite |
| Persistence | SQLite; 7 checksummed migrations после schema v1 |
| API | 71 объявление HTTP-маршрута в `src/server/index.ts` |
| UI | 11 page-компонентов; 9 разделов подключены к основной навигации |
| Проверки | 44 test-файла; typecheck, test, build и artifact smoke |
| Workers | постоянный Telegram outbox worker; daily digest отключён; вспомогательные worker-файлы используются concurrency-тестами |
| Роли | seller, admin, super_admin; 12 permissions |

## Источники истины

- Production-путь открывает SQLite, применяет migrations и использует
  repositories/UoW для сессий, identity, склада, инвентаризации и расписания.
- `AppState` загружается только через динамический `legacy-runtime` вне
  production. В production `DVORIK_STATE_FILE` запрещён.
- Dev без `DVORIK_SQLITE_FILE` сохраняет совместимость через `AppState`.
- Import, merge, archive sweep, tablet buffer, schedule rotation, future
  replacement, external media URL и Telegram-доставка отчётов закрыты общей
  launch allowlist и возвращают `FEATURE_DISABLED`.
- `recovered-dvorik` не входит в runtime и остаётся read-only reference.

## Рабочие контуры

- Telegram/Web session и немедленный отзыв сессии при изменении identity.
- Каталог, изображения, остатки и движения.
- Инвентаризация и reversal с idempotency/concurrency tests.
- График и обмен сменами.
- CSV/PDF отчёты, этикетки, audit и SQLite backup bundle/preflight.
- Health/readiness/metrics, production config validation и graceful shutdown.

## Legacy-зависимости

| Зависимость | Production | Решение |
| --- | --- | --- |
| `legacy-runtime.ts`, `domain.ts`, `store.ts`, `reports.ts`, `telegram.ts` | динамически не загружаются | сохранить для dev/regression до замены или удаления по отдельным контрактам |
| `AppState` в route fallbacks | недоступен при рабочем SQLite service | удалить после подтверждения паритета dev/test-контуров |
| import/merge и прочие deferred routes | остановлены до handler | переработать в B04/B09, не включать как готовые |
| daily digest | возвращает `FEATURE_DISABLED` | post-launch scheduler, вне независимого B09 scope |

## Найденные расхождения документации

- `gpt-version/docs/PROJECT_STATE.md` одновременно заявляет завершённый
  production cutover на SQLite и ниже описывает весь runtime как `AppState`.
- README перечисляет import/merge как реализованные, но текущая launch allowlist
  блокирует их API, а основная UI-навигация их не показывает.

До обновления этих документов источником истины считаются runtime-код,
`launch-scope.ts` и результаты проверок.

## Вывод

Эволюционная доработка технически оправдана: перепись не требуется. Базовые
транзакционные механизмы уже есть, но статус каждого workflow нужно принимать
отдельно; наличие исходников не равно доступности функции в текущем runtime.
