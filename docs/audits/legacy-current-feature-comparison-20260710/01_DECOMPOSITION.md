# Decomposition

## A01: Legacy Bot And Calendar

- **Boundary:** Telegram UX, calendar/schedule, product lookup, stock/inventory, reports and notifications in `recovered-dvorik/app`.
- **Likely files/routes:** `app/handlers/*`, `app/services/schedule*.py`, `app/ui/*`, `app/routers.py`, relevant tests.
- **Core questions:** what the bot lets a worker do end-to-end; why the calendar feels useful; what current lacks.
- **Risk focus:** hidden business rules, chat-first interaction quality, authorization and stale state.
- **Assigned artifact folder:** `agents/A01-legacy-bot-calendar/`

## A02: Legacy Admin And Operational Workflows

- **Boundary:** Flask admin surfaces and their backing services in `recovered-dvorik/admin_ui` plus linked service calls.
- **Likely files/routes:** `admin_ui/templates/*`, `admin_ui/static/css/*`, `admin_ui/blueprints/*`, `app/services/*`.
- **Core questions:** which admin workflows and visual patterns are more mature; which capabilities are absent or weaker in current.
- **Risk focus:** UI promise vs real persistence, destructive actions, import safety and operational density.
- **Assigned artifact folder:** `agents/A02-legacy-admin/`

## A03: Current Product And Admin

- **Boundary:** current `gpt-version` React/Express application, including UI, routes, domain and persistence.
- **Likely files/routes:** `src/client/src/*`, `src/server/*`, `src/shared/types.ts`, tests and package scripts.
- **Core questions:** what current already improves; what it regressed or omitted relative to legacy; which concepts can absorb legacy behavior.
- **Risk focus:** prototype-only behavior, missing Telegram surface, state model, permissions, restore/undo semantics.
- **Assigned artifact folder:** `agents/A03-current-product/`

## A04: Visual Comparison And Merge Strategy

- **Boundary:** live browser capture of representative admin/schedule screens plus cross-version feature matrix.
- **Likely targets:** local legacy Flask admin and current Vite/Express UI.
- **Core questions:** what is visibly stronger in each version; what to copy, adapt, or explicitly reject; migration order.
- **Risk focus:** mixing incompatible architecture, copying style without workflow, losing current safety guarantees.
- **Assigned artifact folder:** `agents/A04-visual-merge/`

