# Database Schema

This document outlines the database schema for the Telegram bot and admin panel application.

## Tables

### `users`

Stores information about registered users.

| Column          | Data Type     | Description                               |
|-----------------|---------------|-------------------------------------------|
| `id`            | `INT`         | Primary Key, Auto-increment               |
| `telegram_id`   | `BIGINT`      | User's Telegram ID (unique)               |
| `first_name`    | `VARCHAR(255)`| User's first name                         |
| `last_name`     | `VARCHAR(255)`| User's last name                          |
| `birth_date`    | `DATE`        | User's date of birth (YYYY-MM-DD)         |
| `gender`        | `ENUM('male', 'female')` | User's gender                             |
| `subscribed`    | `BOOLEAN`     | Whether the user is subscribed to the channel |
| `status`        | `VARCHAR(255)`| User's status (assigned by admin)         |
| `created_at`    | `TIMESTAMP`   | Timestamp of user registration            |

### `coupons`

Stores information about generated coupons.

| Column          | Data Type     | Description                               |
|-----------------|---------------|-------------------------------------------|
| `id`            | `INT`         | Primary Key, Auto-increment               |
| `code`          | `VARCHAR(255)`| Coupon code (e.g., AB-1234), unique       |
| `discount_type` | `ENUM('percentage', 'fixed_amount', 'comment')` | Type of discount |
| `discount_value`| `DECIMAL(10, 2)`| The value of the discount (percentage or amount) |
| `comment`       | `TEXT`        | A comment for the coupon                  |
| `expires_at`    | `TIMESTAMP`   | Expiration date of the coupon             |
| `is_unique`     | `BOOLEAN`     | Whether the coupon is unique to a user    |
| `is_disposable` | `BOOLEAN`     | Whether the coupon is single-use          |
| `user_id`       | `INT`         | Foreign Key to `users.id` (if unique)     |
| `campaign_id`   | `INT`         | Foreign Key to `campaigns.id`             |
| `created_at`    | `TIMESTAMP`   | Timestamp of coupon creation              |

### `coupon_activations`

Stores information about coupon activations.

| Column          | Data Type     | Description                               |
|-----------------|---------------|-------------------------------------------|
| `id`            | `INT`         | Primary Key, Auto-increment               |
| `coupon_id`     | `INT`         | Foreign Key to `coupons.id`               |
| `user_id`       | `INT`         | Foreign Key to `users.id`                 |
| `activated_at`  | `TIMESTAMP`   | Timestamp of coupon activation            |

### `campaigns`

Stores information about promotional campaigns.

| Column          | Data Type     | Description                               |
|-----------------|---------------|-------------------------------------------|
| `id`            | `INT`         | Primary Key, Auto-increment               |
| `name`          | `VARCHAR(255)`| Name of the campaign                      |
| `created_at`    | `TIMESTAMP`   | Timestamp of campaign creation            |
| `deleted_at`    | `TIMESTAMP`   | Timestamp of campaign deletion            |
