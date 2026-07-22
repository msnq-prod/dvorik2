# Итерация 04 — Outbox, security и observability

## IDs
`OUT-301–309`, `SEC-303–307`, `OBS-301–304`, `FIX-507`, `TST-1307`, `TST-1309`.

`SEC-308` интегрируется вместе с `MED-1105` в итерации 07, чтобы не создавать
два несовместимых SSRF validator.

## Ведущий агент
- event catalog/inbox-outbox split;
- lease/retry/DLQ/manual retry semantics;
- permission matrix, log schema, health/metric names;
- at-least-once duplicate-risk decision.

## Субагенты
1. Lease/two-worker/crash/reaper test suite.
2. Admin outbox API/UI после фиксации DTO/permissions.
3. Structured logs/health/metrics adapters и security contract tests.

## Integration order
Schema → event resolver → transactional enqueue → claim/lease → retry/DLQ →
worker loop/transport → UI → observability/failure injection.

## Exit gate
- два workers не отправляют один claim одновременно;
- crash processing восстанавливается;
- 429/400/5xx/max attempts корректны;
- admin retry audited, sent не retry;
- readiness/metrics отражают stuck/dead worker;
- role/route contract и security gates зелёные.
