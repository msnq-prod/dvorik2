# P01 — Warehouse + scanner contract

## Outcome

In mandatory external-Warehouse production mode, a permitted worker can scan a known or unknown product code and complete every visible stock action without touching disabled legacy Core stock/catalog writes.

## In scope

- Warehouse-owned identifiers and scan resolution.
- Core proxy and permission boundary.
- FIFO-mode Stock/Inventory scanner UX and capability gating.
- Barcode normalization, uniqueness, idempotency, errors and tests.

## Explicit MVP decision

The MVP must support both linear product barcodes and a versioned Dvorik product QR. Arbitrary QR URLs/JSON/text, physical-location transfer, and full inventory sessions are excluded. QR is resolved only when its payload matches the approved product contract.

## Evidence

- `../../agents/A01-warehouse/02_PROBLEMS.md`
- `../../agents/A02-scanner-webapp/02_PROBLEMS.md`
- `../../03_CROSS_AREA_MAP.md`
