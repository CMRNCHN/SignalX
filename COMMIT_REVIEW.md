# SignalX - Recent Commits Review
**Generated: 2026-09-10**

## Most Recent Commit (Latest)

### Commit: 3ea45e6
- **Author:** Cameron Cohen
- **Date:** 2026-09-10
- **Message:** fix: operator walkthrough — scoped inbox, restock, invoiced, import lock
- **Description:** Group IDs, catalog milli stock, and sales revenue now match what the till shows; backup import reloads stores so later saves cannot overwrite it.
- **Co-authored-by:** Cursor (cursoragent@cursor.com)

**Files Changed: 16**
```
 src-tauri/src/commerce.rs              |   2 +-
 src-tauri/src/ivr.rs                   |   2 +-
 src-tauri/src/lib.rs                   | 229 ++++++++++++--
 src-tauri/src/orders.rs                | 152 ++++++++--
 src/App.tsx                            | 528 ++++++++++++++++++++++-----------
 src/IvrMenuComposer.tsx                |  35 ++-
 src/ProfileRail.tsx                    |  23 +-
 src/api.ts                             |  36 ++-
 src/components/Orders/OrdersScreen.tsx |  62 +++-
 src/components/People/PeopleScreen.tsx | 104 +++++--
 src/components/People/people.ts        |  54 +++-
 src/components/Sales/SalesScreen.tsx   |  15 +-
 src/devFixtures.ts                     |  73 ++++-
 src/format.ts                          |  91 ++++++
 src/runtime.ts                         |  25 +-
 src/styles.css                         | 188 ++++++++++--

Total: 1308 insertions(+), 311 deletions(-)
```

**Key Changes:**
- Large refactoring of App.tsx (528 lines changed)
- Updated Orders, People, and Sales screen components
- Enhanced styling (188 lines added to styles.css)
- Backend logic updates for inventory and sales tracking
- New format utilities added

---

## Recent Commits (Last 20)

| # | Hash | Author | Date | Message |
|---|------|--------|------|---------|
| 1 | 3ea45e6 | Cameron Cohen | 2026-09-10 | fix: operator walkthrough — scoped inbox, restock, invoiced, import lock |
| 2 | c72ab22 | Cameron Cohen | 2026-09-09 | fix: width budget counts every track; inner layouts respond to their pane |
| 3 | 6412976 | Cameron Cohen | 2026-09-09 | fix: settings centres in its column; fixture artwork stays out of the bundle |
| 4 | 7594158 | Cameron Cohen | 2026-09-09 | feat: Orders and Sales become screens instead of one long column |
| 5 | a4c442c | Cameron Cohen | 2026-09-09 | feat: draggable column seams, and catalog products get photos |
| 6 | 3b638a2 | Cameron Cohen | 2026-09-09 | feat: derived rows explain the rule that produced them |
| 7 | 74c7eee | Cameron Cohen | 2026-09-09 | feat: action items on a person, detail pane splits into two columns |
| 8 | 1f22b27 | Cameron Cohen | 2026-09-09 | feat: archive and delete on a profile, icon-only People toolbar |
| 9 | 763ac85 | Cameron Cohen | 2026-09-09 | feat: People becomes a directory of who someone is |
| 10 | d339c41 | Cameron Cohen | 2026-09-09 | feat: catalog product grid fills the empty pane |
| 11 | 8110094 | Cameron Cohen | 2026-09-09 | feat: elevation-based depth pass, nav consolidation, dev fixtures |
| 12 | fb21702 | Cameron Cohen | 2026-09-08 | Merge branch 'spacing-fix' into main |
| 13 | 3dc3946 | Cameron Cohen | 2026-09-08 | fix: shell grid spacing, disable Tailwind preflight, extract SalesScreen |
| 14 | e26d089 | Cameron Cohen | 2026-09-07 | docs: point CLAUDE.md at AGENTS.md |
| 15 | 46bc182 | Cameron Cohen | 2026-09-07 | feat: Tailwind v3, token refactor, nav icon |
| 16 | 0b8e73a | Cameron Cohen | 2026-09-07 | docs: IA notes and roadmap rev 2 |
| 17 | e546eae | Cameron Cohen | 2026-09-07 | docs: open questions audit |
| 18 | 2633848 | Cameron Cohen | 2026-09-07 | docs: roadmap rev 2 — port design system to live app, retire Phase 1 data layer |
| 19 | 7358e25 | Cameron Cohen | 2026-09-07 | docs: Phase 1 type delta audit vs backend api.ts |
| 20 | 4e771aa | Cameron Cohen | 2026-09-07 | Restore demo.rs from cursor/crm-four-panel-ia-ab7b (619 lines) |

---

## Commit Themes & Patterns

### Recent Focus Areas (Last 2 Days: Sept 9-10)

1. **UI/Layout Restructuring (Sept 9)**
   - Orders and Sales became dedicated screens
   - Column seams became draggable
   - People screen transformed into a directory
   - Detail pane now splits into two columns
   - Derived rows explanation improvements

2. **Bug Fixes (Sept 9-10)**
   - Width budget accounting
   - Layout responsiveness improvements
   - Settings panel centering
   - Shell grid spacing
   - Operator walkthrough logic (latest)

3. **Feature Additions**
   - Catalog product photos integration
   - Action items on person profiles
   - Archive/delete profile functionality
   - Product grid implementation
   - Elevation-based depth visual hierarchy

4. **Design System Updates (Sept 7)**
   - Tailwind v3 migration
   - Token refactor
   - Navigation icon updates

---

## Project Statistics

- **Last Commit:** 3ea45e6 (Today at 19:31)
- **Active Developer:** Cameron Cohen
- **Commit Frequency:** High activity (9+ commits on Sept 9 alone)
- **Typical Commit Type:** Mix of features (feat), fixes (fix), and documentation (docs)
- **Collaboration:** Including Cursor AI agent (co-authored commits)

---

## Project Structure

This is a **Tauri + React + TypeScript** desktop application with:
- **Frontend:** React + TypeScript + Tailwind CSS + Vite
- **Backend:** Rust + Tauri
- **Architecture:** 
  - Modular React components (App.tsx, Orders/OrdersScreen, People/PeopleScreen, Sales/SalesScreen)
  - TypeScript API layer (api.ts)
  - Rust backend for business logic (commerce, orders, IVR)
  - Development fixtures for testing

---

## Key Files Modified Recently

1. **App.tsx** (528 lines) - Main application shell and layout logic
2. **lib.rs** (229 lines) - Core Rust backend logic
3. **orders.rs** (152 lines) - Order processing and management
4. **styles.css** (188 lines) - Global styling and layout
5. **People/PeopleScreen.tsx** (104 lines) - People/contacts directory
6. **Orders/OrdersScreen.tsx** (62 lines) - Orders management screen

---

## Build Status

The application is currently building with Tauri dev server. Status:
- Vite dev server: Ready at http://localhost:5173
- Tauri build: In progress (compiling Rust dependencies)
- Expected: Desktop application window to launch when build completes
