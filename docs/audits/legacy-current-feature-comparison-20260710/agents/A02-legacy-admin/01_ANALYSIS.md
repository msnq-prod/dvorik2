# A02 Analysis — Legacy Admin

## Confirmed strengths

1. **Operational dashboard.** The first screen combines schedule, low-stock attention and stock by location; data is queried directly in `home.index` (`recovered-dvorik/admin_ui/blueprints/home.py:33-96`). Live evidence: `../A04-visual-merge/03-legacy-dashboard.png`.
2. **Dense but coherent dark UI.** The fixed sidebar, compact calendar, attention panel and location cards fit a store manager's scan pattern in one viewport. Two visual themes are exposed.
3. **Dedicated touch workflow.** `/ipad` provides a product buffer, large search, grouped locations and direct transfer/write-off dialogs (`recovered-dvorik/admin_ui/blueprints/home.py:99-151`; `recovered-dvorik/admin_ui/templates/ipad.html:119-296`).
4. **Supplier import maturity.** Legacy detects irregular supplier sheets, supports manual column mapping, supplier-specific SKU identity, duplicate hashes, atomic application and revert (`recovered-dvorik/app/services/imports.py:213-768`, `787-1624`; `recovered-dvorik/admin_ui/blueprints/supply.py:152-559`). Tests cover real supplier layouts, text quantities, units, headerless blocks, duplicate protection and rollback (`recovered-dvorik/tests/test_imports.py:49-369`).
5. **Duplicate discovery.** It proposes similar cards/groups using normalized names, aliases, exception phrases and a score, then offers field-level merge choices and undo (`recovered-dvorik/app/services/search.py:240-500`; `recovered-dvorik/admin_ui/blueprints/cards.py:240-412`).
6. **Reports and lifecycle.** Low/zero/mid/all/archive reports exist in web and Telegram; products can be auto-archived after 30 days at zero stock (`recovered-dvorik/admin_ui/blueprints/reports.py:14-36`; `recovered-dvorik/app/services/archival.py:43-95`).
7. **Local product media.** Admin/bot can receive a Telegram photo, compress/cache it locally and show it on cards. Current accepts only `photoUrl` (`recovered-dvorik/app/handlers/product_admin.py:145-206`; `gpt-version/src/client/src/pages/ProductsPage.tsx:286-301`).
8. **Search is database-backed.** Normalized SQLite tables and FTS5 keep product search server-side (`recovered-dvorik/app/db.py:28-41`, `203-263`).

## What current already does better

- permission-aware navigation and fine-grained roles;
- signed Telegram auth plus HttpOnly sessions;
- domain-specific pages instead of generic tables;
- idempotency, stock reversal, audit trail and backup/restore;
- barcode PDF jobs and reprint history;
- responsive shell and mobile bottom navigation;
- merge/import previews and guarded undo.

## Visual conclusion

The legacy visual is better as an operational cockpit, not as a complete shell. Current should keep its navigation/components but restore the legacy dashboard's information density, dark treatment and manager-first hierarchy.

