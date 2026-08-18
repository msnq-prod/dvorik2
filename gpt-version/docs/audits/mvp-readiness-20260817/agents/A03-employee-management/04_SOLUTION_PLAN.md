# A03 — минимальный план запуска MVP

## Рекомендуемое решение

Запускать Staff как внешний сервис, но считать cutover отдельной обязательной операцией до production traffic. До первого запуска закрыть два P1: наблюдаемый Staff smoke test и runbook/rehearsal миграции.

## Последовательность

1. **Зафиксировать MVP-границу.** Включить: Telegram onboarding, роли, блокировку, employment profile, HR events. Отложить: зарплату, автоматическое снятие смен при увольнении, расширенный HR workflow.
2. **Подготовить runbook.** Описать preflight, backup core+staff, команды `staff:migrate` и проверки counts/FK, запуск services, smoke API, условия запуска `staff:finalize-cutover`, rollback до finalization. Хранить runbook рядом с deploy.
3. **Rehearsal на копии production DB.** Запустить migration в пустую Staff DB; сверить identities/profiles/events/days/shifts/assignments/exchanges; проверить core+staff через UI и internal status. Не делать finalize, пока проверки не приняты.
4. **Исправить test observability и подтвердить процесс.** Staff HTTP smoke test обязан выдавать stderr child process и стабильно проходить. Это release gate.
5. **Закрыть identity consistency.** Долговременный вариант: identity outbox в core с доставкой `userId,status` в Staff, retry и idempotency; применить к onboarding/status/role updates. До реализации — операционный guardrail: после каждого block/archive вручную синхронизировать identity в Staff и проверить отсутствие будущих смен.
6. **Закрыть MVP UI увольнения.** Добавить поля employment status/dismissedOn с валидацией; решить правило: увольнение блокирует access и требует обработки будущих смен либо это делает администратор явно. Добавить E2E.
7. **Production go-live.** Сначала Telegram webhook/onboarding и session revoke, затем Staff UI/profile/HR. Только после successful smoke и cutover выполнить archival finalization.

## Канонические источники

- Access, role, user status, sessions: core identity DB.
- Employment profile, HR events, shifts: Staff DB.
- Core передаёт только status snapshot; Staff не должен самостоятельно менять account status/role.

## Минимальные release gates

- Все production env обязательны; Staff `/ready` и core `/ready` возвращают 200.
- Реальный `/start` → pending → approve → WebApp login → block → cookie получает 401.
- Profile и HR event создаются через WebApp и видны после reload.
- Staff migration counts и `PRAGMA foreign_key_check` совпадают; backup проверен.
- `npm run test:staff-process`, identity/session/migration/finalize тесты зелёные.

## Альтернативы

- **Отложить внешний Staff:** оставить модульный in-core staff временно. Быстрее, но production config сейчас требует external Staff; потребует изменения deployment policy.
- **Запустить только user access:** не мигрировать profile/HR/schedule. Самый быстрый вариант, но не удовлетворяет заявленному MVP управления сотрудниками.
- **Операционный bridge для identity sync:** допустим только кратко для MVP, с журналом блокировок; не заменяет outbox.
