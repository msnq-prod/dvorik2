# P03 — Acceptance gates

- [ ] Staff artifact process smoke passes with actionable diagnostics.
- [ ] Core and Staff readiness reports exact schema and dependency state.
- [ ] Identity/status/session/outbox commit and roll back atomically.
- [ ] Duplicate/out-of-order/restarted delivery preserves newest revision.
- [ ] Core/Staff backups restore as one consistent checkpoint.
- [ ] Migration row digests and anti-joins match for every supported entity.
- [ ] Unsupported legacy staff tables are zero or have approved disposition.
- [ ] Telegram pending → approve → login → block denies old cookie and new login.
- [ ] Staff projection reaches Core status/revision within SLO with zero dead letters.
- [ ] Profile/HR changes survive reload; dismissal handles future shifts as declared.
- [ ] Post-write rollback mechanism is rehearsed.
- [ ] Finalization is absent from MVP go-live steps.
