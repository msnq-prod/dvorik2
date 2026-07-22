# Solution plan

## Применённые корректировки

1. Разделить reference tax treatment и management override премии.
2. Добавить payroll formula gate до расчётной части B07.
3. Расширить Saby state machine компенсирующими late-state transitions.
4. Добавить обязательную ручную operational initialization перед отключением
   legacy.
5. Добавить acceptance backup job, error alert и retention, не нарушая отказ от
   restore test.

## Рекомендуемый порядок

1. B01 получает реальные Saby и supplier fixtures.
2. B02 фиксирует схемы revisions, reference/management facts и initialization
   checklist format.
3. B06 реализует replay всех late-state transitions.
4. Перед B07 владелец принимает payroll formula examples.
5. B10 проверяет initialization и backup job до release decision.

## Verdict

План валиден после внесённых корректировок. Переразбиение B01–B10 не требуется.
