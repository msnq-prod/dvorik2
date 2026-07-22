# Целевая архитектура

## 1. Архитектурный стиль

Рекомендуется модульный монолит:

- один backend;
- один WebApp frontend;
- отдельный Telegram bot adapter;
- одна SQLite-база на первом этапе;
- доменные модули с запретом прямого доступа UI к таблицам.

Микросервисы для текущего масштаба не нужны.

## 2. Предлагаемые модули

```text
apps/
  web/                 Telegram WebApp + standalone desktop
  api/                 HTTP API и фоновые задачи
  bot/                 Telegram entrypoint и notifications
packages/
  domain/              команды, правила, статусы, permissions
  contracts/           API schemas и общие DTO
  ui/                  design system
docs/
  product/
  domains/
  workflows/
  adr/
```

Конкретный язык и framework пока не подтверждены.

## 3. Слои backend

1. Transport: HTTP/Telegram adapters.
2. Application: commands, queries, transactions, idempotency.
3. Domain: инварианты и state machines.
4. Infrastructure: SQLite, файлы, Telegram API, monitoring.

Transport не выполняет SQL и не содержит бизнес-правила.

## 4. API

- Версионированный JSON API.
- Схема OpenAPI является контрактом.
- Все mutation endpoints принимают idempotency key.
- Ошибки имеют стабильные machine codes.
- Permissions проверяются на backend.
- Optimistic concurrency используется для конфликтных изменений.

## 5. Данные

SQLite допустим при условиях:

- один контролируемый writer path;
- WAL и busy timeout;
- короткие транзакции;
- versioned migrations;
- обязательные FK, CHECK и UNIQUE;
- автоматический backup;
- тест восстановления.

Если появятся несколько серверных экземпляров или высокая параллельная запись, переход на PostgreSQL рассматривается отдельным ADR.

## 6. Telegram

- Бот не содержит бизнес-логики.
- Бот открывает WebApp, выдаёт magic link и отправляет уведомления.
- Telegram identity проверяется backend.
- Уведомления создаются как domain event/outbox, а не отправляются внутри складской транзакции.

## 7. Frontend

- Единое responsive-приложение.
- Mobile navigation для продавца.
- Desktop navigation и плотные рабочие таблицы для администратора.
- Серверное состояние не дублируется в несвязанных локальных stores.
- Все mutation flows имеют loading, success, error и conflict states.
- Камера используется для фото и barcode scanning.

## 8. Печать

Reference: `stones/src/admin/pages/QrPrint.tsx`.

Переиспользовать идеи:

- настройки в физических единицах;
- preview pages;
- валидацию геометрии;
- PDF export;
- sanitization и диапазоны.

Не копировать типы `Batch`, `Item`, QR passport и Stones API.

## 9. Обязательные инженерные барьеры

- Миграции применяются отдельной командой и имеют версии.
- CI падает при ошибке lint, typecheck, tests или migrations.
- Domain tests проверяют инварианты.
- API contract tests проверяют permissions и idempotency.
- E2E покрывает критические workflows.
- Любое изменение требования обновляет docs или ADR в том же PR.

## 10. Текущие риски репозитория

- Текущий `.git` повреждён: отсутствуют `objects/` и `refs/`; Git не распознаёт репозиторий.
- В корне присутствуют дубли файлов с суффиксом `-2`.
- Текущий `AGENTS.md` слишком большой и содержит устаревшие/неподтверждённые детали.
- Старый код смешивает transport, SQL и бизнес-правила.
- Старая SQLite-схема не обеспечивает все инварианты.

До активной разработки нужно восстановить нормальный Git-репозиторий и очистить технические дубли.

