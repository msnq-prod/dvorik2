# EPIC-P6 — Release verification suites

## Статус

- `done`; P0; dependencies `EPIC-P1..P5`.

## Цель

Consolidate production contract, migration/rollback, multi-process and release
smoke suites into reproducible evidence.

## Evidence criteria

- suite list maps to required `TST-1301..1314` release-relevant IDs;
- full focused gate is green from clean runtime state;
- known deferred functionality has negative production evidence.

## Checkpoint

- Core, resilience and security suites are included in `npm test`.
- `verify:release` runs check, full tests, build and the built-artifact smoke.
- Browser smoke covered catalog read, reports and PDF export; rendered A4 PDF
  was inspected. HTTP/client suites cover the remaining authenticated flows.
