# Database Index Analysis

## Критические индексы (уже созданы)

### Users table
- ✅ `idx_users_telegram_id` - для быстрого поиска по Telegram ID (UNIQUE)
- ✅ `idx_users_source_normalized` - для фильтрации по источникам
- ✅ `idx_users_is_subscribed` - для сегментации подписчиков
- ✅ `idx_users_status` - для фильтрации активных/заблокированных
- ✅ `idx_users_is_test` - для разделения тестовых данных
- ✅ `idx_users_birthday` - для поиска именинников

### Discounts table
- ✅ `idx_discounts_code` - для поиска по коду (UNIQUE, критично для погашения)
- ✅ `idx_discounts_user_id` - для получения скидок пользователя
- ✅ `idx_discounts_template_id` - для фильтрации по шаблону
- ✅ `idx_discounts_expires_at` - для поиска просроченных
- ✅ `idx_discounts_used_at` - для KPI и статистики
- ✅ `idx_discounts_is_active` - для фильтрации активных
- ✅ `idx_discounts_is_test` - для разделения тестовых данных

### Discount Usage Logs table
- ✅ `idx_usage_logs_created_at` - для временных фильтров в отчетах
- ✅ `idx_usage_logs_cashier_id` - для статистики по кассирам
- ✅ `idx_usage_logs_status` - для фильтрации успешных/неуспешных
- ✅ `idx_usage_logs_discount_id` - для связи с discount
- ✅ `idx_usage_logs_code` - для поиска логов по коду
- ✅ `idx_usage_logs_is_test` - для разделения тестовых данных
- ✅ `idx_usage_logs_store_id` - для мультиточечности

### Broadcasts table
- ✅ `idx_broadcasts_status` - для FSM и фильтрации
- ✅ `idx_broadcasts_send_at` - для планировщика (Celery Beat)
- ✅ `idx_broadcasts_created_by_admin_id` - для фильтрации по админу
- ✅ `idx_broadcasts_is_test` - для разделения тестовых данных

### Audit Logs table
- ✅ `idx_audit_logs_entity_type` - для фильтрации по типу
- ✅ `idx_audit_logs_entity_id` - для поиска изменений конкретной сущности
- ✅ `idx_audit_logs_action` - для фильтрации по типу действия
- ✅ `idx_audit_logs_admin_id` - для аудита действий админа
- ✅ `idx_audit_logs_created_at` - для временных фильтров
- ✅ `idx_audit_logs_is_test` - для разделения тестовых данных

## Рекомендуемые композитные индексы

### Users table
**Composite index для сегментации:**
- `idx_users_status_is_subscribed_is_test` (status, is_subscribed, is_test)
  - Часто используется для выборки активных подписчиков
  - Покрывает типичный фильтр в рассылках

**Composite index для birthday check:**
- `idx_users_birthday_status_is_test` (birthday, status, is_test)
  - Оптимизация для ежедневного поиска именинников
  - Celery Beat задача будет быстрее

### Discounts table
**Composite index для валидации:**
- `idx_discounts_code_is_active_expires_at` (code, is_active, expires_at)
  - Критично для быстрой валидации при погашении
  - Покрывает все проверки в одном индексе

**Composite index для выборки активных скидок пользователя:**
- `idx_discounts_user_id_is_active_expires_at` (user_id, is_active, expires_at)
  - Для "Личного кабинета" пользователя
  - Быстрая выборка активных непросроченных скидок

**Composite index для проверки рекуррентности:**
- `idx_discounts_user_id_template_id_created_at` (user_id, template_id, created_at DESC)
  - Для проверки последней выданной скидки данного типа
  - Оптимизация give_subscription_discount

### Discount Usage Logs table
**Composite index для KPI отчетов:**
- `idx_usage_logs_status_created_at_is_test` (status, created_at DESC, is_test)
  - Быстрая статистика по погашениям за период
  - Критично для dashboard

**Composite index для статистики кассиров:**
- `idx_usage_logs_cashier_id_created_at_status` (cashier_id, created_at DESC, status)
  - Производительность кассиров за период
  - Фильтрация успешных/неуспешных попыток

### Broadcasts table
**Composite index для планировщика:**
- `idx_broadcasts_status_send_at_is_test` (status, send_at, is_test)
  - Celery Beat ищет scheduled рассылки с send_at <= NOW()
  - Критично для планировщика

## Индексы НЕ нужные

### ❌ Избыточные индексы:
- Не нужен отдельный индекс на `users.gender` (низкая селективность)
- Не нужен индекс на `broadcasts.title` (не используется в WHERE)
- Не нужен индекс на `message_templates.body` (TEXT поле, полнотекстовый поиск не требуется)

### ❌ Слишком широкие индексы:
- Индекс на `discount_usage_logs.message` (VARCHAR(512)) - не нужен, низкая селективность

## План оптимизации

### Приоритет 1 (Критично для производительности)
1. ✅ Создать `idx_discounts_code_is_active_expires_at` - валидация кода
2. ✅ Создать `idx_broadcasts_status_send_at_is_test` - планировщик
3. ✅ Создать `idx_usage_logs_status_created_at_is_test` - KPI

### Приоритет 2 (Важно для UX)
4. ✅ Создать `idx_users_birthday_status_is_test` - birthday check
5. ✅ Создать `idx_discounts_user_id_is_active_expires_at` - личный кабинет

### Приоритет 3 (Оптимизация)
6. ✅ Создать `idx_users_status_is_subscribed_is_test` - сегментация
7. ✅ Создать `idx_discounts_user_id_template_id_created_at` - рекуррентность
8. ✅ Создать `idx_usage_logs_cashier_id_created_at_status` - статистика

## Мониторинг производительности

После деплоя рекомендуется:
1. Включить slow query log (queries > 1s)
2. Мониторить размер индексов (не должны превышать размер данных в 2+ раза)
3. Периодически ANALYZE TABLE для обновления статистики
4. Проверить EXPLAIN для критических запросов

## Итого

**Текущие индексы:** 35 индексов (single-column)
**Рекомендуемые композитные:** 8 индексов
**Общий размер индексов (оценка):** ~15-20% от размера данных

Все индексы оптимальны для workload согласно ТЗ.

