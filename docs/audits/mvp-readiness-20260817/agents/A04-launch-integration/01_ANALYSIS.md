# A04 — Launch integration analysis

## Inspected

- `package.json:7-42` — separate Core, Warehouse and Staff processes; build and release command.
- `docker-compose.modular.yml:1-57` — four-service composition with separate named volumes.
- `.env.modular.example:1-11` and `src/server/config.ts:114-157` — production configuration requirements.
- `src/server/release-artifact-smoke.test.ts:13-85` — intended production smoke coverage.

## Traced behavior

- Production Core refuses to start unless Staff and Warehouse are external (`src/server/config.ts:134-137`), with persistent Core paths, object storage, Telegram secrets and a secure cookie.
- Compose config supplies Core-to-Staff/Warehouse URLs and separate database volumes (`docker-compose.modular.yml:7-17`, `23-37`); its environment file supplies shared secrets (`.env.modular.example:1-11`).
- The build produces all four runtime artifacts, including Staff and Warehouse (`package.json:27`); TypeScript and build both passed on 2026-08-17.
- Seed validation passed and reports 32 products, 59 remaining packages, 2 unverified opening lots and 32 company events (`npm run test:warehouse-initial`).

## Readiness

**Conditional / not launch-approved.** The candidate builds and has a modular launch shape, but an actual production composition test is not passing, and configuration/operational cutover has not been demonstrated.
