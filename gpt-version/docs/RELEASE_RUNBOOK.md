# Staged release runbook

## Preconditions

1. Собрать immutable artifact на target architecture: `npm ci && npm run verify:release`.
   Сохранить release version, SHA-256 `dist/index.js`, `dist/public` и
   `dist/migrations`; не переносить native modules между архитектурами.
2. Подать production config только через secret store. Обязательны SQLite path,
   timezone, release version, session/Telegram/object-storage secrets и разные
   существующие writable media/backup directories. JSON state и dev tools
   запрещены.
3. Перед окном сохранить output `npm run db:migrate -- --dry-run`. Dry-run не
   создаёт migration/checksum tables и сообщает `unrecordedApplied` отдельно.
4. Проверить `GET /healthz`, `GET /live`, `GET /ready`. Health/liveness не
   заменяют readiness: только `/ready` проверяет БД, схему и outbox leases.

## Backup job

После сборки запускать `npm run job:backup` внешним планировщиком. Обязательны
`DVORIK_SQLITE_FILE` и `DVORIK_BACKUP_DIR`; `DVORIK_MEDIA_DIR` добавляет media.
`DVORIK_BACKUP_RETENTION_DAYS` по умолчанию 31, `DVORIK_BACKUP_MIN_FREE_BYTES`
задаёт минимально допустимое свободное место. Job проверяет bundle, удаляет
только валидные bundle старше retention и пишет один JSON event в stdout/stderr.
Ненулевой exit code должен быть сигналом внешнего мониторинга. Планировщик,
внешнее хранилище и production alerting не входят в текущий scope.

## Cutover

1. Создать SQLite+media backup bundle через защищённый `POST /api/backups` и
   проверить manifest/restore-preflight в новом пути. Сохранить имя bundle.
2. Остановить legacy writers and workers; не допускается параллельная запись.
3. Запустить `node dist/index.js` с новым SQLite path. Startup применяет только
   pending checksummed migrations before `listen`.
4. Read-only smoke: `/healthz`, `/live` и `/ready` = 200, `DVORIK_DEV_TOOLS` routes = 404,
   точные schema versions, нет expired outbox leases.
5. Reversible write smoke: один idempotent product/stock command с audit/outbox,
   затем его reversal; проверить committed state после restart/reload.
6. Запустить `npm run worker:telegram`, отправить разрешённое onboarding/outbox
   событие и проверить sent/retry state. Deferred types должны остаться
   недоступны в UI/API/worker.
7. Сначала дать доступ оператору, затем всем пользователям. В hypercare следить
   за `/ready`, structured logs, rate-limit/security metrics и outbox backlog.
8. После окна создать второй backup bundle, выполнить restore-preflight и
   перевести legacy storage в read-only.

## Rollback threshold

Немедленно остановить current writer/worker и восстановить bundle в новый path,
если `/ready` != 200, checksum/invariant/backup verification fails, committed
write не переживает restart, outbox теряет/дублирует событие или Telegram smoke
получает terminal failure. Старый path не перезаписывать; сохранить logs и
failed SQLite copy для расследования.

## Graceful stop

SIGTERM/SIGINT должен завершиться code 0: listener закрывается, затем SQLite
connection checkpoint/close. Forced timeout — 10 секунд.
