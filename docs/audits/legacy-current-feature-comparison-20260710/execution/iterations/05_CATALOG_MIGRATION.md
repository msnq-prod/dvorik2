# Итерация 05 — Import/catalog persistence и отказ от AppState

## IDs
`TX-208`, `TX-209`, `DB-107–109`, `FIX-506`, `IMP-801–809`,
`MIG-403–406`, `BKR-401`.

## Contract checkpoint
- immutable import preview/action model;
- supplier identity/SKU uniqueness/quantity rules;
- query repository pagination contracts;
- merge/archive/label transaction boundaries;
- non-destructive converter и invariant report;
- точка окончательного отключения runtime AppState.

## Субагенты
1. Import parser/fixtures/UI mapping после утверждения preview DTO.
2. Query repositories/search/report baselines без изменения contracts.
3. Migration fixtures/invariant verifier/backup integrity tests.

Ведущий агент реализует commit/undo transactions, converter policy и `DB-109`.

## Integration order
TX-208/209 → query repositories → import features/FIX-506 → migration dry-run/
mapping/idempotence → backup/invariants → удалить full-state runtime.

## Exit gate
- import последняя ошибка не даёт partial commit;
- supplier SKU receipt не создаёт duplicate product;
- API/worker видят normalized writes;
- `rg` не находит runtime global `db`/`stateTransaction`;
- converter повторяем, backup проходит integrity.
