# Матрица P0/P1 требований и evidence

Дата: 2026-07-11. Источник ID/приоритетов — `TASK_REGISTRY.md`; целевое
поведение — `../94_FULL_COMPLETION_PLAN.md`. Каждая строка перечисляет все
атомарные ID явно. `evidence/<ID>.md` означает отдельный файл evidence для
каждого ID, а не общий зелёный build.

## Правила принятия

- Owner role — ответственность за результат; named owner ещё должен быть
  назначен в `DOC-002`. Это не снимает его external-approval blocker.
- Automated gate — будущая обязательная проверка. Она не считается пройденной
  до появления фактической команды/лога в `evidence/<ID>.md`.
- Manual/negative gate обязателен для mutation, UI, worker, migration и release.
- Current `npm run check`, `npm test`, `npm run verify:release` не закрывают
  pending IDs: текущий `verify:release` включает только check/test/build/migrate.

| IDs | Owner role | Automated gate | Manual / negative gate | Evidence | Current state |
| --- | --- | --- | --- | --- | --- |
| DOC-001, DOC-002, DOC-003 | Tech lead + platform/operations | Docs trace and matrix completeness check | Review implemented/transitional/target; approve topology numbers | `evidence/DOC-001.md`, `DOC-002.md`, `DOC-003.md` | 001 done; 002 blocked external approval; 003 this matrix |
| SEC-000, SEC-001, SEC-002, SEC-303, SEC-304, SEC-305, SEC-306, SEC-307, SEC-308 | Security/backend | Production route, startup config, cookie/session, RBAC, schema, rate-limit and SSRF contract suites | Known-user/demo, missing secret, role-forbidden, malformed/oversized, CSRF/SSRF probes | `evidence/<ID>.md` | pending; SEC-001 blocked by DOC-002 |
| DB-101, DB-102, DB-103, DB-104, DB-105, DB-106, DB-107, DB-108, DB-109 | Backend/data | In-process adapter, PRAGMA/FK/busy, quantity, UoW rollback, repository mapper/query and no-full-rewrite suites | macOS/Linux driver, two-writer, corrupt mapping, SQL query-plan review | `evidence/<ID>.md` | pending; global AppState P0 remains |
| TX-201, TX-202, TX-203, TX-204, TX-205, TX-206, TX-207, TX-208, TX-209 | Domain/backend | Correlation, idempotency/hash 409, atomic stock/inventory/schedule/auth/import/catalog transaction suites | duplicate/reload/stale/concurrent/forbidden mutation probes | `evidence/<ID>.md` | pending |
| OUT-301, OUT-302, OUT-303, OUT-304, OUT-305, OUT-306, OUT-307, OUT-308, OUT-309 | Worker/backend | Event/inbox/outbox, transactional enqueue, lease race, retry/DLQ, supervised restart, transport and VLAT digest suites | two-worker, kill/restart, transport timeout, manual retry/cancel, midnight run twice | `evidence/<ID>.md` | pending; current worker is one-shot AppState CLI |
| OBS-301, OBS-302, OBS-303, OBS-304 | Platform/SRE | Structured logs, live/ready, metrics/alert and SIGTERM/lease-release suites | trace one request; forced 500/stuck outbox/failed backup/missed worker; controlled shutdown | `evidence/<ID>.md` | pending |
| MIG-401, MIG-402, MIG-403, MIG-404, MIG-405, MIG-406, MIG-407 | Migration/data | Migration checksum, schema contract, dry-run, mapping, rerun, invariant and two-rehearsal suites | inspect conflicts/discards; corrupt/unicode/decimal data; measured rollback | `evidence/<ID>.md` | pending |
| BKR-401, BKR-402, BKR-403, BKR-404 | Platform/data/security | WAL-consistent bundle, retention, corrupt preflight and atomic fresh-path restore suites | manifest/checksum/encryption key, re-auth confirmation, live DB unchanged on failure | `evidence/<ID>.md` | pending |
| FIX-501, FIX-502, FIX-503, FIX-504, FIX-505, FIX-506, FIX-507, FIX-508 | Backend/frontend | Focused regression contract for each defect | real DTO, seller-empty-state, boundary upload, media fallback, archived receipt, SKU duplicate, RBAC, stale count | `evidence/<ID>.md` | pending; independent candidates only after contract review |
| SCH-601, SCH-602, SCH-603, SCH-604, SCH-605, SCH-606, SCH-607, SCH-608, SCH-609, SCH-610, SCH-611 | Schedule domain + frontend | VLAT/date, state-machine, multi-assignment, capacity, visibility, preview/hash, template, replacement, swap and export suites | Dec/Jan/leap, seller visibility, stale preview, concurrent callbacks, CSV/PDF visual parity | `evidence/<ID>.md` | pending; capacity policy needs product approval |
| BOT-701, BOT-702, BOT-703, BOT-704, BOT-705, BOT-706 | Telegram/backend | Fake Bot API update/callback dedupe, 42-cell parity, stale callback, onboarding, search and limit suites | repeated/wrong actor callback, pending/blocked `/start`, calendar/manual Web parity | `evidence/<ID>.md` | pending |
| NTF-701, NTF-703 | Worker/Telegram | preference event matrix; duplicate webhook/secret/error/retry suite | off/instant/daily after reload; wrong secret/inactive actor no mutation | `evidence/<ID>.md` | pending |
| IMP-801, IMP-802, IMP-803, IMP-804, IMP-805, IMP-806, IMP-807, IMP-808, IMP-809 | Import/backend + frontend | Sheet/header, parser limits, mapping, quantity, preview counts, supplier, duplicate, undo and fixture-pack suites | malformed/zip-bomb, manual mapping, invalid unit, dependent undo, anonymised diagnostics | `evidence/<ID>.md` | pending |
| RPT-901, RPT-902, RPT-903, RPT-904, RPT-905, RPT-906 | Reports/backend + QA | Typed query, composition, movement, CSV safety, PDF PNG and Telegram snapshot suites | invalid ranges, CSV in Excel/LibreOffice, Cyrillic/PDF visual, changed-data delivery | `evidence/<ID>.md` | pending |
| ARC-901, ARC-902, ARC-903 | Catalog/backend + frontend | Lifecycle, candidate and dry-run/stale/restore suites | new product, multi-location, typed confirmation, reload truth | `evidence/<ID>.md` | pending |
| SRCH-1001, SRCH-1002, SRCH-1003, SRCH-1005 | Search/backend + frontend | Role/query parity, normalization/ranking, FTS fallback and debounce/cursor suites | no full client load, fallback metric, stale response/reload filter | `evidence/<ID>.md` | pending |
| MRG-1001, MRG-1002, MRG-1003, MRG-1004, MRG-1005, MRG-1006, MRG-1007 | Catalog/backend + frontend | Candidate, persistence, field-policy, preview/version, identifier, balance and atomic-undo suites | false-positive, approval, stale preview, conflict explanation, retry | `evidence/<ID>.md` | pending; field policy needs product approval |
| MED-1101, MED-1102, MED-1103, MED-1104, MED-1105, MED-1106, MED-1107 | Media/backend + security | Upload/decode, transform, persistence, object-store, SSRF, UI and lifecycle suites | spoof/bomb, visual variants, outage, private redirect, retry/delete reference | `evidence/<ID>.md` | pending |
| TAB-1201, TAB-1202, TAB-1203, TAB-1204, TAB-1205, TAB-1206 | Frontend/backend | Role/API, draft isolation, search, projection, validation/version and batch retry suites | seller/restricted role, reload/switch user, keyboard/drag, concurrent inventory/lost response | `evidence/<ID>.md` | pending |
| UI-1201, UI-1202, UI-1203, UI-1204, UI-1205 | Frontend QA/accessibility | Typed async, keyboard, axe/contrast/viewport, device and navigation/deep-link suites | focus/Escape, 320px/zoom, mobile/tablet/WebView, back/forward/dirty form | `evidence/<ID>.md` | pending |
| TST-1301, TST-1302, TST-1303, TST-1304, TST-1305, TST-1306, TST-1307, TST-1308, TST-1309, TST-1310, TST-1311, TST-1312, TST-1313, TST-1314 | QA automation + release | Isolated harness, mutation/API/bot/worker/E2E/failure/security/perf/visual/smoke/release aggregate suites | parallel CI, role walkthrough, fault injection, accessibility and artifact review | `evidence/<ID>.md` | pending; current scripts are materially insufficient |
| REL-1401, REL-1402, REL-1403, REL-1404, REL-1405, REL-1406, REL-1407, REL-1408 | Release manager + SRE/data | Immutable artifact, signed no-go, restore, maintenance, migration, checkpoint, soak and legacy read-only probes | window/comms, no writes, invariants, approved soak, legacy retention | `evidence/<ID>.md` | pending; no production cutover authorised |
| RBK-1401, RBK-1402, RBK-1403 | Rollback owner + SRE/data | Versioned trigger, pre/post-write runbook and recorded rollback rehearsal | owner-driven trigger, journal preservation, RTO/no Telegram loss/no duplicate send | `evidence/<ID>.md` | pending; threshold/decider requires DOC-002 approval |

## Completion check for this matrix

P0/P1 coverage is evaluated from the registry, not by row count. The check must
extract P0/P1 IDs from `TASK_REGISTRY.md`, confirm every ID appears exactly once
in the table above or its own evidence file, and reject an `evidence` path not
matching its ID. On 2026-07-11 the inventory is 153 P0/P1 IDs; only DOC-001 has
accepted implementation evidence. DOC-002 has blocked evidence. All other IDs
remain pending until their listed gates are actually executed.

## Cross-cutting minimums

Every mutation row additionally requires permission, validation, transaction,
idempotency, audit, outbox, retry/reload and user-visible error verification.
Every preview/commit row requires read-only preview plus version/hash stale `409`.
Every UI row requires desktop/tablet/mobile and keyboard evidence. Every release
row requires dated environment, artifact version/commit and explicit go/no-go.
