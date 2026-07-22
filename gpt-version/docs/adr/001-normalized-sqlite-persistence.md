# ADR 001: нормализованный SQLite и repositories

Дата: 2026-07-10. Статус: принято.

## Решение

Production persistence строится на нормализованной SQLite-схеме с версионными миграциями и repository layer. Application services получают repositories через интерфейсы и не обращаются к глобальному `AppState`, JSON payload или SQL напрямую. SQLite adapter должен быть заменяем PostgreSQL adapter без изменения контрактов application services.

Первыми нормализуются: users/roles/permissions/sessions, products и идентификаторы, locations/balances/operations, shifts/assignments/swaps/schedule_days, imports/jobs, notification preferences/outbox и audit. Внешние current ID и API сохраняются в переходном слое.

## Причины

Текущая таблица `app_state(payload)` и JSON fallback подходят для прототипа, но не дают безопасных транзакций, конкурентных обновлений, выборок и отчётности. Bot, WebApp и worker не могут быть надёжно согласованы при записи одного payload.

## Последствия

- Каждая бизнес-операция имеет одну транзакционную границу, audit и idempotency key.
- Остатки и расписание защищаются optimistic version либо транзакционной блокировкой.
- Миграция из `app_state.payload` выполняется dry-run → backup → commit → проверка инвариантов; повторный запуск безопасен, rollback возвращает исходный файл БД.
- `DVORIK_STATE_FILE` остаётся только для tests/smoke и не является production fallback.

## Отклонённые варианты

- Сохранить единый JSON payload: не решает конкуренцию и мешает росту.
- Сразу перейти на PostgreSQL: увеличивает операционную сложность до подтверждённой потребности; adapter остаётся предусмотренным.
