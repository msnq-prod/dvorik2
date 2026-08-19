# P01 — Decision log

| Independent feedback | Decision | Final-plan change |
|---|---|---|
| Warehouse-native Option A; C only shadow | accepted | Canonical Warehouse ownership and staged read-only pilot. |
| Original scope requires QR | accepted | Added exact Dvorik product QR and label delivery; arbitrary QR rejected. |
| Format/normalization ambiguous | accepted | Exact EAN/Code128/QR grammar and ZXing mapping frozen. |
| Database rules not enforceable | accepted | Added migration runner, constraints, eager QR completeness and readiness verifier. |
| Permissions/status flattening unclear | accepted | Added endpoint/permission/capability/status matrix. |
| Scanner-only path check too narrow | accepted | Cut over Stock, Inventory and Labels page-wide for every role/control. |
| Label production unspecified | accepted | Added canonical payload, preview/PDF/print requirements. |
| Retry/cutover incomplete | accepted | Mandatory seven-day idempotency, race tests, freeze/backfill and staged rollback. |
| Core registry Option B | rejected | It would retain split product identity. |
