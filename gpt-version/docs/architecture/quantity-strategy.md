# Quantity strategy

Дата: 2026-07-12. Decision ID: `DB-103`.

## Canonical representation

- Normalized DB canonical value: integer minor units, scale `1000`.
- API/current domain compatibility shape: human-unit `number`, accepted/emitted only through `src/shared/quantity.ts`.
- `шт`: integer major units only (`minor % 1000 = 0`).
- `кг`, `л`, `м`: up to three decimal places.
- Range: `0..9,000,000,000,000` minor for balances/thresholds; operations must be positive.
- Arithmetic converts operands to minor integers before add/subtract, preventing cumulative float drift.

Migration v3 adds canonical `*_minor INTEGER` columns. Existing REAL columns are
compatibility mirrors until repository cutover (`DB-105/106`); triggers reject
precision loss, divergence, invalid unit reassignment and product-id reassignment.

## Explicit deferrals

- Comma/unit-suffixed import parsing belongs to `IMP-804`; DB-103 accepts dot-decimal input only.
- UI mixed-unit aggregate redesign belongs to product/UI blocks; server mutations and reports remain converter-normalized.
- Runtime `AppState` remains transitional until repository/UoW cutover; this decision does not claim normalized DB is already runtime source of truth.
