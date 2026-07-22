# A03 Solution Plan

1. Не расширять loyalty schema хаотично.
2. Выбрать целевую модель: PostgreSQL root schema или перенос из `gpt-version`.
3. Сначала ввести auth/session/permissions.
4. Затем добавить домены: staff, products, locations, stock_operations, balances/view, shifts, label_jobs, audit.
5. Все destructive/stock operations делать через append-only movement log and idempotency.

