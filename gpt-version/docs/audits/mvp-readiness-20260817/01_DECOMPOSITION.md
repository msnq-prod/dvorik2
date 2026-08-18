# Decomposition

## A01: Warehouse MVP

- **Boundary:** catalogue, FIFO stock, supplies, write-offs, reconciliation, UI/API, migrations and runtime.
- **Likely files/routes:** `src/modules/warehouse/`, `src/warehouse/`, `src/client/src/pages/{Dashboard,Stock,Inventory,Products}Page.tsx`.
- **Core questions:** can real stock be seeded, received, adjusted and reconciled safely?
- **Risk focus:** balance/FIFO divergence, cutover, authorization, data initialization and runtime dependencies.
- **Assigned artifact folder:** `agents/A01-warehouse/`.

## A02: Scanner web app MVP

- **Boundary:** browser camera scanner, product resolution, scan actions, permissions and mobile readiness.
- **Likely files/routes:** `src/client/src/components/BarcodeScanner.tsx`, `src/client/src/pages/InventoryPage.tsx`, scanner API routes and E2E tests.
- **Core questions:** does a scan reliably lead to a permitted, actionable product flow on a phone?
- **Risk focus:** QR versus supported symbologies, camera errors, duplicate scans, unknown codes, auth and production transport.
- **Assigned artifact folder:** `agents/A02-scanner-webapp/`.

## A03: Employee management MVP

- **Boundary:** identity, roles, employee profiles, onboarding, sessions, staff service and staff UI.
- **Likely files/routes:** `src/staff/`, `src/server/{identity-service,permissions,staff-client}.ts`, `src/client/src/pages/{Users,Schedule}Page.tsx`.
- **Core questions:** can an admin create, grant, revoke and operate employee access without unsafe coupling?
- **Risk focus:** role enforcement, onboarding path, service migration/cutover, session revocation, core/staff contracts.
- **Assigned artifact folder:** `agents/A03-employee-management/`.

## A04: MVP integration and launch gate

- **Boundary:** application composition, authentication, database/migrations, configuration, health, build/test/release evidence.
- **Likely files/routes:** `README.md`, `docker-compose.modular.yml`, `src/server/{index,config,runtime-observability}.ts`, release tests.
- **Core questions:** which architecture mode is actually launchable, and which shared prerequisites block all areas?
- **Risk focus:** dirty candidate state, missing environment configuration, migration order, independent services, operational checks.
- **Assigned artifact folder:** `agents/A04-launch-integration/`.
