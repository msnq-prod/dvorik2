# ADR 002: Telegram webhook и transactional outbox

Дата: 2026-07-10. Статус: принято.

## Решение

Telegram adapter размещается в current Node API как webhook endpoint с проверкой webhook secret. Он валидирует и дедуплицирует `update_id`, затем вызывает те же application services, что и WebApp. Bot не читает и не пишет БД напрямую.

Все исходящие Telegram и WebApp уведомления создаются в `outbox_messages` в транзакции с породившим их событием. Отдельный worker забирает сообщения, отправляет их и переводит в `sent` либо планирует повтор с backoff; после лимита попыток сообщение получает `failed` и доступно для ручного повтора.

## Причины

Повтор webhook и временная ошибка Telegram не должны повторять операцию или терять уведомление. Общие services сохраняют одинаковые правила прав, audit, idempotency и расписания во всех каналах.

## Контракт эксплуатации

- Входящий update считается обработанным только после фиксации дедупликации и результата команды.
- Уникальный ключ: Telegram `update_id`; для исходящего события — стабильный business event/idempotency key.
- Worker не меняет доменные данные, кроме статуса outbox и технических метаданных доставки.
- Onboarding создаёт пользователя `pending`; approve переводит его в `active` и отзывает невалидные сессии, reject — в `rejected`. Неактивные статусы не имеют доступа к данным.
- Daily digest вычисляется в `Asia/Vladivostok`; настройки: `off`, `instant`, `daily`.

## Последствия

- Нужны таблицы deduplicated updates, outbox_messages и notification_preferences, наблюдаемые администратором.
- HTTP-ответ webhook не зависит от успешности внешней отправки Telegram.
- Прототипный Telegram WebApp auth сохраняется, но не заменяет bot runtime.
