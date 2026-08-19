# P01 — Independent QR scope review

## Verdict

**Changes required before approval.** Warehouse-native identity and the Dvorik QR namespace are the correct direction, and the candidate closes the original architectural error of treating arbitrary QR text as a barcode. It is not yet an implementation-ready contract: permissions, exact Code 128/QR canonicalization, QR label production, page-wide legacy removal, mandatory retry semantics, and cutover gates remain underspecified. Those gaps can still produce an MVP in which QR resolves in a test while visible Warehouse actions fail or route to legacy Core.

## What is sound

- Warehouse is the sole product-identifier owner; Core is only the authenticated/authorized proxy.
- QR is explicitly a product identifier, not authentication, and arbitrary QR payloads are rejected.
- Archived products retain reservations and resolve as inactive.
- Backfill uses an approved crosswalk, blocks collisions, and has no heuristic name/article matching.
- Rollback disables Warehouse capabilities and never re-enables legacy writes.
- Physical-device, external-topology, migration, concurrency and lost-response tests are included.

## Required changes

### R1 — Freeze a complete scan and identifier contract

The plan names formats but does not yet define enough to make import, bind, camera decode and resolve identical.

Add the following to Phase 1:

- Exact QR grammar: anchored ASCII `^dvorik:product:v1:[A-Za-z0-9_-]{22}$`; unpadded canonical base64url encoding of exactly 16 CSPRNG bytes; no trimming, Unicode normalization, alternate case, padding or percent decoding. Generate with a cryptographic RNG and retry the unique-key collision.
- Server validation must not trust client `format` or `source`. It must validate the raw value against the declared symbology contract; `source` is telemetry only.
- Define Code 128 as decoded text, maximum length, accepted character repertoire, control-character policy, and explicit handling or rejection of FNC1/GS1. “Preserves case” alone is insufficient.
- Define how ZXing format names map to API enums, including UPC-A/EAN-13 behavior. Unsupported symbologies must fail before lookup.
- State whether uniqueness is per physical `(format, canonical_value)` or global canonical text. The current unique pair permits the same text to belong to different products when printed as EAN-13 and Code 128; this must be an explicit business decision and reflected in the “one code, one product” gate.
- Bind/create commands accept structured `{ rawValue, format }`, run the same server normalizer as resolve/import, and permit only linear formats. A QR-shaped value must never reach a generic identifier write path.
- A validly shaped but unknown Dvorik QR returns `QR_PRODUCT_NOT_FOUND` and never offers create/bind. Only `LINEAR_NOT_FOUND` enables those actions.

The current scanner discards symbology and trims decoded text (`src/client/src/components/BarcodeScanner.tsx:53-62`), so tests must prove the revised callback preserves both exact text and ZXing format.

### R2 — Make the database invariants enforceable

Expand the migration definition beyond the listed columns:

- Foreign key to Warehouse product, allowed kind/format combinations, non-empty canonical value, and immutable audit fields.
- Unique QR token globally and at most one Dvorik QR identifier per product.
- No delete, unbind, reassignment or token rotation in MVP; archived identifiers remain reserved.
- Define whether every migrated/new product receives a QR eagerly or `ensure-product-QR` creates it lazily. Whichever is selected, creation and concurrent ensure/reprint must converge on the same token.
- QR issuance, linear create/bind and product creation must be in one Warehouse transaction with an audit record. Service-constructor `CREATE TABLE IF NOT EXISTS` is not an acceptable migration path; current Warehouse does this for runtime tables (`src/modules/warehouse/warehouse-service.ts:74-114`).
- Readiness must verify exact schema version, constraints/indexes, completed backfill manifest and zero unresolved collisions, not only database availability.

### R3 — Specify endpoint responses, status preservation and permissions

Add an endpoint/action matrix with request, response, HTTP status, Core permission and capability for resolve, create-with-code, bind, QR ensure/reprint, receipt, write-off and adjustment.

Minimum permission mapping should be explicit:

- resolve/catalog/balance: `products:read`;
- create/bind linear: `products:scan_manage` (or deliberately migrate roles to another named permission);
- QR label issue/reprint: `labels:print` plus product visibility;
- receipt/write-off: `stock:move`;
- adjustment: `inventory:write` unless the product decision intentionally grants it through `stock:move`.

This matters because sellers currently have `products:scan_manage` but not `products:write` (`src/server/permissions.ts:3-25`), while Warehouse product creation currently requires `products:write` (`src/modules/warehouse/routes.ts:46-53`). The current adjustment route uses `stock:move`, but the UI treats correction as inventory permission (`src/modules/warehouse/routes.ts:145-149`; `src/client/src/pages/StockPage.tsx:83-87`).

Capabilities must be the server-computed intersection of deployment mode, feature flag, Warehouse readiness, user permissions, product status and action applicability. The client must never elevate access by sending a capability. Missing/failed capability fetch must render no mutation controls.

The proxy must preserve typed Warehouse status and body, including `400/404/409/410/422/503/504` and a `retryable` signal. Today Warehouse flattens domain failures to 422 and its Core client discards status/body (`src/warehouse/index.ts:23-25`; `src/server/warehouse-client.ts:31-37`), so this is a required contract change, not only a test.

### R4 — Remove legacy paths page-wide, not only from scanner-originated traffic

Change the Phase 4 exit gate from “no scanner-originated legacy request” to **no external-mode StockPage/InventoryPage/LabelsPage request or visible action uses a legacy catalog, balance, stock, inventory, reversal or label-product source**.

The current Stock page loads five legacy read models (`src/client/src/pages/StockPage.tsx:90-105`) and retains buffer apply, stock operations, seller transfer and reversal paths (`:360-390`, `:392-405`, `:614-618`). Its scanner also offers transfer and uses legacy permissions/actions (`:625-711`). Inventory has a partial FIFO branch but a separate permission model (`src/client/src/pages/InventoryPage.tsx:62-85`, `:127-155`). These are hidden failure paths unless the plan names both pages and every role/control explicitly.

Require a role-by-role rendered-control inventory for seller/admin/super-admin, including toolbar shortcuts, row actions, work buffer, scanner card, dialogs, deep-link intents and empty/error states. In external mode:

- receipt, write-off and adjustment must open Warehouse-specific forms and commands;
- transfer, reverse, full inventory, legacy work buffer and location-based seller actions must not render or remain callable;
- bind search and all post-command refreshes use Warehouse catalog/balance/journal only;
- route-policy tests and runtime network-denial tests cover direct calls as well as clicked controls.

### R5 — Make QR label generation a first-class deliverable

“Renderer integration” is too vague for the feature that creates the only valid QR. The current label document renders text only (`src/client/src/label-document.ts:40-101`) and LabelsPage loads a separate label catalog (`src/client/src/pages/LabelsPage.tsx:38-67`).

Define that Warehouse returns the canonical QR payload; Core/client never invents it. Move the label product source to Warehouse in external mode, embed the QR in preview/PDF/reprint, and define minimum printed size, quiet zone, contrast and error-correction level. Acceptance must scan the generated preview/PDF and a real printed label on supported iOS/Android, then resolve it to the same Warehouse product. Reprint must prove byte-identical payload after restart/restore.

### R6 — Strengthen retry and concurrency rules

- Require an idempotency key for every mutation; do not silently execute non-idempotently. Current Warehouse explicitly allows a missing key (`src/modules/warehouse/warehouse-service.ts:540-552`).
- Scope/store request hashes canonically and define retention at least through the operational retry window and rollout. Same key/same canonical request returns the original HTTP status/body; different request or actor returns 409.
- The UI creates one key when an action begins and retains it across timeout, retry, background/resume and lost response until a definitive success or non-retryable failure. A new scan must not overwrite an unresolved mutation.
- Add races for two users binding the same code, create-vs-bind, concurrent QR ensure/reprint, archive-vs-resolve and timeout-after-commit. The losing result must be deterministic and never create an orphan product/identifier.

### R7 — Close the cutover and rollout gap

Clarify that shadow lookup is observability-only: it cannot affect the response, create a Core fallback, or write either registry. Freeze legacy identifier writes **and all legacy catalog paths capable of adding identifiers**, take a final delta, import/verify it, then declare Warehouse authoritative before enabling create/bind.

Add rollout gates:

1. Backup and restore rehearsal on the exact production-shaped Warehouse volume.
2. Zero invalid/unmapped/collision rows; exhaustive old-to-new resolve equivalence and QR uniqueness checks.
3. Warehouse readiness and Core proxy status preserve failures; capability fetch fails closed.
4. Read-only pilot proves supported camera symbologies and generated Dvorik QR on real devices.
5. Create/bind pilot proves permission matrix and concurrency/lost-response behavior.
6. Stock-action pilot proves authoritative refreshed balance/journal and zero legacy requests across Stock, Inventory and Labels.
7. Rollback drill disables all new mutations without deleting identifiers, rotating QR tokens or enabling Core writes.

## Approval gate

P01 can be approved after R1–R7 are incorporated into `03_FINAL_PLAN.md` and the final verification matrix names exact endpoints, roles, UI controls and expected HTTP/domain results. No product-code implementation should begin from the current candidate.
