# EPIC-P5 evidence

Дата: 2026-07-15.

## Covered IDs

`MIG-401`, `MIG-403..407`, `BKR-401..404`, `RBK-1401..1403`.

## Result

- Migration ledger stores SHA-256; dry-run reports applied/pending and mutation
  of applied migration fails.
- SQLite bundle uses consistent snapshot, media copy and SHA-256 manifest.
- Restore runs integrity/migration preflight and only writes a new DB/media
  target; live state is never overwritten.

## Gate

- migration checksum, converter and backup integrity tests — pass.
- two independent migration/backup/restore rehearsals — pass.
- post-backup mutation is absent from restored target in both rollback runs.
- production backup API two-process preflight and `npm run build` — pass.
