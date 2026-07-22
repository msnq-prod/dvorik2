# Independent analysis

## Provenance

Независимый субагент полностью прочитал discovery, implementation plan и весь
комплект B01–B10. После передачи предварительного вывода его запись файлов была
прервана лимитом среды. Этот файл восстановлен главным агентом строго по
полученному независимому сообщению и дополнен проверяемыми ссылками.

## Проверенный scope

- `docs/production-requirements-discovery.md`;
- `docs/production-requirements-implementation-plan.md`;
- `docs/план работ/00_SCOPE.md`;
- `docs/план работ/01_ОБЩАЯ_СТРАТЕГИЯ.md`;
- `docs/план работ/03_CROSS_AREA_MAP.md`;
- detailed plans B01–B10;
- service files `README.md`, `02_ORCHESTRATION.md`, `99_PROGRESS.md`.

## Независимый вывод

Базовая декомпозиция валидна. Все разделы discovery назначены рабочим блокам,
критическая последовательность склад → поставки → инвентаризация/Saby → финансы
сохранена. План требовал корректировок по пяти подтверждённым зонам.

## Coverage summary

| Area | Coverage | Verdict |
| --- | --- | --- |
| Scope/non-goals | полный | valid |
| Каталог, stock, placements | полный | valid |
| Поставки, FIFO, import, merge | полный | valid |
| Инвентаризация и весовой расход | полный | valid |
| Saby normal flow | полный | valid |
| Saby late-state transitions | был неполным | corrected |
| Расписание и HR | полный | valid |
| Payroll/tax treatment | был неоднозначным | corrected with formula gate |
| Финансы и УСН | полный после payroll gate | corrected |
| Roles/UX/notifications | полный | valid |
| Cutover without migration | отсутствовал operational-data gate | corrected |
| Backup policy | риск отражён, job acceptance был неполным | corrected |

## Source-of-truth assessment

- Dvorik catalog remains canonical over Saby.
- Stock aggregate is separate from approximate placements.
- Inventory closure owns actual weighted consumption.
- Saby owns actual sales and revenue.
- FIFO owns cost allocation.
- Payroll owns salary result; finance consumes it.
- Owner-only access is preserved for payroll, tax and profit.

После корректировок конфликтующих владельцев состояния не найдено.
