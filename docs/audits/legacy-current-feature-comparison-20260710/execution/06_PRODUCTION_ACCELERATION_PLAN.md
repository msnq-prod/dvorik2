# Ускоренный план выхода в production

Дата: 2026-07-15.

Этот документ задаёт release scope поверх полного
`94_FULL_COMPLETION_PLAN.md`. Полный план не удаляется: отложенные функции
переходят в post-launch backlog. Production launch принимается по этому профилю.

## 1. Scope первого production-релиза

Включить:

- auth/session, users, roles и Telegram onboarding;
- products и базовый catalog;
- stock receipt/transfer/write-off;
- inventory и reversal;
- базовые shifts/days/swaps;
- базовые JSON/CSV/PDF reports;
- локальная загрузка и обработка изображений либо настроенный object storage;
- Telegram delivery для системных и onboarding-сообщений;
- backup, restore, migration, observability и rollback.

Отключить до post-launch:

- tablet offline/buffer;
- imports;
- merge и автоматический archive sweep;
- rotation templates, bulk day closing и future replacement;
- расширенный Telegram calendar/search/stock dialogue;
- daily digest и UI управления outbox;
- aliases CRUD, FTS/ranking enhancements;
- external media URL ingestion;
- дополнительные report types и Telegram report delivery.

Отключение означает: UI скрыт, route отсутствует либо возвращает
`FEATURE_DISABLED`, worker/job не запускается. Оставлять полурабочий путь нельзя.

## 2. Новый порядок: 7 release-эпиков

### EPIC-P1 — закончить identity и зафиксировать scope

Покрывает: `TX-207`, launch feature flags и route inventory.

Сделать:

1. Закончить SQLite identity/onboarding transaction.
2. Проверить callback replay/conflict, last-superadmin, self-demotion,
   cross-process revoke и AppState overwrite regression.
3. Отключить все deferred UI/routes/jobs.
4. Создать launch smoke inventory: только реально доступные действия.

Gate: focused identity tests, two-process HTTP test, `check/test/build`, evidence.

### EPIC-P2 — единый SQLite runtime

Покрывает: `DB-107–109`, обязательные части `TX-203/204/206/209`.

Сделать:

1. Перевести production routes stock/inventory/schedule/products/reports на
   готовые services/repositories.
2. Добавить недостающие query repositories и pagination.
3. Удалить full-state projection и production `AppState`.
4. Запретить запуск production при обнаружении legacy write-path.

Gate:

- `rg` не находит production application reads/writes через `db.*` и
  `stateTransaction`;
- два API-процесса и worker сразу видят одни изменения;
- business write, audit, idempotency и outbox атомарны.

### EPIC-P3 — production outbox и Telegram worker

Объединяет: `OUT-301–307`, обязательную часть `NTF-701`, `BOT-701/704`,
`TST-1307`.

Сделать одним vertical slice:

1. Event catalog и versioned payloads.
2. Transactional enqueue.
3. Atomic lease/claim, retry/max attempts/failed state.
4. Supervised worker loop и graceful shutdown.
5. Telegram timeout/error parsing и duplicate-safe delivery.

Отложить: `OUT-308`, `OUT-309`, `NTF-702`, расширенные bot-команды.

Gate: two-worker race, crash-after-claim, 429/400/5xx, restart и backlog drain.

### EPIC-P4 — security и operations baseline

Объединяет: `SEC-303–307`, `OBS-301–304`, обязательные части `TST-1310/1311`.

Сделать:

- declarative route policy и разделённые опасные permissions;
- CSRF/origin/security headers;
- request schemas, body limits и rate limits;
- structured logs/correlation;
- live/ready, DB writable/schema/media/worker readiness;
- минимальные metrics/alerts, graceful shutdown и retention.

`SEC-308` переносится вместе с external URL ingestion; до этого feature выключен.

Gate: direct-route permission negatives, malformed/oversized requests,
read-only/locked DB, dead worker и controlled 500 видны в readiness/logs/metrics.

### EPIC-P5 — migration, backup и rollback

Объединяет: `MIG-401`, `MIG-403–407`, `BKR-401–404`, `RBK-1401–1403`,
`TST-1304`.

Сделать:

1. Checksummed migrations и настоящий dry-run.
2. Неразрушительный повторяемый converter.
3. Exact invariant verifier.
4. SQLite+WAL+media+manifest backup bundle и remote copy.
5. Restore в новый path с preflight.
6. Две production-like migration rehearsal и один rollback rehearsal.

Gate: повторный converter не меняет результат; restore проходит integrity;
rollback укладывается в измеренный RTO; pending/sent outbox не теряется и не
дублируется.

### EPIC-P6 — объединённая release test matrix

Вместо последовательной реализации четырнадцати test-ID выполнить четыре suite,
сохранив mapping к `TST-1301–1314`:

1. `core`: domain, repositories, API contracts, migrations.
2. `resilience`: concurrency, worker crash, DB/media/Telegram failures.
3. `security`: auth, permissions, CSRF, schemas, rate limits, SSRF-disabled paths.
4. `release`: browser critical paths, smoke, performance baseline, PDF visual.

Обязательные browser flows:

- login/session restore/logout;
- user block/role change;
- product read/create/update;
- receipt/transfer/inventory/reversal;
- schedule create/update/swap;
- report JSON/CSV/PDF;
- Telegram onboarding и outbox delivery;
- restart/reload без потери committed state.

Gate: clean install, `check/test/build`, API/browser/security/failure suites и
production artifact smoke зелёные.

### EPIC-P7 — staged release

Объединяет: `REL-1401–1408`.

Порядок:

1. Immutable artifact и config inventory.
2. Final backup и dry-run/invariant baseline.
3. Остановить legacy writers/workers.
4. Migration в новый path.
5. Read-only smoke → reversible write smoke → Telegram/worker smoke.
6. Ограниченный доступ → полный доступ.
7. Hypercare, post-cutover backup и legacy read-only closure.

Ручная пауза не требуется. Любой красный threshold автоматически запускает
соответствующую ветку rollback.

## 3. Что объединяется, но не теряется

| Старые ID | Новый пакет |
| --- | --- |
| `OUT-301–307`, `NTF-701`, части `BOT-701/704` | `EPIC-P3` |
| `SEC-303–307`, `OBS-301–304` | `EPIC-P4` |
| `MIG-401/403–407`, `BKR-401–404`, `RBK-1401–1403` | `EPIC-P5` |
| `TST-1301–1314` | четыре suite в `EPIC-P6` |
| `REL-1401–1408` | один staged runbook в `EPIC-P7` |

Каждый исходный ID остаётся строкой traceability/evidence, но выполняется внутри
одного интеграционного пакета без лишних пауз между карточками.

## 4. Post-launch backlog

- `TX-205`, `FIX-507/508`, `TAB-1201–1206`;
- `TX-208`, `FIX-506`, `IMP-801–809`;
- расширенные `SCH-604–609/611`;
- `BOT-702/703/705/706`, `NTF-702/703`, `OUT-308/309`;
- `SRCH-1001–1005`;
- дополнительные `RPT-902/906`, `ARC-901–904`;
- `MRG-1001–1007`;
- external media URL и расширенный lifecycle `MED-1103–1107`;
- расширенная tablet/device/visual polish matrix.

Если любая из этих функций остаётся видимой в production, соответствующий блок
автоматически возвращается в release-critical scope.

## 5. Рабочий ритм большой модели

- Ведущий агент держит один epic `in_progress`.
- До трёх субагентов: discovery/review, bounded implementation, focused tests.
- Shared DTO, migrations, transaction boundaries, feature flags, integration и
  финальный gate принадлежат ведущему агенту.
- После каждого исходного ID: task/evidence/registry/progress/handoff.
- После каждого epic: полный gate и production artifact smoke.
- Красная проверка не переносится в следующий epic.

## 6. Definition of Ready for production

- Все EPIC-P1–P6 зелёные и имеют evidence.
- Deferred UI/routes/jobs действительно недоступны.
- SQLite — единственный canonical runtime source of truth.
- Outbox worker переживает race/restart/failure без потерь.
- Security/readiness/logs/metrics дают проверяемый production contract.
- Две migration rehearsal, restore и rollback rehearsal успешны.
- Есть immutable artifact, backup и автоматические rollback thresholds.

После этого выполняется `EPIC-P7` и фиксируется production evidence.

