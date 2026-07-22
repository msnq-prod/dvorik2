# A01 — проверка плана

## Что уже подтверждено в итерации 1

- Сохранённые SHA-256 трёх зарегистрированных sources совпадают с текущими файлами.
- Ошибка вызвана не изменением этих файлов, а отсутствием большинства sources/surfaces.
- Подтверждены counts: 71 HTTP registrations в current `gpt-version`, 48 в root prototype, 116 legacy message/callback registrations, 12 legacy routers.
- Подтверждены пустые role/data/integration maps и `links: 0` в handoff/coverage.
- Подтверждены неверные evidence ranges и `unknown` dimensions со статусом `covered`.

## Проверка после реализации исправлений

### 1. Mode-map gate

- `current` inventory содержит `gpt-version` и не содержит root prototype без explicit override.
- `legacy` содержит `recovered-dvorik` только как reference.
- Каждый target source имеет authority/priority; конфликтующие документы создают conflict, а не молчаливое объединение.
- Проверка: выбрать по 5 случайных records каждого mode и подтвердить, что path принадлежит разрешённому root.

### 2. Source manifest и staleness

- Все включённые roots имеют file-level manifest и aggregate digest.
- Тест: изменить копию одного UI, API, migration, worker и target-document файла; связанные surfaces/evidence/claims/units должны стать stale, Inventory Gate — reopen.
- Тест: изменение excluded build artifact не должно инвалидировать анализ.
- Git-untracked root должен обнаруживаться через fingerprint без зависимости от commit.

### 3. Inventory completeness

Минимальные reconciliation checks:

- route registrations ↔ endpoint surfaces;
- navigation/page/action entries ↔ UI surfaces;
- Telegram webhook/command/callback entries ↔ bot surfaces;
- CREATE TABLE/migration entries ↔ data surfaces;
- worker/scheduler/outbox entrypoints ↔ job surfaces;
- config/deferred flags ↔ control surfaces.

Gate должен падать при удалении из inventory хотя бы одного известного endpoint, handler, table или worker fixture.

### 4. Evidence validation

Негативные fixtures, которые обязаны отклоняться:

- label claim с locator `requirements.md:35-74`;
- `Idempotency-Key` как `declared` по `docs/crm/requirements.md`;
- background PDF claim без нормативного или executable evidence;
- current claim, доказанный только legacy source;
- line range вне файла или после изменения fingerprint;
- один broad evidence, используемый для несвязанных role/data/job claims.

Позитивный fixture: label requirements с точными locators `requirements.md:76-87` проходит как `declared`, но не как `confirmed current`.

### 5. Coverage semantics

- `unknown + covered` должно быть schema/gate error.
- `externally_blocked` с пустым `unavailable_source_ids` должно быть error.
- Локально существующий closure path должен возвращать gap в actionable queue.
- `not_applicable` без evidence-backed rationale должно быть error.
- Любой open conflict запрещает `VERIFIED_COMPLETE`.

### 6. Bidirectional links

- Для каждого process проверить обратные ссылки role/data/job/integration/notification/state.
- Для каждого значимого table/job/integration проверить хотя бы один process link либо явное техническое исключение.
- Пустые maps при непустом process catalog должны блокировать handoff.

### 7. Process sampling

Независимо проследить минимум следующие current-процессы end-to-end:

1. Telegram auth/onboarding.
2. Stock operation + reversal + audit/idempotency/outbox.
3. Inventory apply.
4. Schedule create/update/swap.
5. Import preview/commit/undo.
6. Label preview/PDF/reprint.
7. Backup/create/list/restore preflight.

Для каждого проверить UI trigger, API, permission, service/state owner, DB reads/writes, negative path, result и notification/job effects.

### 8. Migration and downstream

- Новый run имеет `supersedes` ссылку на старый, но не импортирует непроверенные claims.
- Поиск старых invalid claim IDs в новых learning/storyboard/PPTX source packets возвращает 0.
- Все новые learning/visual units ссылаются только на новый finalized handoff.
- Content QA должен отклонять утверждения, которых нет в process cards/evidence.

## Команды/проверки для будущего выполнения

- `rg`/AST-парсер для manifests routes, pages, handlers, tables, workers и flags.
- CLI `coverage`, `validate-unit`, `finalize` на позитивном и негативных fixtures.
- SHA-256 staleness tests на временной копии проекта.
- JSON schema validation всех records/links/handoffs.
- Выборочная ручная перепроверка locators независимым reviewer.

## Критерий приёмки A01

A01 считается исправленным, когда новый current-каталог покрывает все reconciled surfaces `gpt-version`, каждый поведенческий claim имеет точное evidence, unknown/conflicts честно блокируют completeness, а role/data/job/integration maps имеют двусторонние links. До этого старый handoff и созданные из него визуальные материалы не считаются достоверным описанием проекта.

## Остаточный риск

Даже после локального `VERIFIED_COMPLETE` фактическое production-поведение Telegram/object storage/workers останется `COMPLETE_WITH_GAPS`, пока не подтверждены окружение, release и runtime traces.

