# A06 Problems

### P2-A06-01: Legacy/reference система на другом стеке

- **Promise:** текущий стек менять нельзя / корень React + Express + Drizzle.
- **Reality:** recovered version Python 3.12 + aiogram + Flask + SQLite.
- **Evidence:** `recovered-dvorik/README.md:1-3`, `recovered-dvorik/README.md:34-38`.
- **Effect:** нельзя просто объявить ее текущим продуктом без stack decision.
- **Cause:** восстановленная отдельная реализация.
- **Status:** confirmed.

### P2-A06-02: Бизнес-логика ценная, но не интегрирована

- **Promise:** складские процессы должны быть в основном продукте.
- **Reality:** реализованные процессы находятся в recovered reference.
- **Evidence:** `recovered-dvorik/README.md:5-14`, `recovered-dvorik/docs/architecture.md:8-21`.
- **Effect:** риск повторно изобрести уже решенные сценарии.
- **Cause:** нет migration map from Python to TS/Postgres.
- **Status:** confirmed.

