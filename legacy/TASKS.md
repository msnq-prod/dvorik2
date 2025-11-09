# Детальный План Задач: Система Лояльности "Мармеладный Дворик"

## Фаза 1: Инфраструктура и Настройка Проекта

### 1.1. Конфигурация окружения
- [ ] **Задача 1.1.1**: Заполнить `requirements.txt` необходимыми зависимостями:
  - fastapi, uvicorn[standard]
  - sqlalchemy, alembic, pymysql, cryptography
  - pydantic, pydantic-settings
  - redis, celery[redis]
  - httpx (для Telegram Client)
  - python-jose[cryptography], passlib[bcrypt] (для JWT)
  - pytest, pytest-asyncio (для тестов)

- [ ] **Задача 1.1.2**: Создать `.env.example` с полным набором переменных окружения:
  - DB_URL, REDIS_URL
  - TELEGRAM_MAIN_BOT_TOKEN, TELEGRAM_AUTH_BOT_TOKEN
  - FIRST_SUPERADMIN_TG_ID
  - DEFAULT_BROADCAST_RATE_PER_MINUTE=25
  - INTERNAL_API_KEY
  - TZ=Asia/Vladivostok

- [ ] **Задача 1.1.3**: Настроить `docker-compose.yml` с 5 сервисами:
  - mysql (8.0+, с настройкой TZ=UTC)
  - redis
  - api (FastAPI)
  - worker (Celery Worker)
  - beat (Celery Beat с timezone Asia/Vladivostok)

- [ ] **Задача 1.1.4**: Настроить `alembic.ini` для работы с MySQL
  - Указать sqlalchemy.url из переменной окружения
  - Настроить script_location на alembic/

- [ ] **Задача 1.1.5**: Создать базовую структуру Alembic:
  - `alembic/env.py` с импортом моделей
  - `alembic/script.py.mako` (шаблон миграций)
  - Первая миграция (будет создана позже)

---

## Фаза 2: Модели Данных (SQLAlchemy)

### 2.1. Базовые модели
- [ ] **Задача 2.1.1**: Создать `models/base.py`:
  - BaseModel с полями: id, created_at, updated_at, is_test
  - Миксин для timestamp полей
  - Настройка UTC для всех DATETIME полей

- [ ] **Задача 2.1.2**: Создать `models/user.py`:
  - Поля: telegram_id (PK, BIGINT), username, first_name, last_name
  - display_name, phone, gender (ENUM), birthday (DATE)
  - source, source_normalized (VARCHAR(255), INDEX)
  - tags (JSON, validation: max 20 тегов, max 32 символа на тег)
  - status (ENUM: active, blocked), is_subscribed (BOOL)
  - is_test (TINYINT), created_at, updated_at

- [ ] **Задача 2.1.3**: Создать `models/admin.py`:
  - Поля: telegram_id (BIGINT, UNIQUE), username, display_name
  - role (ENUM: owner, marketing, readonly)
  - can_broadcast_from_chat (TINYINT), is_active (BOOL)
  - notification_groups (JSON)
  - created_at, updated_at

- [ ] **Задача 2.1.4**: Создать `models/cashier.py`:
  - Поля: telegram_id (BIGINT, UNIQUE), display_name
  - is_active (TINYINT, DEFAULT 0)
  - approved_by_admin_id (FK на admins.id)
  - created_at, approved_at

### 2.2. Модели скидок и шаблонов
- [ ] **Задача 2.2.1**: Создать `models/discount_template.py`:
  - Поля: name, template_type (ENUM: subscription, birthday, manual)
  - value_type (ENUM: percent, fixed), value (DECIMAL)
  - validity_days (INT), recurrence (JSON, nullable)
  - usage_type (ENUM: single, shared, DEFAULT single)
  - is_active (BOOL), created_at, updated_at

- [ ] **Задача 2.2.2**: Создать `models/discount.py`:
  - Поля: code (VARCHAR(32), UNIQUE), template_id (FK)
  - user_id (FK на users), expires_at (DATETIME)
  - used_at (DATETIME, nullable), is_active (BOOL)
  - created_at, updated_at, is_test

- [ ] **Задача 2.2.3**: Создать `models/discount_usage_log.py`:
  - Поля: discount_id (FK, nullable), code (VARCHAR(32))
  - cashier_id (FK, nullable), store_id (INT, nullable)
  - status (ENUM: success, already_used, not_found, expired, cashier_not_active)
  - message (VARCHAR(512)), user_not_notified (BOOL)
  - created_at, is_test
  - INDEX на created_at, cashier_id, status

### 2.3. Модели рассылок и сообщений
- [ ] **Задача 2.3.1**: Создать `models/broadcast.py`:
  - Поля: title, content (TEXT), media_type (ENUM: none, photo, video, document)
  - media_file_id (VARCHAR(255)), buttons (JSON)
  - filters (JSON), segment_id (FK, nullable)
  - status (ENUM: draft, scheduled, sending, sent, error)
  - send_at (DATETIME, nullable), sent_at (DATETIME, nullable)
  - recipient_count (INT), success_count (INT), error_count (INT)
  - created_by_admin_id (FK), created_at, updated_at, is_test

- [ ] **Задача 2.3.2**: Создать `models/message_template.py`:
  - Поля: key (VARCHAR(100), UNIQUE), body (TEXT)
  - variables (JSON, список плейсхолдеров)
  - description (VARCHAR(255))
  - created_at, updated_at

- [ ] **Задача 2.3.3**: Создать `models/segment.py`:
  - Поля: name, description, definition (JSON с фильтрами)
  - is_active (BOOL), created_at, updated_at

### 2.4. Системные модели
- [ ] **Задача 2.4.1**: Создать `models/setting.py`:
  - Поля: key (VARCHAR(100), PK), value (TEXT)
  - value_type (ENUM: string, int, bool, json)
  - description (VARCHAR(255))
  - updated_at, updated_by_admin_id (FK)

- [ ] **Задача 2.4.2**: Создать `models/audit_log.py`:
  - Поля: entity_type (VARCHAR(50)), entity_id (BIGINT)
  - action (ENUM: create, update, delete)
  - admin_id (FK, nullable), payload (JSON)
  - created_at, is_test

- [ ] **Задача 2.4.3**: Создать `models/__init__.py`:
  - Импортировать все модели для Alembic

---

## Фаза 3: Миграции Базы Данных

- [ ] **Задача 3.1**: Создать первую миграцию Alembic:
  - `alembic revision --autogenerate -m "initial schema"`
  - Проверить корректность создания всех таблиц, индексов, ENUM типов

- [ ] **Задача 3.2**: Создать миграцию с начальными данными:
  - Добавить дефолтные message_templates (welcome, subscription_success, birthday_greeting, etc.)
  - Добавить дефолтные settings (telegram_channel_id, rate_limit_per_minute=25, birthday_hour=9, etc.)
  - Создать первого superadmin из FIRST_SUPERADMIN_TG_ID

- [ ] **Задача 3.3**: Создать индексы для производительности:
  - users: INDEX на source_normalized, is_subscribed, status, is_test
  - discounts: INDEX на code, user_id, expires_at, used_at, is_test
  - discount_usage_logs: INDEX на created_at, cashier_id, status
  - broadcasts: INDEX на status, send_at

---

## Фаза 4: Pydantic Схемы (DTO)

### 4.1. Схемы пользователей
- [ ] **Задача 4.1.1**: Создать `schemas/user.py`:
  - UserBase, UserCreate, UserUpdate, UserInDB
  - UserPublic (без phone для readonly роли)
  - UserFilter (для фильтрации в списках)
  - Валидаторы: tags (max 20, max 32 символа), birthday формат

- [ ] **Задача 4.1.2**: Создать `schemas/admin.py`:
  - AdminBase, AdminCreate, AdminUpdate, AdminInDB
  - AdminPublic, AdminLogin

### 4.2. Схемы скидок
- [ ] **Задача 4.2.1**: Создать `schemas/discount_template.py`:
  - DiscountTemplateBase, DiscountTemplateCreate, DiscountTemplateUpdate
  - DiscountTemplateInDB, DiscountTemplatePublic
  - Валидатор для recurrence JSON

- [ ] **Задача 4.2.2**: Создать `schemas/discount.py`:
  - DiscountBase, DiscountCreate, DiscountInDB, DiscountPublic
  - DiscountValidationRequest, DiscountValidationResponse
  - DiscountRedeemRequest, DiscountRedeemResponse

- [ ] **Задача 4.2.3**: Создать `schemas/discount_usage_log.py`:
  - DiscountUsageLogBase, DiscountUsageLogInDB, DiscountUsageLogPublic

### 4.3. Схемы рассылок
- [ ] **Задача 4.3.1**: Создать `schemas/broadcast.py`:
  - BroadcastBase, BroadcastCreate, BroadcastUpdate, BroadcastInDB
  - BroadcastPublic, BroadcastStatusUpdate
  - BroadcastFilter, BroadcastSegment

- [ ] **Задача 4.3.2**: Создать `schemas/segment.py`:
  - SegmentBase, SegmentCreate, SegmentUpdate, SegmentInDB
  - SegmentPublic, SegmentDefinition (валидация JSON фильтров)

### 4.4. Служебные схемы
- [ ] **Задача 4.4.1**: Создать `schemas/error.py`:
  - ErrorResponse с полями: code (machine_code), message, details
  - Enum MachineErrorCode со всеми кодами из ТЗ

- [ ] **Задача 4.4.2**: Создать `schemas/auth.py`:
  - LoginTokenRequest, LoginTokenResponse (с JWT)
  - TokenData, TokenPayload

- [ ] **Задача 4.4.3**: Создать `schemas/setting.py`:
  - SettingBase, SettingUpdate, SettingInDB, SettingPublic

---

## Фаза 5: Core Утилиты и Сервисы

### 5.1. Конфигурация и зависимости
- [ ] **Задача 5.1.1**: Создать `core/config.py`:
  - Класс Settings с pydantic-settings
  - Все переменные окружения из ТЗ
  - Валидация обязательных переменных

- [ ] **Задача 5.1.2**: Создать `core/database.py`:
  - Настройка SQLAlchemy engine (async)
  - SessionLocal, get_db dependency
  - Настройка connection pool

- [ ] **Задача 5.1.3**: Создать `core/redis.py`:
  - Подключение к Redis
  - Утилиты для работы с кэшем (get, set, delete)
  - FSM storage для состояний бота (TTL 10 минут)

- [ ] **Задача 5.1.4**: Создать `core/celery_app.py`:
  - Настройка Celery с Redis брокером
  - Конфигурация Beat с timezone Asia/Vladivostok
  - Rate limiting для Telegram API (25/мин)

### 5.2. Безопасность и аутентификация
- [ ] **Задача 5.2.1**: Создать `core/security.py`:
  - Функции для создания и проверки JWT токенов
  - generate_one_time_token() для логина через бот
  - verify_telegram_auth() для webhook

- [ ] **Задача 5.2.2**: Создать `core/dependencies.py`:
  - get_current_admin() dependency с проверкой JWT
  - require_role() dependency для RBAC
  - get_db_session() dependency

### 5.3. Утилиты
- [ ] **Задача 5.3.1**: Создать `core/utils/datetime.py`:
  - Функции для работы с timezone (UTC <-> VVO)
  - normalize_birthday() для парсинга всех форматов ДР

- [ ] **Задача 5.3.2**: Создать `core/utils/code_generator.py`:
  - generate_discount_code(): 3 кириллические буквы + 4 цифры
  - normalize_code() для поиска с учетом префикса и регистра

- [ ] **Задача 5.3.3**: Создать `core/utils/validators.py`:
  - validate_tags() (max 20, max 32 символа)
  - validate_segment_definition() для JSON фильтров
  - validate_phone_number()

---

## Фаза 6: Services (Бизнес-логика)

### 6.1. Сервис пользователей
- [ ] **Задача 6.1.1**: Создать `services/user_service.py`:
  - create_or_update_user(telegram_id, data)
  - get_user_by_telegram_id(telegram_id)
  - update_user_tags(user_id, tags, operation: add/remove)
  - bulk_add_tags(user_ids, tags) - с Celery для больших выборок
  - check_recurrence(user_id, template_type) - проверка повтора скидки

- [ ] **Задача 6.1.2**: Создать `services/subscription_service.py`:
  - check_subscription(telegram_id, channel_id) с кэшем в Redis (30-60 сек)
  - handle_subscription_check(telegram_id) - обновление is_subscribed
  - give_subscription_discount(user_id) с проверкой рекуррентности

### 6.2. Сервис скидок
- [ ] **Задача 6.2.1**: Создать `services/discount_service.py`:
  - create_discount(user_id, template_id) - генерация кода и expires_at
  - validate_discount_code(code, cashier_id) - многоступенчатая валидация
  - redeem_discount(code, cashier_id) - атомарное погашение в транзакции
  - log_discount_usage(discount_id, cashier_id, status, message)

- [ ] **Задача 6.2.2**: Создать `services/template_service.py`:
  - get_active_template(template_type)
  - check_recurrence_rule(user_id, template)
  - calculate_expiry_date(template)

### 6.3. Сервис рассылок
- [ ] **Задача 6.3.1**: Создать `services/broadcast_service.py`:
  - create_broadcast(data, admin_id)
  - get_recipients(broadcast) - выборка с учетом filters/segment_id
  - count_recipients(filters, segment_id) - для подтверждения
  - schedule_broadcast(broadcast_id, send_at)
  - send_broadcast_now(broadcast_id) - ставит задачу в Celery

- [ ] **Задача 6.3.2**: Создать `services/segment_service.py`:
  - evaluate_segment(definition) - SQL запрос на основе JSON
  - validate_segment_definition(definition)
  - get_segment_users(segment_id)

### 6.4. Telegram Client
- [ ] **Задача 6.4.1**: Создать `services/telegram_client.py`:
  - Класс TelegramClient с httpx.AsyncClient
  - send_message(chat_id, text, buttons, reply_markup)
  - send_photo(chat_id, photo_file_id, caption)
  - send_document(chat_id, document_file_id)
  - send_video(chat_id, video_file_id, caption)
  - get_chat_member(chat_id, user_id)
  - answer_callback_query(callback_query_id, text)
  - Обработка ошибок 403 (blocked), 429 (rate limit)

### 6.5. Прочие сервисы
- [ ] **Задача 6.5.1**: Создать `services/admin_service.py`:
  - authenticate_admin(one_time_token) - обмен токена на JWT
  - create_admin(telegram_id, role)
  - activate_cashier(cashier_id, admin_id)

- [ ] **Задача 6.5.2**: Создать `services/message_service.py`:
  - get_message_template(key)
  - render_message(template_key, variables: dict)
  - Поддержка плейсхолдеров: {{first_name}}, {{discount_code}}, etc.

- [ ] **Задача 6.5.3**: Создать `services/audit_service.py`:
  - log_action(entity_type, entity_id, action, admin_id, payload)
  - get_audit_logs(filters)

- [ ] **Задача 6.5.4**: Создать `services/notification_service.py`:
  - notify_admins(group, message) - уведомления админам по group
  - notify_user(user_id, message) - с обработкой 403 (user_not_notified)

---

## Фаза 7: API Endpoints (FastAPI Routers)

### 7.1. Auth и служебные endpoints
- [ ] **Задача 7.1.1**: Создать `routers/auth.py`:
  - POST /api/v1/auth/login-token - обмен токена на JWT
  - GET /api/v1/auth/me - получение информации о текущем админе
  - POST /api/v1/auth/refresh - обновление JWT

- [ ] **Задача 7.1.2**: Создать `routers/webhooks.py`:
  - POST /internal/set-webhooks - установка webhooks (защита INTERNAL_API_KEY)
  - Endpoint устанавливает webhooks для обоих ботов

### 7.2. CRUD endpoints
- [ ] **Задача 7.2.1**: Создать `routers/users.py`:
  - GET /api/v1/users - список (фильтр is_test, пагинация, per_page≤100)
  - GET /api/v1/users/{id} - один пользователь
  - PATCH /api/v1/users/{id} - обновление (tags, gender, birthday, phone)
  - POST /api/v1/users/bulk - массовые действия (add/remove tags, assign discount)
  - Защита RBAC: phone скрыт для readonly

- [ ] **Задача 7.2.2**: Создать `routers/discounts.py`:
  - GET /api/v1/discounts - список скидок (фильтры: user_id, status, is_test)
  - GET /api/v1/discounts/{id} - одна скидка
  - POST /api/v1/discounts - ручная выдача скидки (marketing/owner)
  - GET /api/v1/discounts/usage-logs - логи погашений (фильтры: cashier_id, status, dates)

- [ ] **Задача 7.2.3**: Создать `routers/discount_templates.py`:
  - GET /api/v1/discount-templates - список шаблонов
  - POST /api/v1/discount-templates - создание (owner only)
  - PATCH /api/v1/discount-templates/{id} - обновление (owner only)
  - DELETE /api/v1/discount-templates/{id} - деактивация (owner only)

- [ ] **Задача 7.2.4**: Создать `routers/broadcasts.py`:
  - GET /api/v1/broadcasts - список рассылок
  - POST /api/v1/broadcasts - создание (с подсчетом recipients)
  - PATCH /api/v1/broadcasts/{id} - обновление (только draft)
  - POST /api/v1/broadcasts/{id}/schedule - запланировать
  - POST /api/v1/broadcasts/{id}/send-now - отправить сейчас (owner only)
  - GET /api/v1/broadcasts/{id}/stats - статистика отправки

- [ ] **Задача 7.2.5**: Создать `routers/segments.py`:
  - GET /api/v1/segments - список сегментов
  - POST /api/v1/segments - создание (с валидацией definition)
  - PATCH /api/v1/segments/{id} - обновление
  - GET /api/v1/segments/{id}/count - подсчет пользователей в сегменте

- [ ] **Задача 7.2.6**: Создать `routers/admins.py`:
  - GET /api/v1/admins - список админов (owner only)
  - POST /api/v1/admins - создание (owner only)
  - PATCH /api/v1/admins/{id} - обновление роли (owner only)
  - DELETE /api/v1/admins/{id} - деактивация (owner only)

- [ ] **Задача 7.2.7**: Создать `routers/cashiers.py`:
  - GET /api/v1/cashiers - список кассиров
  - POST /api/v1/cashiers/{id}/activate - активация (owner only)
  - POST /api/v1/cashiers/{id}/deactivate - деактивация (owner only)

- [ ] **Задача 7.2.8**: Создать `routers/settings.py`:
  - GET /api/v1/settings - получение настроек (owner only)
  - PATCH /api/v1/settings/{key} - обновление (owner only, с аудитом)

- [ ] **Задача 7.2.9**: Создать `routers/export.py`:
  - GET /api/v1/export/users - экспорт пользователей в CSV
  - GET /api/v1/export/discounts - экспорт скидок
  - GET /api/v1/export/usage-logs - экспорт логов погашений
  - Если выборка >10k записей - 202 Accepted с task_id

- [ ] **Задача 7.2.10**: Создать `routers/audit_logs.py`:
  - GET /api/v1/audit-logs - логи действий (owner only)

### 7.3. Telegram Bot Routers
- [ ] **Задача 7.3.1**: Создать `routers/bot_main.py`:
  - POST /webhooks/main-bot - webhook для основного бота
  - Обработка /start с сохранением source (ref_...)
  - Обработка текстовых сообщений (FSM: awaiting_birthday)
  - Обработка callback_query: check_subscription, my_discounts
  - Обработка рассылки из чата (для админов)

- [ ] **Задача 7.3.2**: Создать `routers/bot_auth.py`:
  - POST /webhooks/auth-bot - webhook для бота-кассира
  - Обработка /start (приветствие кассира)
  - Обработка текстового сообщения с кодом скидки
  - Callback: redeem_discount
  - Логика для админов: генерация one-time token для входа в админку

---

## Фаза 8: Celery Tasks (Асинхронные Задачи)

### 8.1. Задачи рассылок
- [ ] **Задача 8.1.1**: Создать `tasks/broadcast_tasks.py`:
  - send_broadcast_chunk(broadcast_id, user_ids) - отправка чанка (1000 юзеров)
  - process_broadcast(broadcast_id) - разбивка на чанки, запуск отправки
  - С учетом rate limiting (25/мин), retry на 429, без retry на 403

- [ ] **Задача 8.1.2**: Создать `tasks/notification_tasks.py`:
  - send_user_notification(user_id, message) - одиночное уведомление
  - notify_discount_redeemed(user_id, code) - уведомление о погашении
  - notify_admins_about_error(group, message, details)

### 8.2. Периодические задачи
- [ ] **Задача 8.2.1**: Создать `tasks/birthday_tasks.py`:
  - check_birthdays() - ежедневная задача (09:00 VVO)
  - Находит именинников, проверяет выдачу за текущий год
  - Выдает скидку, отправляет поздравление

- [ ] **Задача 8.2.2**: Создать `tasks/scheduled_broadcast_tasks.py`:
  - check_scheduled_broadcasts() - каждую минуту проверяет send_at
  - Запускает отправку рассылок, у которых send_at <= NOW (VVO)

### 8.3. Массовые операции
- [ ] **Задача 8.3.1**: Создать `tasks/bulk_operations_tasks.py`:
  - bulk_add_tags_task(user_ids, tags)
  - bulk_assign_discount_task(user_ids, template_id)
  - bulk_export_task(export_type, filters) - для экспорта >10k записей

### 8.4. Beat scheduler
- [ ] **Задача 8.4.1**: Создать `tasks/beat_schedule.py`:
  - Настройка расписания:
    - check_birthdays: каждый день в 09:00 VVO
    - check_scheduled_broadcasts: каждую минуту
    - cleanup_old_logs: раз в неделю (опционально)

---

## Фаза 9: Обработчики Ошибок и Middleware

- [ ] **Задача 9.1**: Создать `core/exceptions.py`:
  - Кастомные исключения: RecurrenceNotReachedError, CashierNotActiveError, etc.
  - Маппинг на machine_code из schemas/error.py

- [ ] **Задача 9.2**: Создать `core/exception_handlers.py`:
  - Глобальный обработчик исключений для FastAPI
  - Форматирование ответов в ErrorResponse с machine_code

- [ ] **Задача 9.3**: Создать `core/middleware.py`:
  - Middleware для определения is_test из webhook (по токену бота)
  - Логирование всех запросов (request_id, timing)

---

## Фаза 10: Главное приложение FastAPI

- [ ] **Задача 10.1**: Создать `app/main.py`:
  - Инициализация FastAPI приложения
  - Подключение всех роутеров с префиксом /api/v1/
  - Регистрация exception handlers
  - Подключение middleware
  - CORS настройка (для админ-панели)

- [ ] **Задача 10.2**: Создать `app/__init__.py`:
  - Экспорт app

---

## Фаза 11: Frontend (Админ-панель)

### 11.1. Настройка проекта
- [ ] **Задача 11.1.1**: Инициализировать React + TypeScript проект:
  - `npx create-react-app admin-panel --template typescript`
  - Установить зависимости: axios, react-router-dom, @tanstack/react-query

- [ ] **Задача 11.1.2**: Настроить структуру каталогов frontend:
  - src/components/, src/pages/, src/services/, src/hooks/, src/types/

- [ ] **Задача 11.1.3**: Создать API client (axios instance):
  - Настройка baseURL, interceptors для JWT
  - Обработка ErrorResponse с machine_code

### 11.2. Аутентификация
- [ ] **Задача 11.2.1**: Создать страницу Login:
  - Ввод one-time token (полученного из Telegram бота)
  - Обмен на JWT через POST /api/v1/auth/login-token
  - Сохранение JWT в localStorage

- [ ] **Задача 11.2.2**: Создать ProtectedRoute:
  - Проверка наличия JWT, редирект на Login

### 11.3. Дашборд и навигация
- [ ] **Задача 11.3.1**: Создать Layout с навигацией:
  - Sidebar с меню (Пользователи, Скидки, Рассылки, Настройки)
  - Показ роли текущего админа

- [ ] **Задача 11.3.2**: Создать Dashboard (главная страница):
  - Статистика: количество пользователей, активных скидок, погашенных купонов (KPI)
  - Графики (опционально)

### 11.4. CRUD страницы
- [ ] **Задача 11.4.1**: Создать страницу Users:
  - Таблица с пагинацией, фильтрами (is_test, status, source)
  - Кнопки: Редактировать, Экспорт, Массовые действия
  - Форма редактирования пользователя (tags, gender, birthday, phone)

- [ ] **Задача 11.4.2**: Создать страницу Discounts:
  - Таблица с фильтрами (user, status, template)
  - Поиск по коду
  - Кнопка "Выдать скидку вручную"

- [ ] **Задача 11.4.3**: Создать страницу Discount Templates:
  - CRUD шаблонов скидок (только для owner)
  - Редактор JSON для recurrence

- [ ] **Задача 11.4.4**: Создать страницу Broadcasts:
  - Таблица рассылок с статусами (draft, scheduled, sending, sent, error)
  - Кнопка "Создать рассылку"
  - Форма создания: контент, медиа, кнопки, выбор сегмента/фильтров
  - Подтверждение с количеством получателей
  - Кнопки "Запланировать", "Отправить сейчас"

- [ ] **Задача 11.4.5**: Создать страницу Segments:
  - CRUD сегментов
  - Редактор JSON фильтров с валидацией
  - Счетчик пользователей в сегменте

- [ ] **Задача 11.4.6**: Создать страницу Admins (только owner):
  - Таблица админов с ролями
  - Кнопки: Создать, Редактировать роль, Деактивировать

- [ ] **Задача 11.4.7**: Создать страницу Cashiers:
  - Таблица кассиров (telegram_id, display_name, is_active)
  - Кнопки: Активировать, Деактивировать (только owner)

- [ ] **Задача 11.4.8**: Создать страницу Settings (только owner):
  - Форма для всех системных настроек
  - Валидация и сохранение с подтверждением

- [ ] **Задача 11.4.9**: Создать страницу Audit Logs (только owner):
  - Таблица логов с фильтрами (entity_type, admin_id, dates)

- [ ] **Задача 11.4.10**: Создать страницу Discount Usage Logs:
  - Таблица погашений с фильтрами (cashier, status, dates)
  - Поиск по коду

### 11.5. Компоненты
- [ ] **Задача 11.5.1**: Создать компоненты таблиц:
  - DataTable с пагинацией, сортировкой
  - Filters компонент для фильтров

- [ ] **Задача 11.5.2**: Создать компоненты форм:
  - FormInput, FormSelect, FormDatePicker, FormTextarea
  - JSONEditor для редактирования JSON полей

- [ ] **Задача 11.5.3**: Создать компонент ErrorDisplay:
  - Отображение ErrorResponse с локализацией machine_code

---

## Фаза 12: Тестирование

### 12.1. Unit тесты
- [ ] **Задача 12.1.1**: Тесты для core/utils:
  - Тесты для normalize_birthday (все форматы)
  - Тесты для generate_discount_code, normalize_code
  - Тесты для validate_tags

- [ ] **Задача 12.1.2**: Тесты для services:
  - Тесты для user_service (CRUD, bulk operations)
  - Тесты для discount_service (create, validate, redeem)
  - Тесты для subscription_service (check, give_discount)
  - Тесты для broadcast_service (create, get_recipients, count)

### 12.2. Integration тесты
- [ ] **Задача 12.2.1**: Тесты для API endpoints:
  - Тесты для auth (login, JWT)
  - Тесты для users (CRUD, фильтры, bulk)
  - Тесты для discounts (CRUD, валидация, погашение)
  - Тесты для broadcasts (CRUD, статусы FSM)

- [ ] **Задача 12.2.2**: Тесты для Celery tasks:
  - Тесты для send_broadcast_chunk (rate limiting, retries)
  - Тесты для check_birthdays (выдача скидки, проверка года)

### 12.3. E2E тесты (опционально)
- [ ] **Задача 12.3.1**: Сценарий "Регистрация -> Подписка -> Получение скидки":
  - Webhook /start
  - Webhook check_subscription
  - Проверка is_subscribed, создание discount

- [ ] **Задача 12.3.2**: Сценарий "Погашение скидки":
  - Webhook с кодом от кассира
  - Валидация, погашение (used_at)
  - Лог в discount_usage_logs, уведомление клиенту

- [ ] **Задача 12.3.3**: Сценарий "Рассылка":
  - Создание broadcast через API
  - Запуск send_now
  - Проверка статусов (sending -> sent)

---

## Фаза 13: Документация

- [ ] **Задача 13.1**: Создать README.md:
  - Описание проекта
  - Инструкции по запуску (Docker Compose)
  - Переменные окружения
  - Примеры API запросов

- [ ] **Задача 13.2**: Создать API документацию (Swagger):
  - FastAPI автоматически генерирует OpenAPI
  - Добавить описания для всех endpoints

- [ ] **Задача 13.3**: Создать DEPLOYMENT.md:
  - Инструкции по деплою на VPS
  - Настройка Webhook URLs
  - Настройка VPN/Tailscale для админ-панели

---

## Фаза 14: Деплой и Приемка

### 14.1. Docker и CI/CD
- [ ] **Задача 14.1.1**: Создать Dockerfile для API:
  - Multi-stage build для production
  - Healthcheck endpoint

- [ ] **Задача 14.1.2**: Создать Dockerfile для Worker/Beat:
  - Использование общего образа с разными CMD

- [ ] **Задача 14.1.3**: Создать Dockerfile для Frontend:
  - Build React app, serve через nginx

- [ ] **Задача 14.1.4**: Обновить docker-compose.yml для production:
  - Volumes для данных MySQL, Redis
  - Networks для изоляции
  - Restart policies

### 14.2. Настройка VPS
- [ ] **Задача 14.2.1**: Установить Docker и Docker Compose на VPS

- [ ] **Задача 14.2.2**: Настроить .env файл на сервере с реальными токенами

- [ ] **Задача 14.2.3**: Запустить docker-compose up -d

- [ ] **Задача 14.2.4**: Применить миграции Alembic:
  - `docker-compose exec api alembic upgrade head`

- [ ] **Задача 14.2.5**: Установить Webhooks через /internal/set-webhooks

- [ ] **Задача 14.2.6**: Настроить VPN/Tailscale для доступа к админ-панели

### 14.3. Приемочное тестирование
- [ ] **Задача 14.3.1**: Тест "Аутентификация":
  - Получить one-time token из бота-кассира
  - Войти в админ-панель

- [ ] **Задача 14.3.2**: Тест "Регистрация":
  - /start в основном боте
  - Проверить сохранение в БД, парсинг source

- [ ] **Задача 14.3.3**: Тест "Проверка подписки":
  - Проверить подписку (с реальной подпиской и без)
  - Проверить выдачу скидки при подписке
  - Проверить рекуррентность (30 дней)

- [ ] **Задача 14.3.4**: Тест "Погашение кода":
  - Активировать кассира
  - Погасить код через бота-кассира
  - Проверить лог status='success'
  - Проверить уведомление клиенту
  - Попробовать погасить повторно (CODE_ALREADY_USED)

- [ ] **Задача 14.3.5**: Тест "День рождения":
  - Установить ДР на завтрашний день (VVO)
  - Дождаться срабатывания Celery Beat (09:00 VVO)
  - Проверить выдачу скидки и поздравление

- [ ] **Задача 14.3.6**: Тест "Рассылки":
  - Создать рассылку на 1000+ пользователей
  - Отправить сейчас
  - Проверить статусы (sending -> sent)
  - Проверить лимит 25/мин

- [ ] **Задача 14.3.7**: Тест "API валидация":
  - Попробовать добавить 21 тег (TAG_TOO_MANY)
  - Попробовать создать сегмент с невалидным JSON (SEGMENT_INVALID)
  - Проверить возврат machine_code в ErrorResponse

- [ ] **Задача 14.3.8**: Тест "Инфраструктура":
  - Проверить запуск всех 5 контейнеров (api, worker, beat, mysql, redis)
  - Проверить healthcheck
  - Проверить логи Celery

---

## Итоговый Чеклист (Definition of Done)

✅ Все 5 сервисов запущены и работают в Docker Compose
✅ Все миграции Alembic применены
✅ Webhooks установлены для обоих ботов
✅ Аутентификация работает (one-time token -> JWT)
✅ Регистрация через /start сохраняет пользователя и source
✅ Проверка подписки выдает скидку с учетом рекуррентности
✅ Погашение кода работает атомарно, логирует успех/ошибку
✅ Клиент уведомляется о погашении (или user_not_notified)
✅ День рождения: Celery Beat в 09:00 VVO выдает скидку
✅ Рассылки: статусы FSM работают, лимит 25/мин соблюдается
✅ API возвращает machine_code при ошибках (TAG_TOO_MANY, CODE_ALREADY_USED, etc.)
✅ Админ-панель доступна только через VPN
✅ Все системные настройки редактируются в админ-панели (owner only)
✅ Аудит логи записываются для критических действий
✅ Тестовые данные (is_test=1) не попадают в боевые рассылки

