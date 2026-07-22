# API-контракт MVP

Базовый префикс: `/api/v1`.

## Авторизация

- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`

## Сотрудники и смены

- `GET /employees`
- `POST /employees`
- `GET /employees/:id`
- `PATCH /employees/:id`
- `GET /employees/:id/shifts`
- `GET /shifts`
- `POST /shifts`
- `GET /shifts/:id`
- `PATCH /shifts/:id`
- `POST /shifts/:id/assignments`
- `DELETE /shifts/:id/assignments/:employeeId`
- `POST /shifts/:id/cancel`
- `POST /shifts/copy`

## Товары

- `GET /products`
- `POST /products`
- `GET /products/:id`
- `PATCH /products/:id`
- `POST /products/:id/archive`
- `POST /products/:id/generate-barcode`

## Склад

- `GET /warehouses`
- `GET /stock`
- `GET /stock/low`
- `GET /products/:id/stock-movements`
- `POST /stock-movements/receipt`
- `POST /stock-movements/issue`
- `POST /stock-movements/write-off`
- `POST /stock-movements/adjustment`
- `POST /stock-movements/transfer`
- `POST /inventory-sessions`
- `POST /inventory-sessions/:id/items`
- `POST /inventory-sessions/:id/complete`

## Маркировки

- `GET /label-templates`
- `POST /label-templates`
- `PATCH /label-templates/:id`
- `POST /label-print-jobs`
- `GET /label-print-jobs`
- `GET /label-print-jobs/:id`
- `GET /label-print-jobs/:id/pdf`
- `POST /label-print-jobs/:id/reprint`

## Аудит и дашборд

- `GET /dashboard`
- `GET /audit-logs`

## Общие правила

- ответы списков: `{ items, total, limit, offset }`;
- серверный лимит `limit <= 100`;
- даты передаются в ISO 8601;
- ошибки: `{ code, message, details? }`;
- повторная отправка складской операции защищается `Idempotency-Key`;
- endpoint печати возвращает задание, а PDF формируется синхронно для малых заданий или фоново для больших;
- все изменяющие endpoint'ы требуют авторизации и проверки роли.
