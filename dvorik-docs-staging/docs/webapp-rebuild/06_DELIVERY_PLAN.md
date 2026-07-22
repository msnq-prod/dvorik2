# План реализации

## Этап 0. Основа репозитория

- Восстановить Git.
- Удалить технические дубли и локальное окружение из version control.
- Выбрать стек.
- Создать короткий root `AGENTS.md`.
- Добавить ADR, CI и versioned migrations.

Критерий: чистый clone проходит одну документированную команду проверки.

## Этап 1. Контракты и identity

- Схема пользователей, ролей, permissions и sessions.
- Telegram init data.
- Magic-link token для standalone browser.
- Регистрация и одобрение.
- Permission matrix tests.

## Этап 2. Каталог

- Товары, identifiers, категории, теги и фото.
- Поиск и barcode scan.
- Архив и корзина.
- Mobile/desktop карточка товара.

## Этап 3. Склад

- Локации и иерархия.
- StockBalance и неизменяемый StockOperation.
- Перемещение, списание в зал, быстрое действие `1`.
- Reversal operation.
- Гонки, идемпотентность и audit tests.

## Этап 4. Инвентаризация

- Выбор локации.
- Ввод фактического количества.
- Conflict detection.
- Атомарные корректировки.

## Этап 5. Расписание и уведомления

- Календарь.
- Ручные назначения.
- Обмен сменами.
- Telegram и WebApp notification center.
- Экспорт PNG/PDF.

## Этап 6. Отчёты и дубли

- Пять подтверждённых отчётов и экспорт.
- Кандидаты дублей.
- Preview/apply/undo merge.

## Этап 7. Поставки

- Новый wizard.
- Supplier mappings.
- Review неоднозначностей.
- Атомарный import.
- Решение по provenance/rollback до реализации отката.

## Этап 8. Маркировки

- Отдельный brief полей.
- Адаптация подхода Stones.
- Live preview.
- PDF export.

## Этап 9. Миграция и запуск

- Определить минимальный набор переносимых реальных данных.
- Dry-run миграции.
- Backup.
- Проверка реальными продавцами.
- Финальная миграция в окно недоступности.

## Definition of Done для каждой функции

- Требование и acceptance criteria существуют.
- Permission определён.
- API/schema обновлены.
- Миграция обратима или имеет backup plan.
- Domain tests покрывают инварианты.
- API tests покрывают success, forbidden, conflict и retry.
- UI покрывает loading, empty, error и success.
- Проверена ширина 390 px и desktop.
- Документация обновлена.

