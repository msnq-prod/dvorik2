# Progress

- [x] Scope locked
- [x] Boundaries mapped
- [x] All actions mapped
- [x] Data lineage complete
- [x] State machines complete
- [x] UI truth matrix complete
- [x] Negative paths complete
- [x] Findings classified
- [x] Fix plan written
- [ ] P0/P1 fixes implemented or explicitly deferred
- [ ] Verification complete
- [ ] Stop Gates passed

## Текущий инкремент

- [x] FND-01: решения и ADR
- [x] FIX-01: валидация получателя и конфликта при принятии подмены
- [x] UI-01: dashboard назначен главной страницей с быстрыми действиями
- [x] DB-01: зафиксирован дизайн нормализованной SQLite-схемы
- [x] DB-01: добавлена versioned SQLite migration v2
- [ ] DB-02: repository layer и перевод critical services
- [x] DB-03: converter `app_state.payload` → таблицы, dry-run, backup и проверки
- [x] SCH-01: дни/закрытия локаций и несколько назначений
- [x] SCH-02: rotation preview/atomic commit/idempotency
- [x] SCH-03: day detail, CSV/PDF экспорт и массовая будущая замена
- [x] BOT-01: webhook adapter, проверка секрета и дедупликация update_id
- [x] BOT-03: pending onboarding и transactional outbox worker foundation
- [ ] BOT-02/NTF-01: inline календарь, Telegram transport, preferences/digest

## Next

Следующий инкремент: BOT-02/NTF-01 — inline-календарь, transport и preferences.

## Blockers

Нет.
