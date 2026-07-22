# A02 Analysis

## Что проверено

- `client/src/App.tsx`
- `client/src/components/app-sidebar.tsx`
- `client/src/pages/*.tsx`
- поиск `enabled: false`, `mock`, `TODO`.

## Текущее состояние

Frontend показывает admin UI для loyalty-доменов: главная, пользователи, скидки, кассиры, рассылки, кампании, логи, настройки. Складских экранов в корневом UI нет.

Большинство экранов не ходят в API: React Query есть, но отключен через `enabled: false`, данные локальные mock.

## Evidence

- `client/src/App.tsx:20-29` — список routes.
- `client/src/components/app-sidebar.tsx:25-80` — меню loyalty/admin.
- `client/src/components/app-sidebar.tsx:83-88` — роль захардкожена как `owner`.
- `client/src/pages/dashboard.tsx:7-19` — TODO, disabled query, mockStats.
- `client/src/pages/users.tsx:27-43` — disabled query, mockUsers.

