# Recommendations

## 1. Зафиксировать текущую карту проекта

Создать краткий `docs/PROJECT_STATE.md`: что является текущим приложением, что прототипом, что legacy, что target docs.

## 2. Принять архитектурное решение

Выбрать один путь:

- переносить `gpt-version` в основной repo;
- или развивать root scaffold и переносить туда домены;
- или сохранить Python-system как production base.

## 3. Не дорабатывать root UI до выбора доменной основы

Иначе появятся новые mock-экраны без backend.

## 4. Если остается React/Express/PostgreSQL

Порядок реализации:

1. auth/session/roles;
2. products/locations;
3. stock operations and balances;
4. shifts/swaps;
5. labels/jobs;
6. imports;
7. audit/reporting;
8. Telegram production integration.

## 5. Использовать `recovered-dvorik` как reference

Извлечь правила, не переносить стек автоматически.

