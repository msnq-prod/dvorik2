# A02 — Scanner web app: verification notes

## Performed

- `npm run check` — passed (TypeScript only).
- Static trace completed from camera/external input through StockPage and Core/Warehouse APIs.
- Existing E2E test reviewed: it injects `dvorik:barcode-scan`; it does not use camera hardware or external Warehouse mode.

## Launch acceptance gate

1. Production configuration starts with external Warehouse and no scan flow receives a 410/legacy-write-disabled response.
2. Seller scans a known printed barcode; correct item and balances appear; each visible action succeeds or is not displayed.
3. Unknown barcode creates/binds through Warehouse only; repeat scan resolves it; conflict is safe and understandable.
4. Every supported QR payload follows the chosen policy; arbitrary URL/JSON QR cannot create or bind a product.
5. Test current iOS Telegram, Android Telegram, and standalone mobile browser over HTTPS: allow/deny/retry, rear camera, background/resume, known/unknown scan.
6. If keyboard-wedge is supported, validate three physical devices with focus in/out of forms and dialogs.
7. Run external-Warehouse integration and browser E2E suites in CI before rollout.

## Residual risk

Until the production API boundary is unified, local/demo success is not evidence of scanner MVP readiness.
