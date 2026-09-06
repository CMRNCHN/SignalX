# SignalX Phase 1 Build Specification

**Status:** Authoritative spec for frontend refactor  
**Branch:** `cursor/crm-four-panel-ia-ab7b` (commit `07d971d`)  
**Target:** Modular, responsive, properly-spaced Phase 1 (Inbox, People, Menu Builder skeleton)

---

## Problem Statement

**Current state:** Monolithic `App.tsx` (3,903 lines), ad-hoc spacing (1–24px), fixed grid columns, no light mode, tightly coupled data.

**Issues:**
- Spacing chaos causes cramped panels, wasted empty space, poor content distribution
- Grid columns fixed at 212px|300px|1fr|300px → doesn't adapt to content
- All state inline; refactoring blocks parallelization
- Dark mode only; no light mode support
- No clean data abstraction (fixtures hardcoded in component tree)

**Solution:** Refactor into modular, responsive, properly-spaced architecture with unified spacing scale, Tailwind utilities, Context-based data layer, and dark + light theme support.

---

## Scope: Phase 1

### Build These

**Inbox (4-panel, fully interactive)**
- Nav | ThreadList (with filters) | ThreadDetail (with reply box) | ContextRail
- Click thread → updates detail + context live
- Filter buttons work (All/Unread/Needs send/DMs)
- Segments sidebar acts as additional filters (Favorite, VIP, Become cores buyer)
- All interactivity wired to fixtures

**People (2-panel, read-only)**
- Nav | ContactList (with search) + ContactDetail (stacked vertically or side-by-side)
- Display contacts from fixtures
- No edit flows yet (Phase 2)

**Menu Builder (skeleton, ready for Phase 2)**
- Nav | Canvas (placeholder: "Canvas area — visual IVR design goes here") | ChoiceEditor (inspector panel)
- Choice editor: text input, action dropdown, save/delete buttons
- Canvas is a faux implementation; real Konva/visual designer is Phase 2

**Settings (stubs)**
- Account tab (stub)
- Delivery tab (stub)
- Theme toggle (Light / Dark / System) — fully functional, saves to localStorage

### NOT in Phase 1

- Catalog, Orders, Sales, Outbox, Audit screens (leave as nav items, render empty stubs)
- Canvas visual implementation (placeholder only)
- Real Rust API integration (fixtures only)
- Tablet/mobile responsive (Phase 2; desktop-first scaffolding only)

---

## Architectural Decisions

### 1. Spacing System (Tailwind Unified Scale)

**Problem:** Current CSS scatters 1px, 4px, 6px, 8px, 10px, 12px, 14px, 16px, 24px with no system. Result: cramped sections, wasted space.

**Solution:** Tailwind default spacing scale (4px, 8px, 12px, 16px, 24px, 32px, 48px, ...) as the single source of truth.

**Rule:** All spacing **via Tailwind utilities only**. No hardcoded `padding`, `margin`, or `gap` in component `style` attributes.

```tsx
// ✅ GOOD
<div className="p-4 gap-3">
<button className="px-4 py-2 mt-6">

// ❌ BAD
<div style={{ padding: '16px', gap: '12px' }}>
<button style={{ padding: '8px 16px', marginTop: '24px' }}>
```

**Key spacing values:**
- `gap-1` / `gap-2` / `gap-3` / `gap-4` = 4px / 8px / 12px / 16px
- `p-3` / `p-4` / `p-6` = 12px / 16px / 24px
- `mt-6` / `mb-8` = 24px / 32px
- Standard padding for panels: `p-4` (16px)
- Standard gap between list items: `gap-3` (12px)
- Standard gap between sections: `gap-4` (16px)

---

### 2. Responsive Grid Layout

**Desktop-first (Phase 1 target: `lg` breakpoint and up)**

| Screen | Layout | Grid Columns |
|--------|--------|--------------|
| **Inbox** | 4-panel | `minmax(180px, 200px) minmax(280px, 320px) 1fr minmax(280px, 320px)` |
| **People** | 2-panel (vertical stack) | `minmax(180px, 200px) 1fr` |
| **MenuBuilder** | 3-panel | `minmax(180px, 200px) 1fr minmax(280px, 320px)` |

**Grid container:**
```css
.shell {
  display: grid;
  grid-template-columns: /* per-screen above */;
  gap: 8px; /* small gap, panels handle internal padding */
  height: 100vh;
  overflow: hidden;
  padding: 8px;
}
```

**Why `minmax()` not fixed widths:**
- `minmax(180px, 200px)` nav: min 180px (mobile fallback), max 200px (desktop breathing room)
- `minmax(280px, 320px)` lists: adapts to content, doesn't waste space
- `1fr` detail: takes remaining space, no cramping
- Responsive scaffolding for tablet (Phase 2): just add media query, no component changes

---

### 3. Data Layer: Context + Hooks

**Problem:** Current code passes data inline, couples components to fixtures, makes API swap impossible.

**Solution:** React Context + custom hooks (fixtures in, API later).

**Architecture:**
```
App.tsx (wraps providers)
  ├─ SignalXProvider (data layer)
  │   └─ fixture data → context
  ├─ ThemeProvider (theme toggle)
  │   └─ dark/light state
  └─ Components use hooks
      ├─ useThreads() → Thread[]
      ├─ useContacts() → Contact[]
      ├─ useProducts() → Product[]
      ├─ useOrders() → Order[]
      ├─ useMenus() → Menu[]
      └─ useTheme() → { theme, effectiveTheme, setTheme }
```

**Fixture wiring (one place to change):**
```typescript
// In SignalXProvider
useEffect(() => {
  // Load from /fixtures/signalx_fixtures.json or /frontend/src/api.mock.ts
  fetch('/fixtures/signalx_fixtures.json')
    .then(r => r.json())
    .then(data => {
      setThreads(data.threads);
      setContacts(data.contacts);
      // ...
    });
}, []);
```

**API swap (Phase 2, zero refactoring):**
```typescript
// Just change the fetch URL
fetch('/api/threads')
  .then(r => r.json())
  .then(data => setThreads(data));
// Components don't change
```

---

### 4. Theme: Dark + Light Mode

**Setup:**
- Tailwind `darkMode: 'class'` (manually toggle `dark` class on `<html>`)
- CSS variables for token colors (existing dark tokens + new light overrides)
- System preference detection on mount (`window.matchMedia('(prefers-color-scheme: dark)')`)
- Manual toggle in Settings, saved to `localStorage` as `signalx-theme` (light | dark | system)

**Token structure:**
```css
:root {
  /* Dark mode (default) */
  --bg: #222326;
  --panel: #2c2e33;
  --text: #f0f2f5;
  --text-dim: #9aa0a8;
  --border: rgba(255, 255, 255, 0.1);
  --accent-cta: #3d8bfd;
}

.light {
  --bg: #f9fafb;
  --panel: #ffffff;
  --text: #111827;
  --text-dim: #6b7280;
  --border: rgba(0, 0, 0, 0.1);
  --accent-cta: #3b82f6;
}
```

**Component usage:**
```tsx
<div className="bg-[var(--panel)] text-[var(--text)] border border-[var(--border)]">
  {/* automatically switches with dark class */}
</div>
```

---

### 5. Component Architecture

**Flat, composable structure:**

```
frontend/src/
├── context/
│   ├── SignalXContext.tsx       (data hooks: useThreads, useContacts, etc.)
│   ├── ThemeContext.tsx         (useTheme: dark/light toggle + system preference)
│   └── types.ts                 (Thread, Contact, Product, Order, Menu)
│
├── components/
│   ├── shared/
│   │   ├── Nav.tsx              (left sidebar: nav tabs + health indicator)
│   │   ├── Badge.tsx            (segment, status badges)
│   │   ├── Button.tsx           (primary, ghost, danger variants)
│   │   ├── SearchBar.tsx        (input + filter icon)
│   │   └── Avatar.tsx           (initials circle)
│   │
│   ├── Inbox/
│   │   ├── InboxScreen.tsx      (4-panel container: grid layout + nav)
│   │   ├── ThreadList.tsx       (thread list + filters + search)
│   │   ├── ThreadDetail.tsx     (message history + reply box)
│   │   ├── SegmentsSidebar.tsx  (Favorite, VIP, Become cores buyer — click to filter)
│   │   ├── ContextRail.tsx      (buyer info, segments, orders, standing, actions)
│   │   └── ThreadItem.tsx       (single thread row in list)
│   │
│   ├── People/
│   │   ├── PeopleScreen.tsx     (2-panel container)
│   │   ├── ContactList.tsx      (contact search + list)
│   │   ├── ContactDetail.tsx    (contact info + metadata)
│   │   └── ContactItem.tsx      (single contact row in list)
│   │
│   ├── MenuBuilder/
│   │   ├── MenuBuilderScreen.tsx (3-panel container)
│   │   ├── Canvas.tsx           (placeholder)
│   │   └── ChoiceEditor.tsx     (inspector: choice text + action editor)
│   │
│   ├── Settings/
│   │   ├── SettingsScreen.tsx   (tab container)
│   │   ├── AccountTab.tsx       (stub)
│   │   ├── DeliveryTab.tsx      (stub)
│   │   └── ThemeToggle.tsx      (Light / Dark / System selector)
│   │
│   └── App.tsx                  (root shell + nav + screen router)
│
├── fixtures/
│   └── signalx_fixtures.json    (copy from /docs/fixtures/ or use api.mock.ts)
│
├── styles/
│   ├── index.css                (Tailwind imports + theme token CSS)
│   └── (component styles via @apply or inline Tailwind)
│
└── main.tsx                     (entry: wrap providers)
```

**Design principle: no styling files per component.** Use Tailwind `className` + token CSS variables in `index.css`. Keep components lean.

---

## Build Order

### Phase 1a: Setup (dependencies + theme)

1. **Install Tailwind:**
   ```bash
   npm install -D tailwindcss postcss autoprefixer
   npx tailwindcss init -p
   ```

2. **Configure Tailwind** (`frontend/tailwind.config.ts`):
   ```typescript
   export default {
     content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
     darkMode: 'class',
     theme: { extend: {} },
     plugins: [],
   } satisfies Config;
   ```

3. **Create theme tokens** (`frontend/src/index.css`):
   ```css
   @tailwind base;
   @tailwind components;
   @tailwind utilities;

   :root {
     --bg: #222326;
     --panel: #2c2e33;
     /* ... all dark tokens ... */
   }

   .light {
     --bg: #f9fafb;
     /* ... all light tokens ... */
   }
   ```

4. **Create Context files** (`SignalXContext.tsx`, `ThemeContext.tsx`, `types.ts`)
   - Load fixtures into SignalXContext
   - Theme context with system preference detection + localStorage

5. **Update `App.tsx`** to wrap providers (don't build UI yet, just structure)

### Phase 1b: Shared Components

6. **Build `/components/shared/`:**
   - `Nav.tsx` (sidebar nav)
   - `Button.tsx` (with Tailwind variants)
   - `Badge.tsx` (segment/status badges)
   - `SearchBar.tsx` (input + icon)
   - `Avatar.tsx` (initials circle)

### Phase 1c: Inbox (most complex, establishes pattern)

7. **Build Inbox** (`/components/Inbox/`):
   - `ThreadItem.tsx` (single thread row)
   - `ThreadList.tsx` (list + filters, wired to useThreads)
   - `ThreadDetail.tsx` (message history + reply box, responds to selected thread)
   - `SegmentsSidebar.tsx` (Favorite, VIP, Become cores buyer buttons)
   - `ContextRail.tsx` (buyer info, orders, actions, wired to selected thread)
   - `InboxScreen.tsx` (orchestrator: 4-panel grid, state management, connect all subcomponents)
   - **Interaction:** Click thread list → ThreadDetail + ContextRail update live, filters re-sort list

### Phase 1d: People

8. **Build People** (`/components/People/`):
   - `ContactItem.tsx` (single contact row)
   - `ContactList.tsx` (search + list, wired to useContacts)
   - `ContactDetail.tsx` (contact info, responds to selected contact)
   - `PeopleScreen.tsx` (orchestrator: 2-panel, connect list + detail)

### Phase 1e: Menu Builder Skeleton

9. **Build MenuBuilder** (`/components/MenuBuilder/`):
   - `Canvas.tsx` (placeholder div with grey background + text)
   - `ChoiceEditor.tsx` (inspector: textarea for choice text, dropdown for action, save/delete buttons)
   - `MenuBuilderScreen.tsx` (orchestrator: 3-panel grid)

### Phase 1f: Settings Stubs

10. **Build Settings** (`/components/Settings/`):
    - `AccountTab.tsx` (empty div, "Account settings coming soon")
    - `DeliveryTab.tsx` (empty div, "Delivery settings coming soon")
    - `ThemeToggle.tsx` (Light / Dark / System buttons, wired to useTheme)
    - `SettingsScreen.tsx` (tabs container, route tabs)

### Phase 1g: Root Integration

11. **Wire App.tsx:**
    - Grid shell (routes to InboxScreen, PeopleScreen, MenuBuilderScreen, SettingsScreen based on nav click)
    - Nav component (screen tabs, wired to router)
    - All components rendered

12. **Test:**
    - `npm run dev` → no errors
    - Click nav items → screens switch
    - Click threads → detail updates
    - Filter buttons work
    - Dark/Light toggle works
    - Reply box ready (functional, not wired to API yet)

---

## Data Models

### Thread
```typescript
type Thread = {
  id: string;
  buyerId: string;
  messages: Array<{
    id: string;
    role: 'buyer' | 'seller';
    text: string;
    timestamp: number;
    read: boolean;
  }>;
  status: 'open' | 'resolved';
  lastMessage: string;
  unread: number;
};
```

### Contact
```typescript
type Contact = {
  id: string;
  name: string;
  phone: string;
  alias?: string;
  email?: string;
  meta?: Record<string, any>;
};
```

### Product
```typescript
type Product = {
  id: string;
  name: string;
  priceCents: number;
  unit: string;
  quantity: number;
};
```

### Order
```typescript
type Order = {
  id: string;
  buyerId: string;
  total: number;
  status: 'pending' | 'confirmed' | 'delivered';
  items: Array<{ productId: string; qty: number }>;
};
```

### Menu
```typescript
type Menu = {
  id: string;
  name: string;
  choices: Array<{
    id: string;
    text: string;
    action: string;
  }>;
};
```

---

## Key Rules

✅ **All spacing via Tailwind** (no hardcoded padding/margin/gap)  
✅ **All data from hooks** (useThreads, useContacts, etc.)  
✅ **All colors from CSS tokens** (dark + light support)  
✅ **Zero hardcoded styles** (className only, no inline style except Tailwind)  
✅ **Copy/paste-ready code** (zero placeholders, zero "TODO" comments)  
✅ **Modular components** (each file ~100–300 lines, single responsibility)  
✅ **Dark + Light modes** (both shipped, system preference detection)  
✅ **Responsive scaffolding** (desktop-first, tablet/mobile CSS ready for Phase 2)

---

## Success Criteria

- ✅ Inbox fully interactive (click thread → detail + context, filter by segment)
- ✅ People screen renders contact list + detail
- ✅ Menu Builder canvas placeholder + choice editor visible
- ✅ Dark mode active by default, light mode toggle in Settings works
- ✅ All spacing via Tailwind (no cramping, no wasted space)
- ✅ Grid responsive with minmax() (desktop focus)
- ✅ Zero hardcoded colors or spacing
- ✅ Fixtures load into Context, components render from hooks
- ✅ `npm run dev` runs without errors, all screens navigate
- ✅ Code is modular (can work on Inbox + People in parallel in Phase 1b)

---

## Files to Keep Unchanged

- `frontend/src/api.ts` + `api.mock.ts` (Tauri layer, don't refactor)
- `frontend/src/navIcons.tsx` (import into Nav.tsx)
- `src-tauri/` (Rust backend, untouched)

---

## Fixtures Source

Use one of:
1. `/docs/fixtures/signalx_fixtures.json` (if it exists and is complete)
2. `frontend/src/api.mock.ts` (copy fixture data from here if preferred)
3. Create new fixtures at `frontend/public/fixtures/signalx_fixtures.json`

Whichever source, load in `SignalXContext` on mount via `fetch()` or import.

---

## Next: Hand to Cursor

Copy this spec to `/frontend/SIGNALX_PHASE1_BUILD_SPEC.md` and brief Cursor:

> Read `SIGNALX_PHASE1_BUILD_SPEC.md` in full. Build Phase 1 following the "Build Order" section exactly. Output: ~4,500 lines TSX + CSS, all copy/paste-ready, zero placeholders. Start with Phase 1a (Tailwind setup, theme, Context), then move through 1b–1g sequentially. All spacing via Tailwind utilities. All data from hooks.
