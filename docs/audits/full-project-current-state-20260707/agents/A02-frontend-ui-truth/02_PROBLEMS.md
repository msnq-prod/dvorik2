# A02 Problems

### P1-A02-01: UI показывает не живые данные

- **Promise:** admin panel управляет пользователями/скидками/рассылками.
- **Reality:** ключевые страницы используют mock и отключенные запросы.
- **Evidence:** `client/src/pages/dashboard.tsx:7-19`, `client/src/pages/users.tsx:27-43`.
- **Effect:** экран может создавать ложное ощущение работающей системы.
- **Cause:** scaffold-UI не подключен к API.
- **Status:** confirmed.

### P1-A02-02: Роли на frontend не связаны с auth

- **Promise:** role-based visibility.
- **Reality:** `userRole = "owner"`.
- **Evidence:** `client/src/components/app-sidebar.tsx:83-88`.
- **Effect:** frontend всегда показывает owner-доступ.
- **Cause:** отсутствует auth/session context.
- **Status:** confirmed.

### P2-A02-03: Нет UI целевого склада/смен/маркировок в корне

- **Promise:** целевой MVP из docs/crm.
- **Reality:** routes только loyalty/admin.
- **Evidence:** `client/src/App.tsx:20-29`, `docs/crm/README.md:15-20`.
- **Effect:** корневой UI не покрывает главные бизнес-сценарии.
- **Cause:** предметная модель не внедрена.
- **Status:** confirmed.

