# Problems

### P1-A01-01: Управленческий переключатель премии мог выглядеть как налоговая трактовка

- **Promise:** внутренний toggle не подтверждает законное освобождение обычной
  трудовой премии.
- **Reality:** исходный план описывал toggle и предупреждение, но не требовал
  отдельного reference-признака облагаемой премии.
- **Evidence:** `docs/production-requirements-discovery.md:511` и `:616`;
  исправление — `docs/план работ/16_РАСПИСАНИЕ_И_ЗАРПЛАТА.md:84` и
  `docs/план работ/17_ФИНАНСЫ_НАЛОГИ_АНАЛИТИКА.md:127`.
- **Effect:** финансовый интерфейс мог создать ложное впечатление юридического
  освобождения.
- **Cause:** смешение reference и management layers.
- **Status:** confirmed, resolved in plan.

### P1-A01-02: Payroll formula не была полностью определена

- **Promise:** зарплата, аванс, НДФЛ, взносы и кадровые корректировки дают
  воспроизводимый результат.
- **Reality:** scope не определяет, оклад является начисленной суммой или суммой
  к выплате, и не фиксирует полный порядок налогов/аванса.
- **Evidence:** `docs/production-requirements-discovery.md:496`–`:519`;
  gate добавлен в `docs/план работ/16_РАСПИСАНИЕ_И_ЗАРПЛАТА.md:89`.
- **Effect:** две реализации могли дать разные зарплатные расходы.
- **Cause:** неполная формальная спецификация расчёта.
- **Status:** confirmed, implementation blocked by formula gate until specified.

### P1-A01-03: Не были определены поздние переходы Saby

- **Promise:** overlap polling получает поздние изменения, удаления и возвраты
  без потерь.
- **Reality:** нормальный импорт был описан, но не было явного правила для уже
  применённой продажи, позднее ставшей удалённой/отказанной, либо изменившей
  цену и количество.
- **Evidence:** `docs/production-requirements-discovery.md:269`; исправление —
  `docs/план работ/15_SABY_И_ПРОДАЖИ.md:50` и `:116`.
- **Effect:** stock и выручка могли остаться завышенными.
- **Cause:** неполная state machine внешней продажи.
- **Status:** confirmed, resolved in plan; real fixtures still required.

### P1-A01-04: Cutover не имел gate начальных операционных данных

- **Promise:** legacy-данные не мигрируются, а legacy полностью отключается.
- **Reality:** без ручной инициализации каталог, остатки, пользователи, mappings
  и настройки отсутствовали бы в новой системе.
- **Evidence:** `docs/production-requirements-discovery.md:686`–`:689`;
  исправление — `docs/план работ/19_КАЧЕСТВО_ПИЛОТ_PRODUCTION.md:79`–`:84`.
- **Effect:** production мог формально запуститься, но быть операционно пустым.
- **Cause:** смешение отсутствия migration с отсутствием initialization.
- **Status:** confirmed, resolved in plan.

### P2-A01-05: Политика backup не имела приёмки job и retention

- **Promise:** backup выполняется раз в неделю и хранится месяц.
- **Reality:** был отражён отказ от restore test, но не проверялись запуск job,
  создание bundle, ошибки и удаление просроченных копий.
- **Evidence:** `docs/production-requirements-discovery.md:682`–`:683` и `:709`;
  исправление — `docs/план работ/19_КАЧЕСТВО_ПИЛОТ_PRODUCTION.md:91` и `:136`.
- **Effect:** политика могла существовать только на бумаге.
- **Cause:** отказ от restore test ошибочно расширялся на проверку самой job.
- **Status:** confirmed, resolved without adding restore verification.
