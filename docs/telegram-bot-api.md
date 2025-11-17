# Telegram Bot API Documentation

This document describes the API endpoints that Telegram bots should use to interact with the loyalty program system.

## Base URL

All API endpoints are relative to your backend URL: `https://your-backend-url.com`

## Authentication

For bot integration, you should implement authentication based on Telegram user ID validation or use a dedicated API key for your bots.

---

## User Management

### Get User by Telegram ID

Check if a user exists and get their information.

```
GET /api/users/telegram/{telegram_id}
```

**Response:**
```json
{
  "id": 1,
  "telegramId": 123456789,
  "username": "user123",
  "firstName": "Иван",
  "lastName": "Петров",
  "isSubscribed": true,
  "status": "active",
  "birthday": "1990-05-15",
  "createdAt": "2024-11-17T10:00:00Z"
}
```

### Create User

Register a new user from Telegram.

```
POST /api/users
Content-Type: application/json

{
  "telegramId": 123456789,
  "username": "user123",
  "firstName": "Иван",
  "lastName": "Петров",
  "source": "telegram_channel" // or "ref_campaign_code"
}
```

### Update User

Update user information (e.g., subscription status, birthday).

```
PUT /api/users/{id}
Content-Type: application/json

{
  "isSubscribed": true,
  "subscriptionCheckedAt": "2024-11-17T10:00:00Z",
  "birthday": "1990-05-15"
}
```

---

## Discount Operations

### Issue Discount

Issue a new discount to a user based on a template.

```
POST /api/discounts/issue
Content-Type: application/json

{
  "userId": 1,
  "templateId": 2,
  "campaignId": 3 // optional
}
```

**Response (Success):**
```json
{
  "id": 123,
  "code": "АБВ1234",
  "userId": 1,
  "templateId": 2,
  "value": "15.00",
  "valueType": "percent",
  "status": "active",
  "issuedAt": "2024-11-17T10:00:00Z",
  "expiresAt": "2024-11-24T10:00:00Z"
}
```

**Response (Error):**
```json
{
  "error": "User already received this discount this month"
}
```

**Use Cases:**
- After user subscribes to channel → issue "subscription" discount
- On user's birthday → issue "birthday" discount
- After referral completes action → issue "referral" discount

### Validate Discount

Check if a discount code is valid (for cashier bot).

```
POST /api/discounts/validate
Content-Type: application/json

{
  "code": "АБВ1234"
}
```

**Response (Valid):**
```json
{
  "valid": true,
  "discount": {
    "id": 123,
    "code": "АБВ1234",
    "value": "15.00",
    "valueType": "percent",
    "status": "active",
    "expiresAt": "2024-11-24T10:00:00Z"
  },
  "user": {
    "id": 1,
    "firstName": "Иван",
    "lastName": "Петров",
    "username": "user123"
  }
}
```

**Response (Invalid):**
```json
{
  "valid": false,
  "error": "Discount has expired"
}
```

### Redeem Discount

Redeem a discount code (called by cashier bot).

```
POST /api/discounts/redeem
Content-Type: application/json

{
  "code": "АБВ1234",
  "cashierId": 5
}
```

**Response (Success):**
```json
{
  "success": true,
  "discount": {
    "id": 123,
    "code": "АБВ1234",
    "status": "used",
    "usedAt": "2024-11-17T10:30:00Z"
  },
  "user": {
    "id": 1,
    "firstName": "Иван",
    "lastName": "Петров",
    "username": "user123"
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Discount is already used"
}
```

### Get User Active Discounts

Get all active discounts for a user (for user bot to show).

```
GET /api/discounts/user/{userId}/active
```

**Response:**
```json
[
  {
    "id": 123,
    "code": "АБВ1234",
    "value": "15.00",
    "valueType": "percent",
    "expiresAt": "2024-11-24T10:00:00Z",
    "status": "active"
  },
  {
    "id": 124,
    "code": "ГДЕ5678",
    "value": "500.00",
    "valueType": "fixed",
    "expiresAt": "2024-11-30T10:00:00Z",
    "status": "active"
  }
]
```

---

## Cashier Operations

### Get Cashier by Telegram ID

```
GET /api/cashiers/telegram/{telegram_id}
```

### Register Cashier

Create a new cashier registration request.

```
POST /api/cashiers
Content-Type: application/json

{
  "telegramId": 987654321,
  "name": "Мария Кассир",
  "isActive": false
}
```

**Note:** Cashier must be approved by admin before becoming active.

### Check Cashier Status

After registration, periodically check if admin approved the cashier.

```
GET /api/cashiers/{id}
```

**Response:**
```json
{
  "id": 5,
  "telegramId": 987654321,
  "name": "Мария Кассир",
  "isActive": true,
  "approvedByAdminId": 1,
  "createdAt": "2024-11-17T09:00:00Z"
}
```

---

## Discount Templates

### Get Active Templates

Get list of active discount templates (to show admins what can be issued).

```
GET /api/discount-templates?isActive=true
```

**Response:**
```json
[
  {
    "id": 1,
    "name": "Скидка за подписку",
    "value": "15.00",
    "valueType": "percent",
    "durationDays": 7,
    "event": "subscription",
    "isActive": true
  },
  {
    "id": 2,
    "name": "Скидка ко дню рождения",
    "value": "20.00",
    "valueType": "percent",
    "durationDays": 30,
    "event": "birthday",
    "isActive": true
  }
]
```

### Get Template by Event Type

Get the template for a specific event (e.g., subscription, birthday).

```
GET /api/discount-templates?event=subscription&isActive=true
```

---

## Campaigns

### Get Campaign by Code

Get campaign details for referral tracking.

```
GET /api/campaigns?code={campaign_code}
```

**Example:** For start parameter `ref_12_abc`, query by code `ref_12_abc`.

---

## Event Logging

### Create Event Log

Log important events from bots.

```
POST /api/event-logs
Content-Type: application/json

{
  "eventType": "subscription_checked",
  "userId": 1,
  "metadata": {
    "channelId": "-100123456789",
    "isSubscribed": true
  },
  "message": "User subscription checked for main channel"
}
```

**Event Types:**
- `user_registered` - New user registered
- `subscription_checked` - Subscription status checked
- `discount_issued` - Discount issued to user
- `discount_redeemed` - Discount redeemed by cashier
- `discount_redemption_attempt` - Failed redemption attempt
- `error` - Error occurred

---

## Broadcast Operations (Future)

When implementing broadcast sending from bots:

### Calculate Audience

Calculate how many users match criteria before sending.

```
POST /api/broadcasts/calculate-audience
Content-Type: application/json

{
  "targetAudience": {
    "subscribed": true,
    "hasActiveDiscounts": false
  }
}
```

**Response:**
```json
{
  "count": 1250
}
```

---

## Common Workflow Examples

### Workflow 1: User Subscribes to Channel

```
1. User starts bot: /start
   → POST /api/users (create user)

2. Bot prompts: "Subscribe to channel"
   → User subscribes

3. User clicks "Check Subscription"
   → Bot checks Telegram API
   → PUT /api/users/{id} (update isSubscribed=true)

4. If subscribed:
   → GET /api/discount-templates?event=subscription
   → POST /api/discounts/issue (userId, templateId)
   → Bot shows discount code to user
```

### Workflow 2: Cashier Redeems Discount

```
1. Customer provides code to cashier

2. Cashier enters code in bot
   → POST /api/discounts/validate (code)
   → Bot shows user info and discount details

3. Cashier confirms
   → POST /api/discounts/redeem (code, cashierId)
   → Bot confirms redemption
   → User's main bot receives notification
```

### Workflow 3: Birthday Discount (Automated)

```
// This runs in background job (not from bot)
1. Background job finds users with birthday today
   → GET /api/users?birthday={today}

2. For each user:
   → GET /api/discount-templates?event=birthday
   → POST /api/discounts/issue (userId, templateId)
   → Send notification via Telegram API
```

---

## Error Handling

All endpoints return appropriate HTTP status codes:

- `200 OK` - Success
- `201 Created` - Resource created
- `204 No Content` - Success with no response body
- `400 Bad Request` - Validation error
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error

Error response format:
```json
{
  "error": "Error message description"
}
```

For validation errors (Zod):
```json
{
  "error": [
    {
      "code": "invalid_type",
      "expected": "number",
      "received": "string",
      "path": ["userId"],
      "message": "Expected number, received string"
    }
  ]
}
```

---

## Notes for Bot Developers

1. **Database Connection**: Bots should only communicate with the backend via HTTP API, never directly with the database.

2. **Rate Limiting**: Implement appropriate rate limiting in your bots to avoid overwhelming the API.

3. **Caching**: Cache discount templates and settings to reduce API calls.

4. **Error Handling**: Always handle API errors gracefully and provide clear messages to users.

5. **Logging**: Use the event logging endpoint to track important bot actions.

6. **Testing**: Use `isTest: true` flag when creating test users/discounts to keep production data clean.

7. **Timezone**: All timestamps are in UTC. Convert to Vladivostok time (UTC+10) for user display.

---

## Environment Variables for Bots

Bots will need these environment variables:

```env
# Backend API
API_BASE_URL=https://your-backend-url.com

# Telegram Bot Tokens
TELEGRAM_MAIN_BOT_TOKEN=your_main_bot_token
TELEGRAM_CASHIER_BOT_TOKEN=your_cashier_bot_token

# Channel for subscription check
TELEGRAM_MAIN_CHANNEL_ID=-100123456789
```

---

## Next Steps

1. Implement authentication/authorization for bot API calls
2. Add webhook endpoints for bot notifications
3. Implement background job system for birthday discounts and reminders
4. Add broadcast sending capabilities
5. Implement rate limiting and request validation
