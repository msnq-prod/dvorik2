# A01 — проблемы

## P1 — B02 нельзя считать завершённым по собственному плану

Severity: high.

План B02 требует модель supplies/supply rows/lots/FIFO/delivery cost, period closures, payroll settings, expenses, tax rules и financial periods (`docs/план работ/11_АРХИТЕКТУРА_И_ДАННЫЕ.md:30-51`). В migration set таких таблиц нет: поиск `CREATE TABLE` находит catalog/inventory/HR/Saby, но не перечисленные сущности. Следовательно, основание B02 неполно, даже если соответствующие workflows отложены.

Также отсутствуют заявленные артефакты B02: data dictionary, target ERD, permission matrix, API error/idempotency contract и compatibility report. В `gpt-version/docs` есть ADR и отдельные спецификации, но нет этих документов как завершённого набора.

## P2 — критерий B02 «все production routes и workers не используют AppState» доказан лишь условно

Severity: medium.

`index.ts` сохраняет большой legacy fallback и прямые mutation paths, например создание товара `index.ts:853-894`, изменение товара `931-958`, архивирование `1012-1020`, задания этикеток `1680-1735`. В текущей production-конфигурации доступ к legacy runtime превращается в ошибку (`50-68`), поэтому production path не использует AppState фактически. Но тест `transport-boundary.test.ts:5-10` проверяет только отсутствие SQL и транзакции, а не отсутствие legacy mutation branches. Регрессия флага production или неполный переход маршрута останутся незамеченными.

## P3 — B03: не доказана приёмка мобильного сценария и сканирования

Severity: medium.

План требует camera barcode scanning и mobile E2E на 390 px (`12_КАТАЛОГ_И_СКЛАД.md:58-76,123-124`). В клиенте поиск по `BarcodeDetector`, camera и scan не находит реализации; тестовые файлы B03 — service/concurrency, а не browser E2E. Поиск barcode в UI находит поле ввода и поиск текста (`ProductsPage.tsx`, `LabelsPage.tsx`), но не камеру. Поэтому критерий «основные сценарии на 390 px без горизонтального скролла» не подтверждён.

## P4 — B03: отключение полки и список нераспределённого товара не подтверждены

Severity: medium.

План требует отключение полки без изменения общего остатка и последующий список поступившего для распределения (`12_КАТАЛОГ_И_СКЛАД.md:40-45`). В реализации есть archive location (`catalog-service.test.ts:47-52`) и total projection (`migrations/009_catalog_warehouse.sql:60-103`), но не найдены отдельная модель/запрос «товар, поступивший во время отключения», UI или тест этого сценария.

## P5 — B03: история операции/компенсация не имеет UI-подтверждения

Severity: low.

Сервисный уровень содержит операции и rollback tests, но в `StockPage.tsx` не найдено отдельного history/reversal workflow. Это не опровергает API, однако заявленный артефакт «history/reversal view» не доказан исходниками и UI-тестами.
