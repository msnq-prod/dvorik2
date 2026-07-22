# Decomposition

## A01: Root Loyalty Scaffold

- **Boundary:** структура корневого tracked repo, стек, scripts, tracked/untracked границы.
- **Likely files/routes:** `package.json`, `replit.md`, `git ls-files`, `git status --short`.
- **Core questions:** что является основным приложением; что реально входит в репозиторий; что является локальным довеском.
- **Risk focus:** смешение источников правды, ложное ощущение готовности, грязный workspace.
- **Assigned artifact folder:** `agents/A01-root-loyalty-scaffold/`

## A02: Frontend UI Truth

- **Boundary:** React admin pages and navigation.
- **Likely files/routes:** `client/src/App.tsx`, `client/src/components/app-sidebar.tsx`, `client/src/pages/*.tsx`.
- **Core questions:** какие экраны есть; какие подключены к API; где mock/disabled state.
- **Risk focus:** UI promises vs backend reality.
- **Assigned artifact folder:** `agents/A02-frontend-ui-truth/`

## A03: API, Storage, Schema Contract

- **Boundary:** Express routes, Drizzle schema, storage operations.
- **Likely files/routes:** `server/routes.ts`, `server/storage.ts`, `server/db.ts`, `shared/schema.ts`.
- **Core questions:** какие домены реально поддержаны; есть ли auth/roles/Telegram; что отсутствует для склада.
- **Risk focus:** contract mismatch, missing auth, state ownership.
- **Assigned artifact folder:** `agents/A03-api-storage-contract/`

## A04: Docs and Requirements

- **Boundary:** CRM docs, TЗ, prior audits, source specs.
- **Likely files/routes:** `docs/crm/*`, `docs/audits/crm-requirements-20260623/*`, `ТЗ-склад-смены-маркировки/README.md`, `attached_assets/*`.
- **Core questions:** что уже описано; что противоречит коду; что может быть source of truth.
- **Risk focus:** docs drift, duplicated plans, unclear target.
- **Assigned artifact folder:** `agents/A04-docs-requirements/`

## A05: gpt-version Prototype

- **Boundary:** separate TypeScript prototype for warehouse/schedule/labels.
- **Likely files/routes:** `gpt-version/README.md`, `gpt-version/src/server/*`, `gpt-version/src/client/src/pages/*`, `gpt-version/src/shared/types.ts`.
- **Core questions:** что там реализовано; можно ли считать это целевой версией; чем отличается от корня.
- **Risk focus:** parallel implementation, portability, persistence model.
- **Assigned artifact folder:** `agents/A05-gpt-version-prototype/`

## A06: recovered-dvorik Python System

- **Boundary:** recovered Python Telegram bot and Flask admin.
- **Likely files/routes:** `recovered-dvorik/README.md`, `recovered-dvorik/docs/architecture.md`, `recovered-dvorik/app/*`, `recovered-dvorik/admin_ui/*`, tests.
- **Core questions:** какие реальные бизнес-процессы уже были в Python; что можно использовать как reference.
- **Risk focus:** stack split, migration risk, source-of-truth conflict.
- **Assigned artifact folder:** `agents/A06-recovered-python-system/`
