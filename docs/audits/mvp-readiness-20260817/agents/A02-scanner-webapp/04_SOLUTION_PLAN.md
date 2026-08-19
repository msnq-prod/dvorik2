# A02 — Scanner web app: solution plan

## Recommended MVP contract

1. Define one scan envelope at the client boundary: `{ value, format }`, where format is reported by ZXing/hardware bridge.
2. For MVP, accept only EAN/Code128 (and other linear formats used on labels) as product barcodes. Treat QR separately; do not silently save arbitrary QR text as a barcode.
3. Choose one QR policy before launch:
   - **Recommended:** QR is out of MVP scanning scope. Decode it, show “QR not supported for warehouse product lookup”, preserve manual search. This keeps the release safe.
   - If QR is required: use a versioned, signed product-reference payload such as `dvorik:product:v1:<productId>:<signature>`; resolve it only through Warehouse and reject all other QR payloads.

## Required architecture changes before production launch

1. Make Warehouse the sole scan contract owner in external mode:
   - `GET /api/warehouse/products/by-barcode/:value` (or one `POST /api/warehouse/scan/resolve` for barcode + QR envelope);
   - barcode binding and quick-product creation under Warehouse, protected by the explicit intended permission;
   - stock commands selected from a scan must use Warehouse receipt/write-off/adjustment APIs or be removed until supported. Transfer needs a Warehouse command before showing it.
2. Update `StockPage` to select this contract consistently; eliminate calls to Core endpoints disabled in Warehouse mode. The response must contain product identity, active status, identifiers, and current warehouse balances/actions supported.
3. Preserve idempotency on every mutation. Conflict responses must keep the scanned value visible and offer a safe retry/re-resolve action.
4. Make capability-driven UI: API/runtime reports supported scan actions; do not render a button whose submit route cannot exist in that topology.

## Input and UX

1. Keep camera as primary mobile input. Improve error message to name the actual host context (Telegram/browser/OS/HTTPS) and show manual search as an explicit action.
2. Decide device support. For common keyboard-wedge scanners, add an intentionally scoped scan-input capture component (buffer + terminator + timing) that is disabled while editing fields/dialogs. Otherwise remove implied support and document camera-only operation.
3. Keep existing responsive one-column layout; add a clear “scan next” state after a completed action and ensure no duplicate action can be submitted during resolve/mutation.

## Tests and rollout

1. Add contract/integration tests in external Warehouse mode for known code, unknown code, bind/create permission, duplicate barcode, QR rejection/resolve, and every displayed stock action.
2. Add UI tests for action capability gating, known/unknown rendering, keyboard-wedge input if supported, and blocked/unsupported camera states (mock media devices).
3. Release behind a small warehouse pilot. Record device/browser/Telegram version and scan success/error rate; do not expand until all acceptance cases below pass.

## Trade-off

Fastest durable route is barcode-only scanner MVP plus a Warehouse-owned barcode API. QR product semantics and keyboard-wedge support can follow after their contracts are agreed; they should not be approximated by storing arbitrary decoded values.
