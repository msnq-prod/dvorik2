# A01 Solution Plan

## Recommended direction

Keep current as the canonical domain/API and add a Telegram adapter.

1. Add canonical endpoints/use-cases for `my calendar`, `day detail`, `closed day`, `rotation template`, `schedule export` and `swap notification`.
2. Implement the Telegram calendar as a thin presentation layer over those use-cases; use a 42-cell month grid.
3. Reuse current identities, permissions, sessions/audit and location-aware shifts.
4. Port legacy's exactly-one-assigned validation into swap acceptance and add overlap checks for the target.
5. Add a rotation-template entity instead of hard-coding 2/1 and 2/2; preview generated changes before commit.
6. Deliver swaps, schedule changes and stock alerts through an outbox/worker with retry and audit.
7. Restore registration requests through current `pending/active/rejected` statuses and super-admin approval.

## Do not port

- direct SQL from Telegram handlers;
- 35-day calendar rendering;
- silent `except: pass` delivery failures;
- destructive schedule generation without preview/versioning.

