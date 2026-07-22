# A03 Problems

### P1-A03-01: The current product is a WebApp without the legacy service layer around it

- Missing bot entrypoints, delivery, scheduler, reports and registration make several current data models non-operational outside the browser.
- **Status:** confirmed.

### P1-A03-02: Whole-state persistence limits production growth

- The app reads/writes one JSON document in `app_state`; audit saves rewrite the full state.
- This weakens queryability, concurrency, constraints and incremental migrations compared with legacy normalized SQLite/WAL/FTS.
- **Status:** confirmed.

### P1-A03-03: Current home hides operational information

- `DashboardPage` is implemented but unreachable from the main render switch.
- **Status:** confirmed.

### P1-A03-04: Swap acceptance bypasses overlap guard

- Can create double assignment for the recipient.
- **Status:** confirmed by static trace; needs test.

### P2-A03-05: Schedule time contract is misleading

- API accepts start/end but the domain overwrites them with a full-day constant.
- **Status:** confirmed.

### P2-A03-06: Reporting permission has no reporting product surface

- `reports:read` exists, but there is no report view or report API route in current navigation/routes.
- **Status:** confirmed.

