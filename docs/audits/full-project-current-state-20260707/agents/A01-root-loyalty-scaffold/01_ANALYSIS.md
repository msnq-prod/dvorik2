# A01 Analysis

## Что проверено

- `git remote -v`: основной repo `msnq-prod/dvorik2`.
- `git status --short`: много существующих untracked папок рядом с tracked-кодом.
- `git ls-files`: tracked-ядро — React/Express/Drizzle scaffold, assets, базовые docs.
- `package.json`: scripts `dev`, `build`, `start`, `check`, `db:push`; стек React 18, Vite, Express, Drizzle, PostgreSQL/Neon.
- `replit.md`: описывает loyalty admin panel.

## Текущее состояние

Корень проекта — админка программы лояльности, а не складская CRM. Склад/смены/маркировки сейчас живут в документации и отдельных локальных папках.

## Evidence

- `package.json:6-12` — доступные scripts.
- `package.json:44-80` — frontend/backend зависимости текущего scaffold.
- `shared/schema.ts:53-319` — домены users/admins/cashiers/discounts/campaigns/broadcasts/settings/event_logs.
- `docs/crm/current-state.md:19-38` — текущие разрывы уже зафиксированы.

