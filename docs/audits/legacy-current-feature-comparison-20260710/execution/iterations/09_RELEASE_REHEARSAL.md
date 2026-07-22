# Итерация 09 — Migration rehearsal, backup, release и rollback

## IDs
`BKR-402–404`, `MIG-407`, `TST-1302–1305`, `TST-1309–1314`,
`REL-1401–1408`, `RBK-1401–1403`.

## Входные gates
- normalized runtime единственный source of truth;
- P0/P1 product/security/concurrency gates зелёные;
- outbox/observability/backup готовы;
- production-like обезличенная копия и owners доступны.

## Субагенты
1. Independent invariant/API semantic diff reviewer.
2. Restore/rollback operator rehearsal и timing evidence.
3. E2E/security/performance/visual release evidence audit.

Субагенты не выполняют production cutover и не принимают go/no-go решение.

## Порядок
Release artifact/config → backup/restore drill → две migration rehearsals → full
release gate → timed cutover rehearsal → owner sign-off → production checkpoints →
hypercare → legacy read-only closure.

## Exit gate
- два детерминированных rehearsal;
- exact per-location invariants и semantic API diff;
- restore/rollback внутри RTO;
- copy-pasteable two-branch rollback до/после writes;
- подписанный go/no-go, hypercare и post-cutover backup evidence.
