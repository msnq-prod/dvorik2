# Design Guidelines: Мармеладный дворик Admin Panel

## Design Approach
**Selected Approach:** Design System - Material Design adapted for admin dashboards

**Justification:** This is a data-intensive admin application with multiple user roles (admin, marketing, cashier, readonly), requiring clear information hierarchy, extensive forms, tables, and real-time data visualization. Material Design provides robust patterns for complex data interfaces while maintaining visual clarity.

## Core Design Elements

### A. Typography
**Primary Font:** Inter (via Google Fonts CDN)
- **Headings (H1):** 32px, font-weight 700, for page titles
- **Headings (H2):** 24px, font-weight 600, for section headers
- **Headings (H3):** 18px, font-weight 600, for card/panel titles
- **Body Text:** 14px, font-weight 400, line-height 1.5
- **Small Text:** 12px, font-weight 400, for metadata, timestamps, helper text
- **Labels:** 14px, font-weight 500, for form labels
- **Button Text:** 14px, font-weight 500, uppercase letter-spacing for primary actions

### B. Layout System
**Spacing Units:** Tailwind units of 2, 4, 6, 8, 12, 16
- Component padding: p-4, p-6
- Section spacing: space-y-6, space-y-8
- Card gaps: gap-4
- Form field spacing: space-y-4
- Table cell padding: px-4 py-3

**Grid Structure:**
- Sidebar navigation: fixed w-64 on desktop, collapsible on mobile
- Main content area: max-w-7xl with px-6 py-8
- Dashboard cards: grid-cols-1 md:grid-cols-2 lg:grid-cols-3
- Tables: full-width with horizontal scroll on mobile

### C. Component Library

**Navigation:**
- Persistent left sidebar with logo at top
- Role-based menu items with icons (Heroicons)
- Active state indicator (border accent on left)
- User profile dropdown in top-right header
- Breadcrumbs below header for deep navigation

**Dashboard Cards:**
- Elevated cards with subtle shadow
- Icon + metric + label layout
- Trend indicators (arrows, percentages)
- Click-through to detailed views
- Grid layout: 3 columns on desktop, stack on mobile

**Tables:**
- Sticky header row
- Alternating row backgrounds for readability
- Action buttons/icons in rightmost column
- Sortable column headers with arrow indicators
- Pagination controls at bottom
- Search/filter bar above table
- Empty states with helpful messaging
- Row selection with checkboxes for bulk actions

**Forms:**
- Single-column layout for clarity (max-w-2xl)
- Clear field labels above inputs
- Helper text below inputs for guidance
- Required field indicators (asterisk)
- Validation messages inline
- Action buttons right-aligned at bottom
- Cancel (secondary) + Submit (primary) pattern
- Multi-step forms use stepper component at top

**Data Displays:**
- Status badges (active/inactive, used/unused, pending/approved)
- Date/time stamps with relative formatting ("2 часа назад")
- User avatars with fallback initials
- Discount codes in monospace font, copyable with click
- Statistics with visual charts (simple bar/line using chart library)

**Modals/Overlays:**
- Confirmation dialogs for destructive actions
- Form modals for quick edits
- Detail views in slide-over panels
- Toast notifications for success/error feedback (top-right)

**Broadcast/Campaign Builder:**
- Live preview panel on right
- WYSIWYG text editor on left
- Audience selector with checkbox filters
- Segment statistics display
- Schedule picker with calendar
- Confirmation summary before send

**Logs & Reports:**
- Filterable timeline view
- Expandable rows for details
- Export button (CSV/Excel)
- Date range picker
- Real-time updates indicator

**Role-Specific Views:**
- Marketing: Focus on campaigns, broadcasts, analytics
- Cashier: Minimal interface - code input prominent, validation result large
- Readonly: All data visible, all actions disabled/hidden
- Admin: Full access with danger zone sections clearly marked

### D. Animations
**Minimal & Purposeful:**
- Page transitions: none (instant)
- Modal/drawer entry: 200ms slide-in
- Toast notifications: 300ms fade-in from top
- Table row updates: 150ms highlight flash
- Loading states: simple spinner, no skeleton screens
- No hover animations on cards/tables

## Layout Specifications

**Admin Dashboard Home:**
- Stats cards grid at top (4 metrics: total users, active discounts, redemptions today, pending cashiers)
- Recent activity feed (middle column)
- Quick actions panel (right sidebar on desktop)

**User Management:**
- Search bar + filter chips + export button in toolbar
- Table with columns: Name, Username, Subscription Status, Active Discounts, Registration Date, Source, Actions
- Click row to open detail slide-over

**Discount Templates:**
- Card grid showing each template
- Template card shows: name, discount amount, validity period, usage stats
- Create/Edit in full-page form

**Broadcast Manager:**
- List view of past broadcasts with status indicators
- Create button prominent (top-right)
- Builder: 2-column split (editor left, preview right on desktop, stacked mobile)

**Cashier Code Validation:**
- Large centered code input field
- Submit button prominent below
- Result display: full-width card with user info, discount details, redeem action

**Logs View:**
- Advanced filters collapsible panel
- Timeline with grouped entries by date
- Export all/filtered options

## Responsive Behavior
- **Desktop (lg+):** Sidebar persistent, multi-column layouts
- **Tablet (md):** Sidebar collapsible via hamburger, 2-column layouts become 1-column
- **Mobile (base):** Full-screen views, bottom navigation for primary actions, tables scroll horizontally

## Accessibility
- All interactive elements keyboard accessible
- Clear focus indicators (2px outline)
- ARIA labels for icon-only buttons
- Form error announcements
- High contrast for status indicators