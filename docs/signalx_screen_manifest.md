# SignalX Screen Manifest

Per-screen breakdown: layout, panels, components, data sources, filters, and states.  
**Code entry:** `src/App.tsx` unless noted.

---

## Screen index

| # | Screen ID | Nav | Layout | Screenshot asset |
|---|-----------|-----|--------|------------------|
| 1 | `inbox` | Inbox | 4-panel | `01-inbox.webp` |
| 2 | `people` | People | 4-panel | `02-people.webp` |
| 3 | `catalog` | Catalog | 4-panel | `03-catalog.webp` |
| 4 | `orders` | Orders | 4-panel | `04-orders.webp` |
| 5 | `settings.account` | Settings | 3-panel | `05-settings-account.webp` |
| 6 | `settings.delivery` | Settings | 3-panel | `06-settings-delivery.webp` |
| 7 | `catalog.menu_builder` | Catalog → Open builder | Full-width composer | `07-menu-builder.webp` |

---

## 1 · Inbox (`panel === "inbox"`)

| Attribute | Detail |
|-----------|--------|
| **Layout** | `.shell.shell-with-profile` — rail · thread-col · convo · profile-rail |
| **List column** | Search, inbox filter chips, new-chat strip, thread list |
| **Workspace** | Convo head, message scroll, composer, outbox bubbles |
| **Profile** | `<ProfileRail />` for `selectedId` |
| **Primary data** | `threads`, `messages`, `contacts`, `groups`, `outbox` |
| **Filters** | `InboxChip`: all, unread, needs_send, dms, groups |
| **Key components** | `EmptyState`, `thread-row`, `status-pill` (reply), `bubble`, `composer` |
| **States** | Empty inbox · no filter matches · thread selected · pending outbox · not configured banner |

**Data flow:** `api.getThreads()` → filter → `setSelectedId` → `api.getThreadMessages()` + ProfileRail props.

**Thread meta badges:** `threadReplyLabel()` — Awaiting reply / Replied / Needs send.

---

## 2 · People (`panel === "people"`)

| Attribute | Detail |
|-----------|--------|
| **Layout** | 4-panel |
| **List column** | Search, people chips, directory rows |
| **Workspace** | New contact/group forms OR selected person detail |
| **Profile** | Actions, threads shortcut, related orders |
| **Primary data** | `contacts`, `groups`, `customers`, `orders` |
| **Filters** | `PeopleChip`: all, people, groups, customers |
| **Key components** | `thread-row`, `form-card`, `toggle`, order `status-pill` |
| **States** | Empty directory · person selected · group selected · customer linked |

**Selection model:** `PeopleSel` — `{ kind: "person" \| "group" \| "customer", id }`.

---

## 3 · Catalog (`panel === "catalog"`)

| Attribute | Detail |
|-----------|--------|
| **Layout** | 4-panel |
| **List column** | Filter, product rows, new product |
| **Workspace** | Product hero OR inline `product-form` (basic, units/pricing, packs, logistics) |
| **Profile** | Buyer menu bindings, stock +/- , delete, hide-zero-stock |
| **Primary data** | `products`, `ivrMenusDraft`, `ivrSettings` |
| **Filters** | Catalog text filter |
| **Key components** | `product-row`, `form-card`, `form-grid-2`, `dropzone`, `pack-row` |
| **States** | No selection (new product) · product selected · editing · menu builder open |

**Menu builder entry:** `setMenuBuilderOpen(true)` → replaces workspace with `IvrMenuComposer`.

---

## 4 · Orders (`panel === "orders"`)

| Attribute | Detail |
|-----------|--------|
| **Layout** | 4-panel |
| **List column** | Search, status chips, date range chips, order rows |
| **Workspace** | Create quote OR order detail + line actions |
| **Profile** | Customer summary, sibling orders |
| **Primary data** | `orders`, `products`, `contacts`, `customers` |
| **Filters** | Status (all, draft, confirmed, …), sales range (7d, 30d, all) |
| **Key components** | `orderStatusLabel`, `action-btn.primary`, `hero-block` |
| **States** | No order selected (quote composer) · order selected · empty filtered list |

**Status display:** `orderStatusTone` + `orderStatusLabel` on every row and detail header.

---

## 5 · Settings — Account (`settingsTab === "account"`)

| Attribute | Detail |
|-----------|--------|
| **Layout** | `.shell.shell-three` |
| **Nav column** | Settings tab list (account, device, delivery, auto, activity, backup) |
| **Workspace** | Status card, roster, PIN/session controls |
| **Primary data** | `diagnostics`, `health`, `session`, `ai` |
| **Key components** | `settings-card`, `diag-grid`, `status-pill`, `setup-banner` |
| **States** | Needs link · linked · multi-account roster · locked session |

---

## 6 · Settings — Delivery (`settingsTab === "delivery"`)

| Attribute | Detail |
|-----------|--------|
| **Layout** | 3-panel |
| **Workspace** | Global outbox list, queue summary, retry/discard |
| **Primary data** | `globalOutbox`, `outboxSummary` |
| **Key components** | `status-pill` (failed/muted), `audit-row` |
| **States** | Outbox clear · queued · failed items |

---

## 7 · Catalog — Menu builder (`menuBuilderOpen`)

| Attribute | Detail |
|-----------|--------|
| **Layout** | `.ivr-composer-page` (grid-column 2 / -1) |
| **Regions** | Toolbar · screen list · visual canvas · phone preview · inspector |
| **Primary data** | `ivrMenusDraft`, `products`, `ivrPreviewSteps` |
| **Key components** | `IvrMenuComposer`, `ivr-screen-card`, `ivr-dialpad` |
| **States** | Visual vs text mode · screen selected · unsaved edits · demo template |

**Persistence:** Save via `api` IVR menu commands; product binding uses `product_id` on choices.

---

## Component registry (40+)

Grouped by domain. **Implemented** = file exists today.

### Shell & navigation

| ID | Component | File | Status |
|----|-----------|------|--------|
| `shell.grid` | Four/three panel grid | `styles.css` | ✓ |
| `shell.rail` | Sidebar brand, account, nav | `App.tsx` | ✓ |
| `nav.item` | Nav button + icon + count | `App.tsx`, `navIcons.tsx` | ✓ |
| `nav.chip` | AUTO ON / MENU ON | `App.tsx` | ✓ |
| `status.bar` | Toast status strip | `App.tsx` | ✓ |

### Inbox & messaging

| ID | Component | File | Status |
|----|-----------|------|--------|
| `inbox.search` | Thread search | `App.tsx` | ✓ |
| `inbox.filters` | Filter chips | `App.tsx` | ✓ |
| `inbox.thread_list` | Thread rows | `App.tsx` | ✓ |
| `inbox.thread_badge` | Reply / unread pills | `App.tsx`, `status.ts` | ✓ |
| `convo.header` | Title + toggles | `App.tsx` | ✓ |
| `convo.messages` | Bubble list | `App.tsx` | ✓ |
| `convo.composer` | Message input + send | `App.tsx` | ✓ |
| `convo.outbox` | Pending/failed bubbles | `App.tsx` | ✓ |
| `empty.inbox` | EmptyState | `EmptyState.tsx` | ✓ |

### Profile rail

| ID | Component | File | Status |
|----|-----------|------|--------|
| `profile.header` | Avatar + title | `ProfileRail.tsx` | ✓ |
| `profile.segments` | Segment chips | `ProfileRail.tsx`, `segments.ts` | ✓ |
| `profile.standing` | Lifetime / open / orders | `ProfileRail.tsx` | ✓ |
| `profile.customer` | Notes, favorite, mute | `ProfileRail.tsx` | ✓ |
| `profile.actions` | Suggested CTAs | `ProfileRail.tsx` | ✓ |
| `profile.orders` | Order ledger | `ProfileRail.tsx` | ✓ |
| `profile.media` | Attachments grid | `ProfileRail.tsx` | ✓ |

### People

| ID | Component | File | Status |
|----|-----------|------|--------|
| `people.filters` | People chips | `App.tsx` | ✓ |
| `people.list` | Directory rows | `App.tsx` | ✓ |
| `people.form.contact` | Create contact | `App.tsx` | ✓ |
| `people.form.group` | Create group | `App.tsx` | ✓ |
| `people.detail` | Selected record | `App.tsx` | ✓ |
| `empty.people` | EmptyState | `EmptyState.tsx` | ✓ |

### Catalog

| ID | Component | File | Status |
|----|-----------|------|--------|
| `catalog.list` | Product rows | `App.tsx` | ✓ |
| `catalog.form.basic` | Name, desc, image | `App.tsx` | ✓ |
| `catalog.form.pricing` | Units & pricing grid | `App.tsx` | ✓ |
| `catalog.form.packs` | Sell pack rows | `App.tsx` | ✓ |
| `catalog.form.logistics` | SKU, weight | `App.tsx` | ✓ |
| `catalog.buyer_menu` | Bind product panel | `App.tsx` | ✓ |
| `catalog.dropzone` | Image upload | `App.tsx` | ✓ |

### Orders

| ID | Component | File | Status |
|----|-----------|------|--------|
| `orders.filters` | Status + range chips | `App.tsx` | ✓ |
| `orders.list` | Order rows | `App.tsx` | ✓ |
| `orders.detail` | Line items + actions | `App.tsx` | ✓ |
| `orders.quote` | New quote composer | `App.tsx` | ✓ |
| `orders.status` | Status pill | `status.ts` | ✓ |
| `empty.orders` | EmptyState | `EmptyState.tsx` | ✓ |

### Settings

| ID | Component | File | Status |
|----|-----------|------|--------|
| `settings.nav` | Tab list | `App.tsx` | ✓ |
| `settings.account` | Status + roster | `App.tsx` | ✓ |
| `settings.device` | Device link QR | `DeviceLinkQr.tsx` | ✓ |
| `settings.delivery` | Global outbox | `App.tsx` | ✓ |
| `settings.auto` | Auto-reply allowlist | `App.tsx` | ✓ |
| `settings.activity` | Audit logs | `App.tsx` | ✓ |
| `settings.backup` | Export/import | `App.tsx` | ✓ |

### IVR / menu builder

| ID | Component | File | Status |
|----|-----------|------|--------|
| `ivr.toolbar` | Visual/text toggle | `IvrMenuComposer.tsx` | ✓ |
| `ivr.canvas` | Screen cards | `IvrMenuComposer.tsx` | ✓ |
| `ivr.phone` | Buyer preview | `IvrMenuComposer.tsx` | ✓ |
| `ivr.inspector` | Choice editor | `IvrMenuComposer.tsx` | ✓ |
| `ivr.text_mode` | Script blocks | `IvrMenuComposer.tsx` | ✓ |

---

## Empty & edge states (catalog)

| Screen | State | UI |
|--------|-------|-----|
| Inbox | No threads | `EmptyState` — "Inbox is empty" |
| Inbox | Filters exclude all | `EmptyState` — "No matches" |
| Inbox | No selection | `EmptyState` — "Select a conversation" |
| People | No rows | `EmptyState` — "No people yet" |
| Orders | No matches | `EmptyState` — "No orders match" |
| Profile | No thread | "Select a thread to see their profile" |
| Catalog | No product | New product form default |
| Settings | Not linked | `NEEDS LINK` pill + setup copy |

---

## Responsive behavior

| Breakpoint | Behavior |
|------------|----------|
| >768px | Full 4-panel desktop |
| ≤768px | Icon nav, hide profile rail |
| ≤480px | Bottom nav, list OR detail (not both) |

See `src/styles.css` `@media (max-width: 768px)` and `480px`.
