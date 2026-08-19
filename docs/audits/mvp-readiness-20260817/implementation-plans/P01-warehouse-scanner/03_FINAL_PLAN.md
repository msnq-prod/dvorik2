# P01 — Final implementation plan

## Decision

Use Warehouse-native identifiers (Option A), with a read-only shadow stage from Option C. Core authenticates, authorizes and proxies only. MVP supports EAN-8, EAN-13, Code 128 and a versioned Dvorik product QR. Core registry Option B is rejected.

## Frozen scan contract

Client sends `POST /api/warehouse/scan/resolve` with `{ rawValue, format, source }`; `source` is telemetry and never trusted for validation.

| API format | Server contract |
|---|---|
| `EAN_8` | exactly 8 ASCII digits, valid check digit, no trim; leading zeroes preserved |
| `EAN_13` | exactly 13 ASCII digits, valid check digit, no trim; leading zeroes preserved |
| `CODE_128` | decoded printable ASCII `0x20–0x7E`, length 1–80, case-sensitive, no controls; FNC1/GS1 excluded from MVP |
| `QR_CODE` | anchored ASCII `^dvorik:product:v1:[A-Za-z0-9_-]{22}$` only |

QR token is unpadded canonical base64url of exactly 16 CSPRNG bytes. No trimming, Unicode normalization, case conversion, padding or percent decoding is allowed. ZXing names map only to these enums; UPC-A and all other formats return `SCAN_FORMAT_UNSUPPORTED`.

Linear uniqueness is global by canonical text across the three allowed linear formats: the same decoded text can never belong to different products. QR has its own namespace. Bind/create accept structured `{ rawValue, format }`, linear only, and use the same normalizer as import/resolve.

- Unknown linear → `LINEAR_NOT_FOUND`, allowing permitted create/bind.
- Valid but unknown Dvorik QR → `QR_PRODUCT_NOT_FOUND`, never create/bind.
- Arbitrary QR → `QR_PAYLOAD_UNSUPPORTED` before lookup.

Camera callback must preserve exact decoded text and symbology. Keyboard-wedge/custom-event scanning is outside MVP because it cannot prove format.

## Warehouse data invariants

Add a versioned Warehouse migration and runner, never constructor-time `CREATE TABLE`:

- product FK; kind, format, original/canonical value, status, immutable creator/time, version and audit record;
- CHECKs for allowed kind/format combinations and non-empty canonical value;
- unique linear canonical value globally; unique QR token globally; exactly one Dvorik QR per active product;
- identifiers remain reserved after archive; no delete, unbind, reassignment or token rotation in MVP;
- every active migrated/new product receives its QR eagerly. Product creation + QR issuance and create-with-linear-code are one transaction;
- concurrent ensure/reprint converges on the same token; CSPRNG collision retries before commit.

Readiness verifies exact schema/checksum, indexes/constraints, completed identifier manifest, one QR per active product and zero unresolved collisions.

## Endpoint and permission matrix

| Endpoint/action | Result | Permission | Capability |
|---|---|---|---|
| `POST /api/warehouse/scan/resolve` | product, status, balances, applicable actions | `products:read` | `scan.resolve` |
| `POST /api/warehouse/products/quick-scan` | atomic product + linear code + QR | `products:scan_manage` | `scan.create` |
| `POST /api/warehouse/products/:id/identifiers` | bind linear code | `products:scan_manage` | `scan.bind` |
| `GET /api/warehouse/products/:id/qr` | canonical stable QR payload for preview/reprint | `labels:print` + product visibility | `labels.qr` |
| supply draft/accept | FIFO receipt with supplier/date/cost | `stock:move` | `stock.receive` |
| write-off | FIFO deduction with reason | `stock:move` | `stock.write_off` |
| adjustment | positive/negative correction with reason/cost rules | `inventory:write` | `stock.adjust` |

Capabilities are the server-computed intersection of contract version, external mode, feature flag, Warehouse readiness, role permission, product status and action applicability. Missing/failed capability fetch renders no mutation control. Client values never grant capability.

Warehouse/Core preserve typed `400/404/409/410/422/503/504`, domain code and `retryable`. Warehouse outage never falls back to Core. Core passes the authorized actor; identifier/stock commands audit actor and correlation.

## Phase 1 — Migration and backfill

1. Add additive Warehouse migration/preflight and backup-before-migrate for clean and existing volumes.
2. Build immutable Core→Warehouse product crosswalk from approved IDs/import manifest; no name/article heuristic.
3. Dry-run final normalizer and report invalid format, missing/ambiguous/inactive target, collision and ownership conflict.
4. Freeze every legacy catalogue/identifier write, capture final delta, import idempotently and generate QR for every active product.
5. Verify row counts, canonical digest, FK/uniqueness, exhaustive old→new linear resolve and QR uniqueness; restore rehearsal must pass.

**Exit:** Warehouse is declared authoritative with zero unresolved rows; legacy registry becomes audit-only.

## Phase 2 — Service, proxy and retry semantics

1. Implement Warehouse transactions/routes and signed Core client/proxy for the matrix above.
2. Require idempotency key for every mutation; retain request hash, actor, status/body and result at least seven days.
3. Same key + same actor/canonical request returns original status/body. Different actor/request returns 409.
4. UI creates one key when an action begins and retains it through timeout, retry, background/resume and lost response until definitive outcome. A new scan cannot replace an unresolved mutation.
5. Return authoritative post-command product/balance/journal state.

**Exit:** bind/bind, create/bind, QR ensure/reprint, archive/resolve and timeout-after-commit races are deterministic with no orphan product/identifier.

## Phase 3 — Page-wide web-app cutover

Refactor external-mode `StockPage`, `InventoryPage` and `LabelsPage`, including toolbars, row actions, work buffer, scanner card, dialogs, deep links, shortcuts and empty/error states.

- Warehouse-only catalogue, balance, lots, journal, identifiers and label product source.
- Receipt/write-off/adjustment open Warehouse forms and commands.
- Transfer, reverse, full inventory, legacy buffer and location/seller actions do not render and cannot be invoked directly.
- Seller/admin/super-admin rendered-control inventories are explicit and tested.
- Post-command refresh uses Warehouse state only.

**Exit:** no external-mode request or visible action across these pages uses legacy catalogue, balance, stock, inventory, reversal or label-product sources; direct legacy route attempts remain denied.

## Phase 4 — QR label deliverable

Warehouse returns the canonical payload; Core/client never constructs it. Preview, PDF and reprint embed QR with minimum 25 mm printed size, four-module quiet zone, black-on-white contrast and error correction M. Reprint after restart/restore preserves the exact payload.

**Exit:** preview, generated PDF and a real printed label scan on supported iOS/Android resolve to the same Warehouse product.

## Phase 5 — Staged rollout and rollback

1. Deploy schema/API with all scanner mutations disabled.
2. Observability-only shadow lookup cannot change response, fall back or write either registry.
3. Read-only pilot proves camera formats and generated Dvorik QR.
4. Enable create/bind pilot; verify permissions, collisions and lost-response retries.
5. Enable stock actions; verify refreshed Warehouse state and zero legacy requests across all three pages.
6. Rollback drill disables all new capabilities while retaining identifiers/QR; never deletes tokens or enables Core writes.

## Mandatory verification

- Property/contract tests for all exact formats, QR grammar, unsupported values and ZXing mapping.
- Migration tests for constraints, active-product QR completeness, existing volume, collision abort and restore.
- Atomicity/concurrency/idempotency/status-preservation tests.
- Role/action/capability UI matrix and direct-route denial.
- External-topology E2E for linear known/unknown/bind, generated QR, arbitrary/unknown QR, receipt, write-off, adjustment, retry and authoritative refresh.
- Network assertions across Stock/Inventory/Labels prove zero legacy path.
- Real HTTPS Telegram/browser device matrix: permission, deny/retry, background/resume, EAN-8/EAN-13/Code128 and printed Dvorik QR.
