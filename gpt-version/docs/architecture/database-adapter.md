# Database adapter decision

Дата: 2026-07-12. Decision ID: `DB-101`.

## Решение

- Driver: `better-sqlite3` 12.x, in-process, synchronous.
- Runtime: Node.js 22+; native dependency устанавливается на target architecture, а не копируется между macOS/Linux.
- Contract: prepared `query`, parameterized `execute`, synchronous `transaction`, idempotent `close`; privileged `executeScript` используется migration/converter boundary.
- Transaction callback не может возвращать Promise. Callback получает context без `transaction`/`close`, поэтому nested independent commit недоступен.
- Ошибки имеют stable operation/code и не включают SQL или bound parameters.

## Проверенная среда

- macOS Darwin arm64, Node 22.18: adapter, migrations, converter and bundled production artifact smoke passed.
- esbuild оставляет native dependency external; SQL migrations копируются в `dist/migrations`.
- Linux не является текущей personal-project target environment. Перед Linux release обязателен clean install/build/adapter smoke на точной architecture.

Connection PRAGMA, WAL, busy timeout, synchronous mode и schema/readiness policy относятся к `DB-102`.

## Connection policy (`DB-102`)

- На каждом connection: `foreign_keys=ON`, `journal_mode=WAL`, `busy_timeout=5000`, `synchronous=NORMAL`.
- Writer contention использует только bounded SQLite busy wait; скрытых application retries нет.
- Readiness требует точный набор schema versions и rollback-only metadata write probe.
- Privileged script после успеха/ошибки восстанавливает connection policy; незавершённая script transaction откатывается.
- Graceful HTTP shutdown прекращает приём запросов, закрывает dev runtime, checkpoint WAL и connection; SIGINT/SIGTERM idempotent.
