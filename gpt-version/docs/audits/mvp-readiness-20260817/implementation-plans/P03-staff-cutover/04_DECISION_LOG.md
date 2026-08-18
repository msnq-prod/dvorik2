# P03 — Decision log

| Review feedback | Decision | Final-plan change |
|---|---|---|
| Option A needs revisioned inbox | accepted | Added transactional outbox, monotonic revision and idempotent inbox. |
| Synchronous delivery is unsafe as truth | accepted | Kept only as optional post-commit latency optimization. |
| Migration needs fixed snapshot/watermark | accepted | Added bounded write freeze and exhaustive digest validation. |
| Finalization adds no MVP value | accepted | Deferred beyond launch and separate approval. |
| Post-write rollback was undefined | accepted | Requires compatible artifact or reverse replay before go-live. |
| Dismissal/access/schedule invariants missing | accepted | Added fail-safe workflow and combined scheduling rule. |
| Embedded production Staff | rejected | Conflicts with production boundary and only postpones risk. |
