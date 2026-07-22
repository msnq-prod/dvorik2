# A05 Problems

### P1-A05-01: Самая близкая реализация не является основным repo

- **Promise:** проект в корне.
- **Reality:** целевой warehouse prototype лежит в `gpt-version`.
- **Evidence:** `git status --short`; `gpt-version/README.md:34-48`.
- **Effect:** можно потерять рабочую реализацию или развивать не тот слой.
- **Cause:** параллельная версия без интеграции в основной scaffold.
- **Status:** confirmed.

### P2-A05-02: Persistence model расходится с корневым стеком

- **Promise:** root docs say PostgreSQL/Drizzle.
- **Reality:** `gpt-version` использует SQLite state.
- **Evidence:** `docs/crm/current-state.md:5-8`; `gpt-version/README.md:47-48`.
- **Effect:** перенос потребует миграции доменной модели и API.
- **Cause:** прототип делался как отдельное приложение.
- **Status:** confirmed.

### P2-A05-03: Нет production bot webhooks

- **Promise:** Telegram-oriented workflow.
- **Reality:** production bot webhooks excluded.
- **Evidence:** `gpt-version/README.md:50-52`.
- **Effect:** Telegram production контур придется проектировать отдельно.
- **Cause:** WebApp prototype scope.
- **Status:** confirmed.

