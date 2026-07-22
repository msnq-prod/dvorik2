# Карта legacy-реализации

Этот файл нужен только для поиска существующего поведения. Он не разрешает копировать старую архитектуру.

## Точки входа

| Область | Legacy-файлы |
|---|---|
| Запуск Telegram-бота | `app/main.py`, `app/routers.py` |
| Telegram UI | `app/handlers/*`, `app/ui/*` |
| Flask CRM | `admin_ui/server.py`, `admin_ui/blueprints/*` |
| База и миграции | `app/db.py` |
| Конфигурация | `app/config.py`, `.env.example` |

## Функции

| Домен | Legacy-файлы | Что можно извлечь |
|---|---|---|
| Авторизация и роли | `app/services/auth.py`, `app/handlers/admin.py`, `app/handlers/registration.py` | Роли, заявка на доступ, Telegram identity |
| Товары | `app/services/products.py`, `app/handlers/product.py`, `app/handlers/product_admin.py` | Поля карточки и старые действия |
| Поиск | `app/services/search.py`, `app/handlers/inline.py` | Нормализация и similarity |
| Фото | `app/services/photos.py` | Загрузка, сжатие и локальный cache |
| Остатки | `app/services/stock.py`, `app/handlers/stock.py` | Старые правила перемещений |
| Инвентаризация | `app/handlers/inventory.py`, `app/services/inventory_ctx.py`, `admin_ui/blueprints/inventory.py` | Выбор локации и корректировки |
| Поставки | `app/services/imports.py`, `app/services/supply_session.py`, `admin_ui/blueprints/supply.py` | Парсеры, mapping, preview, hash |
| Дубли | `app/services/product_merge.py`, `admin_ui/blueprints/cards.py` | Merge/undo и правила выбора полей |
| Отчёты | `app/services/reports.py`, `app/handlers/reports.py`, `admin_ui/blueprints/reports.py` | Подтверждённые выборки |
| Уведомления | `app/services/notify.py`, `app/handlers/notify_ui.py` | Типы событий и daily digest |
| Архив | `app/services/archival.py` | Условия старой автоархивации |
| Расписание | `app/services/schedule.py`, `app/handlers/schedule.py`, `app/services/schedule_report.py` | Назначения, обмены и экспорт |
| Маркировки Dvorik | `admin_ui/blueprints/labels.py`, `admin_ui/templates/labels*.html` | Только старый выбор товаров |
| Reference печати Stones | `/Users/nikitamysnik/Desktop/progs/stones/src/admin/pages/QrPrint.tsx` | Геометрия, preview, PDF |

## Legacy-таблицы

- `product`
- `manufacturer`
- `supplier`
- `supplier_sku`
- `location`
- `stock`
- `user_role`
- `user_notify`
- `event_log`
- `import_log`
- `import_session`
- `product_article_alias`
- `product_name_alias`
- `product_merge_rule`
- `product_merge_log`
- `display_name_exception`
- `schedule_day`
- `schedule_assignment`
- `schedule_transfer_request`
- `schedule_anchor`
- `registration_request`

Новая схема не обязана повторять эти таблицы один к одному.

## Подтверждённые legacy-риски

- Бизнес-правила распределены между handlers, blueprints и services.
- Некоторые UI-пути выполняют SQL напрямую.
- Артикул не уникален, но старые операции иногда используют его как идентификатор.
- Старая схема недостаточно закрепляет FK и `quantity >= 0`.
- Generic table editor обходит доменные проверки.
- Старый большой `AGENTS.md` содержит устаревшие контракты.

## Правило переноса

Для каждой функции агент обязан:

1. Найти legacy-входы по этой карте.
2. Сопоставить их с целевым требованием.
3. Явно перечислить сохранённые и изменённые правила.
4. Написать contract/domain tests.
5. Не переносить обходные пути и прямой SQL.

