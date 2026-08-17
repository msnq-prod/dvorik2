# Dvorik GPT Version

Рабочий прототип WebApp для склада, смен, маркировок, импортов и аудита.

## Запуск

```bash
npm install
npm run dev
```

Локальный адрес: `http://localhost:5177`.

## Telegram test mode

```bash
npm run dev:test
```

- `http://localhost:5177/?tgUserId=u-admin` — локальный вход через подписанный Telegram `initData`.
- В шапке доступен переключатель `Demo / TG Test`.
- Реальный Telegram WebApp использует `window.Telegram.WebApp.initData` автоматически.
- Dev endpoints: `GET /api/dev/config`, `POST /api/dev/telegram/init-data`; в production они выключены без `DVORIK_DEV_TOOLS=1`.

## Проверки

```bash
npm run check
npm run test
npm run build
npm audit --omit=dev
npm run job:backup
npm run job:backup:cash
npm run job:backup:staff
```

## Реализовано

- роли и HttpOnly cookie-сессии;
- Telegram WebApp init-data auth: `POST /api/auth/telegram`;
- локальный Telegram test mode;
- новый permission-aware admin shell с grouped sidebar;
- самостоятельные frontend-вкладки для всех разделов сайдбара;
- группы, товары, производители, упаковки, история цен;
- общий остаток отдельно от размещения, движения и отмена операций;
- единая инвентаризация весовых товаров, ручной расход, брак и корректировки
  общего остатка с защитой от двойного списания;
- общий календарь, смены 10:00–21:00, нефинансовые профили сотрудников и
  кадровые события;
- взаимный обмен двумя сменами с предупреждениями, аудитом и уведомлениями;
- роли seller/admin/super_admin, Telegram onboarding, блокировка и немедленный
  отзыв сессий;
- надёжный Telegram outbox, складские threshold/zero уведомления и напоминания
  об активной инвентаризации;
- PDF-этикетки с количеством, графическими Code 128/EAN-13 штрихкодами, журналом заданий и повторной печатью;
- import поставок и merge сохранены как legacy/deferred и выключены в production scope;
- backup/list/restore состояния;
- OpenAPI route map: `GET /api/openapi.json`.
- health/liveness: `GET /healthz`, `GET /live`; readiness: `GET /ready`;
- проверяемый SQLite+media backup job с retention и контролем свободного места;
- Saby Retail: webhook-signal, официальный polling продаж, reconciliation,
  возвраты, late-state compensation и очередь сопоставления;
- отдельные процессы и SQLite для Cash и Staff, подписанный внутренний HTTP,
  retryable outbox и независимые backup-задачи;
- поставки, партии, FIFO-себестоимость, весовые упаковки и продуктовая
  рентабельность;
- Company read-модели, объединяющие события Warehouse, Cash и Staff без чтения
  их операционных таблиц;
- SQLite persistence: `data/dvorik.sqlite`; production запрещает `DVORIK_STATE_FILE`.

## Ограничения

- Saby подготовлен до стадии подключения реального аккаунта; его активация
  требует credentials, `pointId`, публичного URL и контрольной продажи/возврата.
- Зарплата и полный финансовый учёт компании не входят в текущий контур.
- Daily scheduler и desktop magic link не входят в текущий независимый scope.

Настройка Saby: [docs/SABY_INTEGRATION.md](docs/SABY_INTEGRATION.md).
Запуск и переключение модульной архитектуры:
[docs/MODULAR_RUNTIME.md](docs/MODULAR_RUNTIME.md).
