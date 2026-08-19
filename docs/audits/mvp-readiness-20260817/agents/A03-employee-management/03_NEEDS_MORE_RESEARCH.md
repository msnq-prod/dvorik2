# A03 — что проверить до запуска

- Выполнить rehearsal на копии production DB: backup, `staff:migrate`, сравнение count/выборочных записей, запуск core+staff, затем только при подтверждении `staff:finalize-cutover`. Зафиксировать rollback до finalization.
- Воспроизвести `npm run test:staff-process` вне sandbox/CI и вывести stderr дочернего процесса; blocker снимается только после green smoke test.
- Пройти реальный Telegram путь: `/start` → pending user → approve seller/admin → WebApp login → block → старый cookie получает 401. Нужны реальные webhook URL и secret.
- Проверить MVP-политику увольнения: должен ли `dismissed` автоматически блокировать access, снимать будущие смены и синхронизироваться в Staff.
- Добавить/пройти E2E сценарии UsersPage: permissions admin vs super_admin, onboarding, blocked session, profile dismissal, HR event.
