# Целевая topology личного проекта

Дата: 2026-07-11. Документ фиксирует техническую границу для `DOC-002`.
Заказчик подтвердил personal-project scope: production release, SLO/RPO/RTO и
maintenance window сейчас не применимы. Владелец продукта и технический
владелец — заказчик. Это решение не разрешает production cutover.

## Целевой контур

```text
Internet → reverse proxy → API (HTTP/WebApp/webhook) ─┐
                                                        ├→ persistent SQLite volume
Supervised outbox worker ──────────────────────────────┤
Daily scheduler ───────────────────────────────────────┘

API / worker / scheduler → object storage (media)
API / worker / scheduler → backup storage (encrypted bundles)
```

| Компонент | Единственная обязанность | Persistent state | Запрещено |
| --- | --- | --- | --- |
| API | HTTP, WebApp, Telegram webhook, общие application services | shared SQLite через repository/UoW | каноническая in-memory копия БД, dispatch outbox в request |
| Outbox worker | lease/dispatch/retry/DLQ Telegram и иных сообщений | та же SQLite DB | HTTP API, отдельный full-state payload |
| Scheduler | создаёт digest/archive jobs по расписанию | та же SQLite DB | обработка outbox, in-memory schedule как источник истины |
| SQLite volume | канонические normalized tables, WAL и schema version | persistent mounted volume | JSON fallback, ephemeral container disk |
| Object storage | production media и manifests | отдельный durable bucket | silent local fallback |
| Backup storage | encrypted DB/media bundles и manifests | отдельное хранилище | считать backup рабочим без restore drill |

## Обязательные эксплуатационные границы

- API, worker и scheduler не держат полную копию business state в памяти и
  используют один DatabaseAdapter/repository/UoW contract.
- Каждый mutation фиксирует business write, audit, idempotency и outbox одной
  DB transaction; worker арендует сообщения через durable lease.
- Secrets передаются только через production secret store/env; DB/media/backup
  volumes имеют проверяемые права до `listen`.
- Release artifact содержит version, commit и schema version; backup/restore,
  health и alerting входят в release gate.

## No-go до production cutover

1. Global `AppState`, full-state rewrite или `app_state.payload` остаются в
   production write path.
2. JSON persistence/local media fallback доступны как silent production fallback.
3. Нет двух успешных production-like migration/restore rehearsals и измеренного
   RPO/RTO.
4. Попытка production cutover без отдельного release approval, owners, SLO,
   RPO, RTO и maintenance window.
5. Нет evidence по security, multi-process writes, outbox recovery, browser E2E
   и rollback.

## Решения для personal-project scope

| Решение | Требуемый подтверждающий владелец | Значение | Статус |
| --- | --- | --- | --- |
| Product/release owner | заказчик | заказчик | confirmed |
| Technical/on-call owner | заказчик | заказчик | confirmed |
| SLO availability/latency | заказчик | не применяется без production release | deferred |
| RPO | заказчик | не применяется без production release | deferred |
| RTO | заказчик | не применяется без production release | deferred |
| Maintenance window | заказчик | не применяется без production release | deferred |

`SEC-001` разрешён для разработки. Отдельный production release потребует
заполнить отложенные строки и пройти все no-go. Текущий runtime описан в
`../PROJECT_STATE.md` и не соответствует этому target-контурy.
