# A02 Problems

### P1-A02-01: Current operational dashboard is orphaned

- **Reality:** `DashboardPage` contains metrics, low stock, notifications and recent movements, but `renderPage("dashboard")` renders `MainMenuPage` instead (`gpt-version/src/client/src/main.tsx:313-318`).
- **Effect:** the first screen duplicates sidebar navigation and hides operational status.
- **Status:** confirmed and live-captured.

### P1-A02-02: Current lost supplier-specific import intelligence

- **Reality:** current parses standard header rows and supports XLS/XLSX, but always turns normalized rows into new products and has no manual mapping/supplier identity step (`gpt-version/src/server/domain.ts:438-503`).
- **Effect:** irregular invoices and identical articles from different suppliers are more error-prone.
- **Status:** confirmed.

### P2-A02-03: Current duplicate merge starts from a manually selected pair

- **Reality:** current filter/select UI has no automatic candidate groups (`gpt-version/src/client/src/pages/MergePage.tsx:41-52`, `113-131`).
- **Effect:** admins must already know which duplicates exist.
- **Status:** confirmed.

### P2-A02-04: Current lacks touch work buffers

- **Reality:** current has responsive seller actions but no multi-item working buffer equivalent to `/ipad`.
- **Effect:** repeated stock tasks require reopening products one at a time.
- **Status:** confirmed by current page inventory.

### P2-A02-05: Legacy visual has accessibility/polish debt

- **Reality:** small muted text, low contrast in dark tables and dense technical navigation are visible in current live capture.
- **Effect:** the theme should be adapted, not copied wholesale.
- **Status:** screenshot-supported; keyboard/AT testing not performed.

