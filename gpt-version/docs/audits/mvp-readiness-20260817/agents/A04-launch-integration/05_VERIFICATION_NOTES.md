# A04 — Verification notes

## Executed

- `npm run check` — passed.
- `npm run build` — passed; Core, Warehouse, Staff and Cash artifacts built.
- `npm run test:warehouse-initial` — passed technically; output retained two unverified opening lots.
- `npm run test:release-artifact` — did not reach its success output. First run was prevented by sandbox IPC restrictions; an approved rerun emitted Node's unsettled top-level-await warning at `release-artifact-smoke.test.ts:78`.

## Residual risk

- No live full-compose or physical-device test was run.
- Current tree has significant pre-existing modifications; no product code was changed by this audit.
