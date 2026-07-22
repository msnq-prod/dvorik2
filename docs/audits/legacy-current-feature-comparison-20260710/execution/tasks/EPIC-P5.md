# EPIC-P5 — Migration, backup and rollback

## Статус

- `done`; P0; dependencies `EPIC-P4`, `MIG-402`.

## Цель

Close checksummed migration/dry-run/invariant verification and SQLite+WAL+media
backup/restore/rollback rehearsal.

## Evidence criteria

- converter is repeatable and verifier proves exact invariants;
- backup bundle includes SQLite/WAL/media/manifest and restore uses preflight;
- two migration rehearsals and one rollback rehearsal pass.

## Текущий checkpoint

- SQLite bundle uses `VACUUM INTO`, media copy and SHA-256 manifest; verifier
  checks hashes, SQLite integrity and migrations.
- Restore preflight only creates a new database/media path; production API
  create/list/restore-preflight is covered by two-process HTTP regression.
- Migration ledger records SHA-256 per file; dry-run emits applied/pending plan
  and mutation of an applied SQL file deterministically fails verification.
- Accepted: two migration/backup/restore rehearsals and rollback checks pass.
