# A04 Problems

### P1-A04-01: В проекте несколько competing source-of-truth документов

- **Promise:** документация описывает проект.
- **Reality:** `replit.md` описывает loyalty panel, `docs/crm` описывает будущий warehouse CRM, `gpt-version/README.md` описывает отдельный прототип.
- **Evidence:** `replit.md`, `docs/crm/README.md:1-31`, `gpt-version/README.md:34-52`.
- **Effect:** непонятно, что строить дальше.
- **Cause:** документы создавались под разные этапы.
- **Status:** confirmed.

### P2-A04-02: Требования есть, но не закреплены как главная дорожная карта

- **Promise:** CRM docs задают MVP.
- **Reality:** корневой README/replit still loyalty-first.
- **Evidence:** `docs/crm/README.md:15-31`; `docs/crm/current-state.md:21-38`.
- **Effect:** разработчик может продолжать loyalty scaffold вместо складского продукта.
- **Cause:** нет верхнеуровневого project-state doc.
- **Status:** confirmed.

