# A04 Analysis — Visual Comparison And Merge

## Captured steps

1. **Current main menu — healthy, visually clean, operationally thin.** `01-current-dashboard.png`.
   - Strengths: clear grouping, large touch targets, consistent icons, role-aware navigation.
   - Weakness: the center repeats the sidebar; no schedule/low-stock/location/recent-action status is visible.
2. **Current month calendar — healthy base.** `02-current-calendar.png`.
   - Strengths: familiar 7-column month grid, today/selection, location filter, create/swap actions.
   - Weakness: day click exposes no immediate working/free detail; no closed-day mark, report/export or rotation controls.
3. **Legacy dashboard — strong operational cockpit.** `03-legacy-dashboard.png`.
   - Strengths: calendar, low-stock alert and location stock coexist in one viewport; dark theme fits a low-light store.
   - Weakness: small muted text, high density and technical navigation increase accessibility risk.
4. **Legacy schedule — structurally useful, visually dated.** `04-legacy-schedule.png`.
   - Strengths: compact roster table and adjacent reports.
   - Weakness: report controls are mixed into schedule; the empty-state screen gives little guidance.

## Design merge conclusion

Use current shell, components, permissions, responsive behavior and accessibility semantics. Replace the current menu-only admin home with an operational dashboard inspired by legacy. Offer dark and dense presentation modes, but keep current typography, spacing and component contracts.

## Evidence limits

- Both apps were run with temporary local data. Layout and available controls are verified; realistic row density was not.
- Screenshot evidence does not establish full WCAG compliance.
- Legacy bot UI was not captured live.

