# Master Report

## Verdict

Legacy is better in the parts closest to daily store work: Telegram calendar, schedule automation, real notifications, registration, reports, irregular supplier imports, duplicate discovery, local photos and an operational admin dashboard.

Current is the better foundation: permissions, authenticated sessions, safer stock operations, audit, idempotency, undo, backups, labels and responsive navigation.

The right approach is to **keep current as the canonical product and port legacy behavior into current contracts**.

## Feature Matrix

| Feature | Better version | What to carry forward | Priority |
|---|---|---|---|
| Telegram calendar | Legacy | Chat calendar, marks, day detail, swap approval, delivery | P1 |
| Web calendar/domain | Current | 42-cell grid, locations, statuses, permissions, audit | Keep |
| Rotation/closed days/export | Legacy | Templates, preview, closed days, reports | P1 |
| Admin home | Legacy | Operational status and density | P1 |
| Shell/navigation/mobile | Current | Grouped IA, components, role-aware visibility | Keep |
| Notifications | Legacy | Instant/daily preferences and real Telegram delivery | P1 |
| Registration | Legacy | Request/approve/reject conversation | P1 |
| Reports/archive | Legacy | Low/zero/mid/all/archive plus automation | P1 |
| Supplier import | Legacy parsing + current safety | Mapping/supplier identity + idempotent preview/undo | P1 |
| Product search/media | Legacy | Server FTS, Telegram inline search, managed photos | P2 |
| Duplicate merge | Mixed | Legacy candidates/field choices + current snapshot/undo | P2 |
| Touch work buffer | Legacy | Multi-item worklist for transfer/write-off/inventory | P2 |
| Stock/inventory safety | Current | Idempotency, negative-stock guard, reversal, audit | Keep |
| Labels | Current | Barcode PDFs, jobs and reprint | Keep |
| Persistence | Legacy shape, current contracts | Normalized DB/repositories; keep current APIs | P1 |

## Areas

| Area | Status | Analysis | Problems | Solution plan |
|---|---|---|---|---|
| A01 Bot/calendar | complete | `agents/A01-legacy-bot-calendar/01_ANALYSIS.md` | `agents/A01-legacy-bot-calendar/02_PROBLEMS.md` | `agents/A01-legacy-bot-calendar/04_SOLUTION_PLAN.md` |
| A02 Legacy admin | complete | `agents/A02-legacy-admin/01_ANALYSIS.md` | `agents/A02-legacy-admin/02_PROBLEMS.md` | `agents/A02-legacy-admin/04_SOLUTION_PLAN.md` |
| A03 Current | complete | `agents/A03-current-product/01_ANALYSIS.md` | `agents/A03-current-product/02_PROBLEMS.md` | `agents/A03-current-product/04_SOLUTION_PLAN.md` |
| A04 Visual/merge | complete | `agents/A04-visual-merge/01_ANALYSIS.md` | `agents/A04-visual-merge/02_PROBLEMS.md` | `agents/A04-visual-merge/04_SOLUTION_PLAN.md` |

## Recommended sequence

1. Fix current foundations: normalized persistence, swap conflict validation, explicit shift-time decision, route real dashboard.
2. Add schedule day/closed-day/rotation/export services.
3. Add Telegram bot adapter, registration, notifications and outbox worker.
4. Merge supplier import intelligence and reports/archive automation.
5. Add duplicate discovery, media upload and optional touch work buffer.

Detailed implementation roadmap: `93_IMPLEMENTATION_PLAN.md`.

## Verification

- Current typecheck and domain tests passed.
- Legacy tests: 18 passed, 2 skipped.
- Both web UIs were started and captured with temporary data.

## Implementation Gate

No product code changes were made. Implementation requires explicit approval.
