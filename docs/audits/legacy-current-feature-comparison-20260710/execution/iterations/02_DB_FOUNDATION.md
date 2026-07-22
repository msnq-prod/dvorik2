# Итерация 02 — SQLite/UoW/repository foundation

## IDs
`DB-101–106`, `MIG-401`, `MIG-402`, `TST-1301`, `TST-1303`.

## Contract checkpoint ведущего
- конкретный SQLite driver и deployment compatibility;
- connection pragmas/busy policy;
- quantity strategy `DB-103`;
- UnitOfWork nested-call rule;
- repository interfaces и mapper conventions;
- schema migration metadata/checksum.

До checkpoint запрещена параллельная реализация repositories.

## Субагенты после checkpoint
1. Test harness + two-connection/fault fixtures.
2. User/session/product mapper+round-trip tests.
3. Stock/schedule/workflow mapper+constraint tests.

Субагенты не меняют UoW interface, migration order и shared quantity contract.

## Integration order
Driver/config → migration metadata/schema → UoW → interfaces → mappers →
two-connection tests. Каждый mapper интегрируется отдельно.

## Exit gate
- нет sqlite subprocess в runtime path;
- FK/WAL/busy timeout доказаны;
- rollback atomic на настоящей DB;
- round-trip всех текущих сущностей;
- isolated tests не трогают project data;
- check/test/build.
