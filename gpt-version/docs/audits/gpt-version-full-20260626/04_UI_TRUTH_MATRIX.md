# UI Truth Matrix

| UI element | UI says | Based on | Real source of truth | Match? | Evidence |
|---|---|---|---|---|---|
| User selector | User is current actor | demo login response | HttpOnly cookie session | Yes for demo mode | `src/client/src/main.tsx`, `src/server/index.ts` |
| Dashboard current shift | Employees today | server summary | Current `Asia/Vladivostok` date | Yes | `src/server/index.ts` |
| Stock success | `Операция применена` | API success | Domain operation | Yes for happy path | `src/client/src/main.tsx:244` |
| Inventory success | `Инвентаризация применена` | API success | `applyInventory` rejects invalid actual values before mutation | Yes | `src/server/domain.ts`, `src/client/src/main.tsx` |
| Labels print | `Печать / PDF` | PDF endpoint success | Downloaded `application/pdf`, saved print job | Yes | `src/client/src/main.tsx`, `src/server/index.ts` |
| Labels barcode | Code 128/EAN-13 preview | API barcode pattern | `src/server/barcodes.ts` pattern used by preview and PDF | Yes | `src/client/src/main.tsx`, `src/server/index.ts`, `src/server/barcodes.ts` |
| A4 preview title | `Предпросмотр A4` | hardcoded UI text | Russian UI requirement | Yes | `src/client/src/main.tsx` |
| Operation list | Russian operation label | label mapping | Russian UI requirement | Yes | `src/client/src/main.tsx` |
| Schedule exchange controls | Create/accept/decline/cancel | API-backed controls | Swap lifecycle endpoints | Yes | `src/client/src/main.tsx`, `src/server/domain.ts` |
| Users/Audit page | Shows permission error | route catches error | backend permission | Yes | `src/client/src/main.tsx:484`, `src/client/src/main.tsx:498` |
| Disabled print | Disabled until preview | local preview truth | preview can contain overflow | Partial | `src/client/src/main.tsx:425` |
