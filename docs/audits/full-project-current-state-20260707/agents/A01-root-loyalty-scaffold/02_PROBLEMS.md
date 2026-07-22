# A01 Problems

### P1-A01-01: В workspace смешаны три проекта

- **Promise:** один проект Dvorik.
- **Reality:** корневой tracked scaffold, `gpt-version` и `recovered-dvorik` существуют параллельно.
- **Evidence:** `git status --short`; `gpt-version/README.md:1-48`; `recovered-dvorik/README.md:1-14`.
- **Effect:** легко принять прототип или legacy-систему за текущую реализацию.
- **Cause:** нет зафиксированного source-of-truth.
- **Status:** confirmed.

### P1-A01-02: Основной repo не соответствует целевому складскому MVP

- **Promise:** проект магазина со складом, сменами, маркировками.
- **Reality:** tracked-код — loyalty/admin scaffold.
- **Evidence:** `shared/schema.ts:53-319`; `docs/crm/current-state.md:30-38`.
- **Effect:** разработка может идти не в том дереве.
- **Cause:** предметная модель не перенесена в основной scaffold.
- **Status:** confirmed.

