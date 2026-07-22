# A03 Problems

### P1-A03-01: API не покрывает целевой складской MVP

- **Promise:** склад, смены, маркировки.
- **Reality:** API и schema покрывают loyalty.
- **Evidence:** `shared/schema.ts:53-319`, `docs/crm/README.md:15-20`.
- **Effect:** целевые workflows невозможно реализовать поверх текущего API без новой модели.
- **Cause:** scaffold создан под другой продукт.
- **Status:** confirmed.

### P1-A03-02: Telegram webhooks принимают события, но ничего не делают

- **Promise:** Telegram bot API присутствует.
- **Reality:** handlers только log + OK.
- **Evidence:** `server/routes.ts:825-849`.
- **Effect:** внешняя интеграция может считать webhook успешным, хотя бизнес-действия не выполнены.
- **Cause:** placeholder endpoint.
- **Status:** confirmed.

### P2-A03-03: Нет серверного auth/permission boundary

- **Promise:** admins/cashiers/roles есть в schema.
- **Reality:** routes не показывают middleware auth/role checks на inspected endpoints.
- **Evidence:** `server/routes.ts:30-847`; `client/src/components/app-sidebar.tsx:83-88`.
- **Effect:** API нельзя считать защищенным.
- **Cause:** auth layer не внедрен.
- **Status:** needs verification.

