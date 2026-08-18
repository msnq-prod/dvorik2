# Scope

## Goal

Determine whether the current project can be launched urgently as an MVP consisting of: warehouse operations, a web app with QR/barcode scanning, and employee management.

## Included

- Warehouse catalogue, balances, receiving, write-off, inventory, and operational deployment.
- Scanner UX, camera capability, scan-to-product flow, and access control.
- Employee identities, roles, onboarding, staff profiles, shifts, and deployment.
- The API, persistence, tests, runtime configuration, and cross-area dependencies needed for those flows.

## Excluded

- Product-code changes, production deployment, external account activation, payroll, and Saby/cash rollout except where they block the three MVP areas.

## Assumptions and constraints

- The active candidate is `gpt-version/`; the parent worktree contains extensive pre-existing staged deletions and uncommitted changes, which will not be altered.
- This is audit and launch-planning only. Runtime tests may be run read-only; no production data or external services will be touched.

## Success criterion

For each MVP area: a readiness status, evidence, confirmed launch blockers, verification gaps, and a minimal ordered launch path.
