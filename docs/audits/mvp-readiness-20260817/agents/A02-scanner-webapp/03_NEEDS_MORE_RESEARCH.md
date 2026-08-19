# A02 — Scanner web app: needs more research

1. Decide the QR business identifier before implementation: product barcode only, product UUID, warehouse lot, storage location, or signed URL. Record exact payload/version/error behaviour.
2. Run the actual production topology (`DVORIK_WAREHOUSE_MODE=external`) and prove the full scan → lookup → stock action and unknown-code resolution flows. Current code evidence predicts 410 responses for scan mutations/actions.
3. Test at least one supported iOS Telegram WebApp, Android Telegram WebApp, and standalone mobile browser over production HTTPS: first permission, deny/retry, rear-camera choice, app background/foreground, known/unknown decode, and a printed QR plus EAN/Code128 label.
4. Identify the warehouse device input contract. If keyboard-wedge scanners are in scope, test suffix/prefix and focus-loss behavior; if a native/Telegram bridge is intended, document and implement its producer for `dvorik:barcode-scan`.
5. Confirm authorization policy: seller currently has `products:scan_manage` and can create/bind catalog records (`src/server/permissions.ts:3-10`). Validate this against operational separation-of-duties.
