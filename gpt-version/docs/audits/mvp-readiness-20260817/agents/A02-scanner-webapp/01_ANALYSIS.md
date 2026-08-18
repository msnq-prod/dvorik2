# A02 — Scanner web app: analysis

## Boundary

Camera/external barcode capture, QR handling, mobile layout, scan result, permission-gated actions, API contracts, and their verification. Product code was not changed.

## Inspected path

- Camera: `src/client/src/components/BarcodeScanner.tsx:10-123` dynamically loads `@zxing/browser`, requests the rear camera preference, releases tracks on unmount/visibility change, and prevents duplicate identical detections for 2.5 seconds (`:21-28`, `:46-76`, `:85-101`). ZXing `BrowserMultiFormatReader` can decode barcode formats and QR; the UI and domain call it only a barcode scanner.
- Web UI: `src/client/src/pages/StockPage.tsx:414-488` resolves a scan through `GET /api/products/by-barcode/:barcode`, renders a known item with total/per-location stock and exposes receipt/transfer/write-off/correction actions at `:625-717`.
- Unknown code: users with `products:scan_manage` can create a product or bind it after a confirmation; mutations use `crypto.randomUUID()` idempotency keys (`:442-488`, `:649-687`). Seller has this permission (`src/server/permissions.ts:3-10`).
- Core API: lookup is permission-protected and returns only active items (`src/server/index.ts:957-967`). Creation/binding use `products:scan_manage` but explicitly reject whenever Warehouse is configured (`:969-1007`, `:1100-1119`).
- Production mode requires external Warehouse (`src/server/config.ts:134-156`); the provided modular compose setup enables it (`docker-compose.modular.yml:2-17`). Warehouse has its own catalog routes, but none for barcode lookup/binding (`src/modules/warehouse/routes.ts:41-54`).
- Mobile: the scan workspace becomes one column at 900px and adapts camera/actions through 360px (`src/client/src/styles.css:4388-4597`). Video uses `playsInline` (`BarcodeScanner.tsx:107`).
- Browser prerequisites: camera only starts in a secure context and with `getUserMedia`; blocked/error gets retry, unsupported directs to manual search (`BarcodeScanner.tsx:36-39`, `:70-76`, `:109-120`). Server allows same-origin camera in Permissions-Policy (`src/server/runtime-observability.ts:12-21`).

## Current readiness

- Local/demo lookup, camera UI, scan result, permission checks, and entry into legacy stock actions are implemented.
- This is **not MVP-ready for the required production Warehouse configuration**: a scan can show a core item, but every scan-originated catalog change and the legacy stock-operation submit endpoint are disabled once the required external Warehouse is active.
- `npm run check` passed on 2026-08-17. It proves type consistency, not device/camera or production-contract behaviour.

## Verification present

- E2E fakes a scan with custom browser event and verifies known/unknown rendering plus opening an action dialog: `tests/e2e/ui-readiness.spec.ts:115-135`.
- No scanner component test or device-browser test was found. The sole external scanner integration is the custom `dvorik:barcode-scan` event (`BarcodeScanner.tsx:94-101`).
