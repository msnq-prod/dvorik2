# A02 — Scanner web app: problems

### P1-A02-01: Production scanner actions target disabled legacy endpoints

- **Promise:** Scan result lets the worker create/bind an item and make stock operations (`src/client/src/pages/StockPage.tsx:442-488`, `:707-711`).
- **Reality:** Production requires external Warehouse (`src/server/config.ts:134-137`; `docker-compose.modular.yml:13-14`). In that mode `POST /api/products/quick-scan` and `POST /api/products/:id/barcodes` return 410 (`src/server/index.ts:969-973`, `:1100-1103`); legacy stock operations are likewise disabled (`src/server/index.ts:1304`, `:1331`, `:1447`). The web client has no Warehouse barcode endpoint to use.
- **Effect:** Required warehouse + scanner workflow cannot complete in the only permitted production topology. Unknown codes cannot be resolved in-app; receipt/transfer/write-off/correction launched from a scan fail on submit.
- **Cause:** UI remains wired to Core legacy catalog/stock contracts while Warehouse is the configured production owner; Warehouse routes cover catalog listing/creation but not barcode lookup/binding (`src/modules/warehouse/routes.ts:41-54`).
- **Status:** confirmed.

### P1-A02-02: QR scanning has no product-level contract

- **Promise:** User requested a QR scanner; the implementation uses ZXing multi-format decode (`src/client/src/components/BarcodeScanner.tsx:46-63`).
- **Reality:** A decoded value is always passed unchanged into a barcode-only lookup (`src/client/src/pages/StockPage.tsx:423-430`; `src/server/index.ts:957-965`). There is no QR payload schema, route, entity identifier, UI wording, or test. QR values that are not an already-stored barcode only reach the unknown-barcode flow, where they may be persisted as a barcode.
- **Effect:** QR is technically decoded but not a defined or reliable business workflow. A warehouse QR containing URL/JSON/lot/product reference will not resolve as intended and may be incorrectly bound as a barcode.
- **Cause:** Capture technology was mistaken for a QR domain contract.
- **Status:** confirmed.

### P2-A02-03: Hardware scanner support is test-only integration, not a deployed interface

- **Promise:** The screen supports scanning in an operational warehouse.
- **Reality:** Non-camera input is only a window custom event, `dvorik:barcode-scan` (`src/client/src/components/BarcodeScanner.tsx:94-101`). The only E2E scan test dispatches that event directly (`tests/e2e/ui-readiness.spec.ts:118`, `:124`). A common USB/Bluetooth keyboard-wedge scanner emits keystrokes + Enter, not this app-specific event; no input-capture flow or documented integration was found.
- **Effect:** Physical scanner compatibility is unknown and likely absent without a separate integration layer; automated test can pass while a real scanner does nothing useful.
- **Cause:** Test injection was made the only external-scanner boundary.
- **Status:** confirmed for absence of a keyboard-wedge path; compatibility with a particular device needs device testing.

### P2-A02-04: Camera permission guidance is Telegram-specific and device failure coverage is thin

- **Promise:** Blocked/unsupported camera state is recoverable (`src/client/src/components/BarcodeScanner.tsx:109-120`).
- **Reality:** Browser access is correctly gated on HTTPS/getUserMedia (`:36-39`) and errors are classified minimally (`:70-76`), but the blocked text says only “Разрешите Telegram доступ к камере” (`:114`). No test covers browser permission denial, unavailable rear camera, retry, visibility restart, HTTPS, or actual camera decoding. The E2E test only asserts a visible scanner shell and synthetic event (`tests/e2e/ui-readiness.spec.ts:115-135`).
- **Effect:** Launch support will not distinguish Telegram, browser, OS, or HTTPS setup failures; camera regression can ship undetected.
- **Cause:** Device/runtime conditions are outside the current automated suite and no manual acceptance gate is recorded.
- **Status:** confirmed.
