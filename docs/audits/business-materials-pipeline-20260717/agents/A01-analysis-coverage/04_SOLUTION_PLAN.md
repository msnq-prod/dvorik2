# A01 — план устойчивого исправления

## Рекомендуемое направление

Не дополнять текущие четыре карточки вручную. Сохранить запуск `dvorik-20260717` как исторический невалидный результат и **пересобрать Evidence Graph с нуля** после фиксации границ. Иначе неверная mode-классификация и неподтверждённые claims останутся в downstream-материалах.

## Порядок работ

### 1. Остановить распространение текущего handoff

- Пометить текущий analysis handoff как `SUPERSEDED_INCOMPLETE` или эквивалентный недоставляемый статус.
- Запретить skills обучения и визуализации принимать handoff с:
  - `links = 0`;
  - пустыми role/data/integration maps для непустого process catalog;
  - `unknown` dimensions;
  - незакрытым inventory receipt.
- Сохранить старый каталог без удаления для аудита происхождения уже созданных PPTX.

Закрывает: `P1-A01-01`, `P1-A01-02`, `P1-A01-04`, `P1-A01-06`.

### 2. Зафиксировать канонический mode map

Создать отдельный machine-readable manifest до inventory:

| Mode | Канонический корень | Authority | Правило |
|---|---|---|---|
| `current` | `gpt-version/` | executable primary | Единственный актуальный продукт согласно `gpt-version/docs/PROJECT_STATE.md:19-23` |
| `legacy` | `recovered-dvorik/` | executable reference | Только источник прежних правил и UX; не выдавать за current |
| `target` | утверждённый набор `dvorik-docs-staging/docs/webapp-rebuild/` и/или `docs/crm/` | normative | Для каждого документа зафиксировать приоритет, дату и область действия |
| `prototype_reference` | root `client/`, `server/`, `shared/` | reference или excluded | Loyalty-заготовка не входит в current без отдельного решения владельца |

Обязательные правила:

- Один root не получает два mode без явного file-level исключения.
- Конфликт executable current и target requirement создаёт `conflicted` claim, а не объединённую «истину».
- До выбора authority между двумя target-комплектами статус анализа — `BLOCKED_SCOPE`, а не Inventory Gate closed.
- Production/release state хранится отдельно от code mode: наличие current-кода не означает подтверждённое развёртывание.

Закрывает: `P1-A01-01`.

### 3. Ввести воспроизводимый source manifest

- Для каждого включённого файла сохранить path, mode, authority, kind, SHA-256, size и scan status.
- Для untracked roots fingerprint-дерево является обязательным; git commit используется только как дополнительная метка.
- Сохранить explicit exclusions с причиной: build artifacts, node_modules, previews, предыдущие analyses.
- При изменении fingerprint автоматически помечать связанные evidence, claims, units и handoff stale.

Закрывает: `P2-A01-07`.

### 4. Перестроить inventory механически по классам

Inventory выполняется без синтеза процессов отдельными проходами:

1. UI: navigation items, pages, dialogs, buttons/actions, role visibility.
2. API: method + path + auth/permission + handler owner.
3. Telegram/CLI: webhook, command, callback, onboarding, polling.
4. Jobs: scheduler, worker, outbox, retry/DLQ, digest, archive, backup.
5. Persistence: table, aggregate/state owner, read/write repositories, migrations.
6. Integrations: Telegram API, media/object storage, filesystem/PDF/export, external converters only если реально используются.
7. Config/flags: deferred launch, dev-only, production-only, environment gates.
8. Normative target requirements и legacy handlers теми же классами.

Каждый scanner создаёт receipt: roots checked, patterns/parsers used, matched count, classified count, exclusions и parse failures.

### 5. Ужесточить Inventory Gate

Gate закрывается только если одновременно:

- каждый source manifest entry имеет `scanned`, `excluded_with_reason` или `unavailable`;
- каждый scanner receipt сбалансирован: `matched = classified + excluded + parse_failed`;
- каждый UI action/API/handler/job/table/integration/flag имеет стабильный Surface ID;
- каждая Surface либо связана с process candidate, либо отклонена с доказательством;
- нет `parse_failed`, orphan surface и локально закрываемых gaps;
- top-down, bottom-up и cross-check выполнены независимыми проходами;
- zero-delta разрешён только после сравнения inventory с route/page/table/handler manifests, а не по заявлению агента.

Для большого `gpt-version/src/server/index.ts` endpoint является surface, но не автоматически процессом: интегратор группирует surfaces вокруг одного триггера, результата и владельца состояния.

Закрывает: `P1-A01-02`, `P1-A01-05`.

### 6. Ввести claim-level evidence validation

- Один Evidence описывает одно наблюдение и точный диапазон строк; рекомендуемый предел — 20 строк, превышение требует обоснования.
- `confirmed` разрешён только по executable/current observation либо проверенной runtime-трассе.
- `declared` разрешён только по нормативному source того же mode.
- `inferred` требует перечисления premises и не используется как инструкция пользователю без явной маркировки.
- Негативный claim «не предусмотрено» требует search receipt по полному нормативному набору, а не отсутствия в одном диапазоне.
- Locator validator подтверждает существование path/line range и наличие ключевого semantic anchor.
- Reviewer повторно читает source; он не принимает один evidence blob для несвязанных claims.
- Фразы вроде `Idempotency-Key`, background job, role или permission запрещено переносить между modes без отдельного Link типа `comparison`, который не меняет статус claim.

Закрывает: `P1-A01-03`.

### 7. Исправить семантику process coverage

Для каждого dimension допустимы только:

- `covered` — есть `confirmed`/`declared` claim с валидным evidence;
- `not_applicable` — есть проверенное обоснование;
- `conflicted` — есть несовместимые claims и открытый conflict;
- `unknown` — открыт Gap; процесс не проходит complete gate.

`unknown` никогда не считается covered. `externally_blocked` требует непустой список unavailable sources и доказательство попытки доступа. Если closure file присутствует в manifest, gap возвращается в очередь.

Закрывает: `P1-A01-04`, `P1-A01-05`.

### 8. Пересобрать процессы небольшими блоками

- Декомпозиция: domain → capability → process candidate → unit.
- Unit: один trigger, один terminal outcome, один state owner, не более 10 первичных фрагментов.
- Начать current с областей navigation manifest: auth/onboarding, products, stock/reversal, inventory, labels, schedule/swaps, users/access, reports, audit/backups; затем import/undo, merge/undo, notifications/outbox и operations.
- Legacy и target анализировать отдельно; сравнение current↔target↔legacy строить links после завершения карточек каждого mode.
- Для каждого процесса создать двусторонние links к roles, permissions, data read/write, states, jobs, integrations, notifications и controls.

Закрывает: `P1-A01-02`, `P1-A01-06`.

### 9. Миграция результатов

- Создать новый корень анализа, например `dvorik-20260717-r2`; не перезаписывать старые records.
- Переносить из старого запуска только claims, прошедшие повторную evidence-проверку; ID можно сохранить через `supersedes` link.
- Старые четыре process IDs сопоставить с новыми:
  - root `proc_current_user_api` не переносить в current; либо исключить, либо перевести в prototype reference;
  - legacy import разделить на пользовательский вход, нормализацию, commit/duplicate handling и notification links в рамках одного процесса/нескольких units;
  - target stock/labels пересоздать из точных нормативных evidence.
- Learning/visual materials пересобрать после нового handoff. Допустимо переиспользовать только нейтральный brand layer, не текст/storyboards/content QA.

### 10. Финальные stop gates

- `VERIFIED_COMPLETE` возможен только при независимом reviewer и полностью закрытом inventory.
- `COMPLETE_WITH_GAPS` допустим только для действительно недоступных runtime/external фактов после 100% локального inventory.
- Handoff запрещён при пустых обязательных maps, open conflict, unknown dimension, stale source или несовпадении snapshot.

## Альтернативы

### A. Дополнить текущий каталог

Не рекомендуется. Быстрее, но сохраняет неверный mode map, загрязнённые claims и невозможность доказать, что старые visual artifacts не используют ошибочные данные.

### B. Пересобрать только `gpt-version`

Допустимо как первая волна. Быстрее даёт корректные материалы current, но не закрывает исходный запрос о legacy/target и сравнении версий. Итог должен называться `current-only`, не «полный проект».

### C. Полная пересборка по mode map

Рекомендуется. Дольше, зато обеспечивает изоляцию версий, доказательность и безопасный downstream.

## Риски внедрения

- Число surfaces и units существенно вырастет; нужны checkpoints и доменные волны.
- Два набора target-документов могут конфликтовать; решение authority требует владельца продукта.
- Runtime-интеграции могут остаться недоступны; это допустимый gap, но не причина пропускать локальный код.
- Повторное использование старых PPTX создаст скрытый drift; контент нужно генерировать заново.

