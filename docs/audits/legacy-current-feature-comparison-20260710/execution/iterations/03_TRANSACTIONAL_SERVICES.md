# Итерация 03 — Транзакционные application services

## IDs
`TX-201–207`, `SEC-002`, `FIX-505`, `FIX-508`.

## Ведущий агент
- утверждает command context/idempotency/error contracts;
- владеет stock/inventory/schedule/auth transaction boundaries;
- следит, чтобы audit/idempotency/outbox использовали тот же UoW;
- устраняет nested commits и global state access в переведённых services.

## Параллельные волны

После TX-201/202:
1. Stock/reversal/inventory focused tests и implementation (`TX-203/204`).
2. Schedule/swap concurrency tests и implementation (`TX-206`).
3. Auth/users/onboarding/session repository implementation (`TX-207/SEC-002`).

После интеграции stock:
- `TX-205`, `FIX-505`, `FIX-508`.

## Нельзя делегировать
Idempotency canonical hash, shared command context, transaction composition,
cross-service event contract и финальный concurrency gate.

## Exit gate
- concurrent stock/swap requests дают один корректный result;
- inventory stale row откатывает весь набор;
- archived receipt реактивирует атомарно;
- session rotation/revoke работает между процессами;
- tablet inventory хранит snapshot version;
- fault injection не оставляет business write без audit/outbox.
