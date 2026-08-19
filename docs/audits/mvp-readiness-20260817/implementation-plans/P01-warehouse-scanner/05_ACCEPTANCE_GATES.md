# P01 — Acceptance gates

- [ ] Exact EAN-8/EAN-13/Code128/Dvorik-QR contract and ZXing mapping tests pass.
- [ ] Arbitrary/unknown QR can never enter create/bind.
- [ ] Warehouse migration works on clean and existing production-shaped volumes.
- [ ] Every active product has exactly one stable QR; collision/backfill manifest is clean.
- [ ] Endpoint permission/capability/status matrix passes for seller/admin/super-admin.
- [ ] All mutations require durable idempotency and concurrency/lost-response tests pass.
- [ ] Stock, Inventory and Labels use only Warehouse sources/actions in external mode.
- [ ] Transfer/reverse/full inventory/legacy buffer/location paths are absent and directly denied.
- [ ] Preview/PDF/printed QR resolves to the same product; reprint payload survives restart/restore.
- [ ] External-topology E2E passes with authoritative refreshed balance/journal.
- [ ] Real HTTPS iOS/Android Telegram/browser scan matrix passes.
- [ ] Rollback drill disables capabilities without legacy fallback or QR/token loss.
