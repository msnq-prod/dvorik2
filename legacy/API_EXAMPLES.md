# API Examples - Мармеладный Дворик

Примеры использования API для различных сценариев.

## 🔐 Аутентификация

### 1. Получить JWT токен через Telegram

```bash
# Шаг 1: Пользователь запрашивает one-time token через auth bot
# Bot отправляет: /start → получает ссылку с токеном

# Шаг 2: Обменять one-time token на JWT
curl -X POST http://localhost:8000/api/v1/auth/login-token \
  -H "Content-Type: application/json" \
  -d '{
    "token": "one_time_token_here"
  }'

# Response:
# {
#   "access_token": "eyJ...",
#   "token_type": "bearer",
#   "admin_id": 1,
#   "role": "owner"
# }
```

### 2. Логин по email/паролю

```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "password"
  }'
```

### 3. Получить информацию о текущем админе

```bash
JWT_TOKEN="your_jwt_token_here"

curl -X GET http://localhost:8000/api/v1/auth/me \
  -H "Authorization: Bearer $JWT_TOKEN"
```

## 👥 Управление пользователями

### 1. Список пользователей с фильтрами

```bash
# Все подписанные пользователи
curl -X GET "http://localhost:8000/api/v1/users?is_subscribed=true&page=1&per_page=50" \
  -H "Authorization: Bearer $JWT_TOKEN"

# Пользователи из Instagram
curl -X GET "http://localhost:8000/api/v1/users?source=instagram" \
  -H "Authorization: Bearer $JWT_TOKEN"

# Активные пользователи
curl -X GET "http://localhost:8000/api/v1/users?status=active" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### 2. Получить пользователя по ID

```bash
curl -X GET http://localhost:8000/api/v1/users/1 \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### 3. Обновить пользователя

```bash
curl -X PATCH http://localhost:8000/api/v1/users/1 \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tags": ["vip", "active_buyer"],
    "birthday": "1990-12-25",
    "phone": "+79991234567"
  }'
```

### 4. Массовые операции

```bash
# Добавить теги нескольким пользователям
curl -X POST http://localhost:8000/api/v1/users/bulk \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "add_tags",
    "user_ids": [1, 2, 3, 4, 5],
    "tags": ["promo_2024", "new_year"]
  }'

# Выдать скидку нескольким пользователям
curl -X POST http://localhost:8000/api/v1/users/bulk \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "assign_discount",
    "user_ids": [1, 2, 3]
  }'
```

### 5. Статистика пользователей

```bash
curl -X GET "http://localhost:8000/api/v1/users/stats/overview?is_test=false" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

## 🎁 Управление скидками

### 1. Список скидок

```bash
# Все активные скидки
curl -X GET "http://localhost:8000/api/v1/discounts?status=active" \
  -H "Authorization: Bearer $JWT_TOKEN"

# Скидки конкретного пользователя
curl -X GET "http://localhost:8000/api/v1/discounts?user_id=1" \
  -H "Authorization: Bearer $JWT_TOKEN"

# Использованные скидки
curl -X GET "http://localhost:8000/api/v1/discounts?status=used" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### 2. Получить скидку по ID

```bash
curl -X GET http://localhost:8000/api/v1/discounts/1 \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### 3. Выдать скидку вручную (owner/marketing)

```bash
curl -X POST http://localhost:8000/api/v1/discounts \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": 1
  }'
```

### 4. Статистика скидок

```bash
curl -X GET "http://localhost:8000/api/v1/discounts/stats/overview?is_test=false" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

## 📢 Рассылки

### 1. Список рассылок

```bash
curl -X GET "http://localhost:8000/api/v1/broadcasts?status=draft" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### 2. Создать рассылку

```bash
curl -X POST http://localhost:8000/api/v1/broadcasts \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Привет! У нас новая акция 🎉",
    "media_type": "text",
    "segment_id": 1
  }'
```

### 3. Создать рассылку с фото

```bash
curl -X POST http://localhost:8000/api/v1/broadcasts \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Посмотрите нашу новую коллекцию! 🍬",
    "media_type": "photo",
    "media_file_id": "AgACAgIAAxkBAAI...",
    "filters": {
      "is_subscribed": true,
      "status": "active"
    }
  }'
```

### 4. Запланировать рассылку

```bash
curl -X POST http://localhost:8000/api/v1/broadcasts/1/schedule \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "send_at": "2024-12-25T09:00:00"
  }'
```

### 5. Отправить рассылку немедленно (owner only)

```bash
curl -X POST http://localhost:8000/api/v1/broadcasts/1/send-now \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### 6. Статистика рассылки

```bash
curl -X GET http://localhost:8000/api/v1/broadcasts/1/stats \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### 7. Подсчитать получателей

```bash
curl -X POST http://localhost:8000/api/v1/broadcasts/count-recipients \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "segment_id": 1
  }'

# или с кастомными фильтрами
curl -X POST http://localhost:8000/api/v1/broadcasts/count-recipients \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filters": {
      "is_subscribed": true,
      "tags": ["vip"]
    }
  }'
```

## 🎯 Сегменты

### 1. Список сегментов

```bash
curl -X GET http://localhost:8000/api/v1/segments \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### 2. Создать сегмент

```bash
curl -X POST http://localhost:8000/api/v1/segments \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "VIP клиенты",
    "description": "Подписанные пользователи с тегом vip",
    "definition": {
      "is_subscribed": true,
      "tags": ["vip"]
    }
  }'
```

### 3. Подсчитать пользователей в сегменте

```bash
curl -X GET http://localhost:8000/api/v1/segments/1/count \
  -H "Authorization: Bearer $JWT_TOKEN"
```

## 📊 Статистика и KPI

### 1. Общая статистика (KPI)

```bash
# За последние 30 дней
curl -X GET "http://localhost:8000/api/v1/stats/kpi?days=30&is_test=false" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### 2. Детальная статистика

```bash
# За последние 7 дней
curl -X GET "http://localhost:8000/api/v1/stats/detailed?days=7&is_test=false" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

## ⚙️ Настройки

### 1. Получить все настройки

```bash
curl -X GET http://localhost:8000/api/v1/settings \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### 2. Обновить настройку (owner only)

```bash
curl -X PATCH http://localhost:8000/api/v1/settings/birthday_discount_enabled \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "value": true
  }'
```

### 3. Массовое обновление настроек

```bash
curl -X POST http://localhost:8000/api/v1/settings/bulk-update \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "settings": {
      "birthday_discount_enabled": true,
      "subscription_discount_enabled": true,
      "broadcast_rate_limit": 25
    }
  }'
```

## 📝 Текстовые шаблоны

### 1. Получить все шаблоны

```bash
curl -X GET http://localhost:8000/api/v1/message-templates \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### 2. Обновить шаблон (owner/marketing)

```bash
curl -X PATCH http://localhost:8000/api/v1/message-templates/welcome \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Привет, {{name}}! 👋\n\nДобро пожаловать в Мармеладный Дворик!"
  }'
```

## 🔧 Служебные endpoints

### 1. Health Check

```bash
curl http://localhost:8000/health
```

### 2. Установить Webhooks

```bash
curl -X POST http://localhost:8000/internal/set-webhooks \
  -H "X-API-Key: YOUR_INTERNAL_API_KEY"
```

### 3. Информация о Webhooks

```bash
curl -X GET http://localhost:8000/internal/webhook-info \
  -H "X-API-Key: YOUR_INTERNAL_API_KEY"
```

## 📱 Python примеры

### Создать HTTP клиент

```python
import requests

class DvorikAPI:
    def __init__(self, base_url="http://localhost:8000", token=None):
        self.base_url = base_url
        self.token = token
        self.session = requests.Session()
        if token:
            self.session.headers.update({
                "Authorization": f"Bearer {token}"
            })
    
    def login(self, email, password):
        """Логин по email/паролю"""
        response = self.session.post(
            f"{self.base_url}/api/v1/auth/login",
            json={"email": email, "password": password}
        )
        data = response.json()
        self.token = data["access_token"]
        self.session.headers.update({
            "Authorization": f"Bearer {self.token}"
        })
        return data
    
    def get_users(self, **filters):
        """Получить список пользователей"""
        response = self.session.get(
            f"{self.base_url}/api/v1/users",
            params=filters
        )
        return response.json()
    
    def create_broadcast(self, message, **kwargs):
        """Создать рассылку"""
        data = {"message": message, **kwargs}
        response = self.session.post(
            f"{self.base_url}/api/v1/broadcasts",
            json=data
        )
        return response.json()
    
    def get_stats(self, days=30):
        """Получить статистику"""
        response = self.session.get(
            f"{self.base_url}/api/v1/stats/kpi",
            params={"days": days}
        )
        return response.json()

# Использование
api = DvorikAPI()
api.login("admin@example.com", "password")

# Получить пользователей
users = api.get_users(is_subscribed=True, page=1, per_page=10)
print(f"Found {len(users)} subscribed users")

# Создать рассылку
broadcast = api.create_broadcast(
    message="Привет! Новая акция 🎉",
    segment_id=1
)
print(f"Broadcast created: {broadcast['id']}")

# Получить статистику
stats = api.get_stats(days=7)
print(f"Total users: {stats['total_users']}")
print(f"Redemption rate: {stats['redemption_rate']}%")
```

## 🔗 Полезные ссылки

- **API Docs (Swagger):** http://localhost:8000/api/docs
- **API Docs (ReDoc):** http://localhost:8000/api/redoc
- **Flower (Celery):** http://localhost:5555
- **Health Check:** http://localhost:8000/health

