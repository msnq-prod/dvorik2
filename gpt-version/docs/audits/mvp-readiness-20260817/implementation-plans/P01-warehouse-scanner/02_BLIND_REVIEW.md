# P01 — Blind architecture review

## Verdict

Choose **Option A**, with two constraints:

1. Use Option C only as a pre-cutover dark/read-only verification stage, never as the shipped MVP outcome.
2. Reduce the first write contract to `resolve`, `create-with-code`, and `bind-code`; defer `unbind/reassign` unless an audited ownership-transfer workflow is specified.

Option A is the only alternative that can meet the required external-Warehouse workflow without creating a second product-identity authority. It is **not implementation-ready as drafted**: the standalone Warehouse has no production migration runner, the Core-to-Warehouse product mapping is unspecified, scanner symbology is lost before the domain boundary, and the FIFO command mapping for every visible UI action is not defined.

## Option comparison

| Criterion | A — Warehouse native | B — Core registry | C — Read-only |
|---|---|---|---|
| Urgent MVP outcome | Meets it after full UI/API cutover | Can appear faster, but unknown-code creation remains a distributed write | Fails the required unknown-code and stock-action workflow |
| Source of truth | Correct: Warehouse owns product and identifier | Incorrect: Core owns identifier while Warehouse owns product | Unresolved unless Warehouse is still made canonical |
| Migration risk | Higher one-time risk, bounded by a verified import | Lower initial schema effort, permanent drift/orphan risk | Defers rather than removes migration risk |
| Failure modes | Local unique constraint and transaction can contain races | Network split between bind/create/action creates partial state | Operational dead end for unknown codes |
| Testability | Deterministic service and topology tests | Requires distributed consistency/failure tests indefinitely | Easy to test, but tests the wrong outcome |
| Rollout/reversibility | Safe with additive schema, feature gate and no legacy fallback | Rollback preserves ambiguous split ownership | Easy rollout, no compliant completion path |

**Reject B.** Reusing Core lookup is not a harmless shortcut: it makes Core a live registry for Warehouse entities and requires a cross-service transaction for create-with-code. Stale and orphan mappings become normal operating states.

**Reject C as the final release.** It is acceptable only to validate imported identifiers and device reads before enabling mutations.

## Required contract and invariants

### Source of truth

- Warehouse is the sole authority for barcode ownership, resolution, product status and stock mutation in external mode.
- Core authenticates, authorizes and proxies. It must not resolve from, write to, cache-fallback to, or silently reconcile against the legacy Core catalog.
- A canonical code resolves to at most one Warehouse product. Define explicitly whether archived products reserve codes; safest MVP rule is global reservation with an explicit conflict, not silent reuse.
- `create-with-code` is one Warehouse transaction. A product must never remain created without its requested code after a failed command.
- `bind-code` is atomic and concurrency-safe. A unique-constraint race must return a stable `CODE_ALREADY_BOUND` conflict identifying no sensitive data.
- `unbind/reassign` is not needed for the stated outcome. If retained, require elevated permission, reason, audit record, expected version, and an explicit rule for stock-bearing/archived products.

### Barcode contract

- Lock an exact server allowlist of symbologies. “EAN/Code128 and equivalent linear codes” is too ambiguous for schema, validation or acceptance tests.
- Normalization must be format-specific and shared by import, resolve and mutation. Do not reuse locale lowercasing: Code128 can be case-sensitive, and leading zeroes must be preserved.
- Define length, character set, EAN check-digit behavior, surrounding whitespace, maximum payload size, and whether cross-format textual aliases are equivalent. Store original value plus canonical lookup value and declared format.
- QR rejection must happen before lookup/bind and must also be enforced server-side. The current scanner callback carries only text, so the decoder result must retain its format/provenance. A QR-looking string cannot be distinguished reliably after format is discarded.
- Keyboard-wedge/custom-event input has no trustworthy symbology metadata. Either define a separate validated linear-input contract and test real devices, or exclude it explicitly from P01 acceptance.

### Authorization and capabilities

- Preserve `products:scan_manage` for create/bind; do not accidentally broaden it to generic `products:write`. Stock commands retain their own `stock:move` / `inventory:write` checks.
- Capabilities must be per action and permission-aware, for example contract version, resolve, create, bind, receive, write-off, adjust and supported formats. `warehouseWriteMode: "fifo"` alone cannot safely drive the UI.
- Capability discovery must fail closed when Warehouse is unavailable or its contract version is unsupported.
- Core must send actor identity to Warehouse only after authorization; Warehouse must record actor, command key and audit data for identifier mutations.

## Missing command mapping

The draft says to rewire “supported FIFO commands” but does not say what each visible scanner action means. This must be fixed before implementation:

| Current visible action | Required external-mode decision |
|---|---|
| Приход | Map to a real FIFO supply/lot command with supplier, date and cost inputs. Do not disguise receipt as a positive adjustment. Hide it if the required accounting inputs are unavailable. |
| Переместить | Hide; location transfer is explicitly excluded. This includes seller-specific and buffered transfer paths. |
| Брак / списание | Map to Warehouse write-off with quantity and required reason. |
| Корректировка | Map to Warehouse adjustment; positive adjustment must collect the cost required to create a valid lot. |
| Инвентаризация | Hide; full sessions are explicitly excluded. |
| Reverse/journal actions | Hide unless Warehouse has an explicit compensating command and audit contract. Never call legacy reversal. |

The external-mode page must load Warehouse catalog, balances and journal consistently, not combine a Warehouse scan result with Core locations, totals or history. “Every visible action works” is the acceptance invariant; unsupported controls must not render.

## Migration and rollout corrections

The draft's “add schema and backfill” step is insufficient:

1. Add a **Warehouse-owned migration mechanism** and schema-readiness check before identifier code. Current standalone Warehouse startup opens an existing file directly, while Compose only copies the seed database when the volume is empty. Existing volumes therefore need an explicit, repeatable migration path.
2. Make the migration additive and back up the Warehouse database before applying it. Verify restore in rehearsal.
3. Define an immutable Core-product to Warehouse-product crosswalk. Never match by name/article heuristics. Stop on missing, duplicate or ambiguous mappings.
4. Run a dry-run export using the new normalization rules. Report invalid format, collision, missing target, inactive target and already-different-owner rows.
5. Freeze legacy identifier writes for the cutover window, take a final snapshot, then import idempotently in a Warehouse transaction or checkpointed batches.
6. Verify row counts, canonical-value digest, referential integrity, uniqueness, and sample plus exhaustive resolve equivalence before enabling scanner reads.
7. Deploy schema/API first with scanner writes disabled; run C-like read-only shadow verification; then enable action capabilities by flag.
8. Do not roll back to legacy Core writes in external mode. Operational rollback means disable scanner mutations, keep the additive data, and run compatible prior application code. Any reverse data migration needs a separately approved procedure.

The existing Warehouse seed schema and runtime path must be tested directly; service tests backed by the Core migration set are not proof that an existing production Warehouse volume can accept the new schema.

## Failure and idempotency requirements

- Require idempotency keys on every identifier and stock mutation. The UI must retain the same key across timeout/retry; generating a new UUID on each resubmission does not protect an uncertain result.
- Same key + same canonical request returns the original response; same key + different request returns a conflict.
- Preserve domain HTTP semantics through Warehouse and Core: invalid/unsupported format, not found, inactive product, ownership conflict, forbidden, unavailable and timeout must not all collapse to generic 422.
- A Warehouse outage must show an unavailable/retry state and must never fall back to Core reads or writes.
- Define scan de-duplication separately from command idempotency. The current short client debounce is not a transaction guarantee.
- Return the authoritative post-command product/balance so the UI does not claim success from stale Core state.

## Verification and release gates

- Unit/property tests for the normalization corpus, leading zeroes, Code128 case, EAN check digits, size limits, unsupported formats and QR rejection.
- Repository/service tests for create-with-code rollback, concurrent binds, inactive products, global uniqueness, replay and idempotency-payload mismatch.
- Proxy tests for every permission combination, actor propagation, error/status preservation, timeout and no legacy fallback.
- UI tests generated from the action-capability matrix: every rendered action reaches only a Warehouse route; excluded actions are absent in external mode.
- External-topology E2E for known scan, unknown create, bind existing, duplicate conflict, retry after lost response, write-off, positive/negative adjustment and any retained receipt flow.
- Network assertions that no scanner-originated request reaches legacy product, balance, stock-operation, inventory-session or reversal writes.
- Existing-volume migration rehearsal from a production-shaped backup, including collision abort and restore drill.
- Real HTTPS acceptance on supported iOS/Android Telegram and browsers, with allow/deny/retry/visibility camera cases. Test each claimed hardware scanner separately.
- Release remains blocked until Warehouse readiness includes schema version and identifier-import verification, not only FIFO balance reconciliation.

## Unsafe assumptions challenged

- The presence of `product_identifiers` in the shared Core schema does not prove it exists or migrates correctly in the standalone Warehouse database.
- Matching Core barcodes to Warehouse products by shared IDs is not guaranteed by the draft and must be proven with a crosswalk.
- “Linear code” cannot be inferred safely from arbitrary decoded text after the decoder format is discarded.
- A positive correction is not automatically a valid receipt; FIFO cost/lot provenance is part of the stock contract.
- Hiding only transfer and full inventory is insufficient; legacy totals, journal, reverse, buffered and seller-specific paths can still expose disabled writes.
- A successful isolated Warehouse `/ready` response does not prove Core proxy authorization, scanner behavior or end-to-end action routing.

## Required-changes checklist

- [ ] Adopt A; limit C to shadow rollout; reject B.
- [ ] Specify exact symbologies, normalization and QR rejection contract.
- [ ] Add Warehouse migration/readiness support for existing volumes.
- [ ] Define and verify the Core-to-Warehouse product crosswalk.
- [ ] Make create-with-code/bind atomic, audited and idempotent; defer unbind/reassign.
- [ ] Define the complete external-mode UI action-to-command matrix.
- [ ] Add permission-aware, versioned, fail-closed capabilities.
- [ ] Preserve stable errors and retry keys through UI, Core and Warehouse.
- [ ] Prove no legacy fallback/write path with topology E2E and network assertions.
- [ ] Rehearse migration, collision abort, staged enablement and operational rollback.
