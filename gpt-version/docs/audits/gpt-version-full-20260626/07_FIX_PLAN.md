# Fix Plan

1. Fix entity and idempotency validation.
   - Files: `src/server/domain.ts`, `src/server/store.ts`, `src/server/domain.test.ts`.
   - Covers: P1-01, P1-02, P1-03.
   - Tests: unknown product/location, missing idempotency, negative inventory actual.

2. Fix schedule swap validation and role permission refresh.
   - Files: `src/server/index.ts`, `src/server/domain.test.ts`.
   - Covers: P1-04, P1-05.
   - Tests: bad target user, role update permissions.

3. Fix dashboard date and UI truth issues.
   - Files: `src/server/index.ts`, `src/client/src/main.tsx`.
   - Covers: P2-01, P2-02, P2-03.
   - Tests: typecheck/build and browser smoke.

4. Update verification artifacts.
   - Files: `08_PROGRESS.md`, `09_VERIFICATION.md`.

5. Add production-like auth and contract discovery.
   - Files: `src/server/auth.ts`, `src/server/index.ts`, `src/server/domain.test.ts`.
   - Covers: P1-12, P2-05.
   - Tests: signed Telegram init data, tampered init data, `/api/openapi.json` smoke.

6. Extend import preview to XLSX/XLS without vulnerable parser dependencies.
   - Files: `src/server/domain.ts`, `src/server/index.ts`, `src/client/src/main.tsx`, `src/server/domain.test.ts`.
   - Covers: P1-10.
   - Tests: minimal XLSX and BIFF8 XLS parser regressions, runtime XLS/XLSX preview smoke, `npm audit --omit=dev`.

7. Add SQLite-backed persistence for default runtime.
   - Covers: P2-06.
   - Files: `src/server/store.ts`.
   - Tests: SQLite restart smoke with created product surviving process restart.

8. Add targeted import undo and atomic import commit.
   - Files: `src/server/domain.ts`, `src/server/index.ts`, `src/client/src/main.tsx`, `src/shared/types.ts`, `src/server/domain.test.ts`.
   - Covers: P1-13.
   - Tests: undo committed import, block undo after later movement, reject bad import without partial product creation.

9. Complete shift swap lifecycle in API and UI.
   - Files: `src/server/domain.ts`, `src/server/index.ts`, `src/client/src/main.tsx`, `src/client/src/styles.css`, `src/server/domain.test.ts`.
   - Covers: P1-14.
   - Tests: cancel/decline actor checks, accept flow, non-scheduled shift rejection.

10. Add shift create/update/copy with overlap checks.
   - Files: `src/server/domain.ts`, `src/server/index.ts`, `src/client/src/main.tsx`, `src/server/domain.test.ts`.
   - Covers: P1-15.
   - Tests: non-manager rejection, overlap rejection, copy/update behavior.

11. Add label print journal and reprint from snapshot.
   - Files: `src/shared/types.ts`, `src/server/store.ts`, `src/server/index.ts`, `src/client/src/main.tsx`.
   - Covers: P1-16.
   - Tests: typecheck/build plus runtime PDF/jobs/reprint smoke.

12. Add graphical Code 128/EAN-13 barcode rendering.
   - Files: `src/server/barcodes.ts`, `src/server/index.ts`, `src/shared/types.ts`, `src/client/src/main.tsx`, `src/client/src/styles.css`, `src/server/domain.test.ts`.
   - Covers: P1-17.
   - Tests: barcode unit assertions plus runtime preview/PDF smoke.

13. Add automatic schedule and swap status refresh.
   - Files: `src/server/domain.ts`, `src/server/index.ts`, `src/server/domain.test.ts`.
   - Covers: P1-18.
   - Tests: scheduled -> in_progress -> completed, pending swap -> expired, runtime schedule smoke.

14. Extend merge snapshot/undo to stock operation links.
   - Files: `src/shared/types.ts`, `src/server/domain.ts`, `src/server/domain.test.ts`.
   - Covers: P1-19.
   - Tests: source operation moves to target on commit, restores on undo, undo blocks later linked movement.
