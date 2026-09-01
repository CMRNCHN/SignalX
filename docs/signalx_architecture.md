# SignalX Architecture Manifest

High-level structure for the SignalX desktop CRM + Signal messaging app (Tauri v2 + React/Vite).

---

## 1. Application topology

```text
┌─────────────────────────────────────────────────────────────┐
│  Tauri shell (src-tauri/)                                    │
│  ├─ lib.rs          IPC commands, session, bootstrap         │
│  ├─ demo.rs         One-time CRM seed                        │
│  ├─ commerce.rs     Products, customers                      │
│  ├─ orders.rs       Quotes, invoices, fulfillment            │
│  ├─ ivr.rs          Buyer menu / IVR trees                   │
│  └─ contact/group   People metadata                          │
└──────────────────────────┬──────────────────────────────────┘
                           │ invoke (src/api.ts)
┌──────────────────────────▼──────────────────────────────────┐
│  React UI (src/)                                             │
│  ├─ App.tsx         Shell, routing, all main panels          │
│  ├─ ProfileRail.tsx Thread/customer profile column           │
│  ├─ IvrMenuComposer.tsx  Visual + text menu builder          │
│  ├─ status.ts       Order/thread status tones + labels       │
│  ├─ segments.ts     Customer segment derivation            │
│  └─ styles.css      Design system + responsive grid          │
└─────────────────────────────────────────────────────────────┘
```

**Runtime data path (Linux):** `~/.local/share/SignalX/`  
Accounts, threads, commerce, IVR, and contacts persist per account id.

---

## 2. Navigation model

Five primary panels (`Panel` type in `App.tsx`):

| ID | Label | Layout class | Columns |
|----|-------|--------------|---------|
| `inbox` | Inbox | `.shell.shell-with-profile` | 4 |
| `people` | People | `.shell.shell-with-profile` | 4 |
| `catalog` | Catalog | `.shell.shell-with-profile` | 4 |
| `orders` | Orders | `.shell.shell-with-profile` | 4 |
| `settings` | Settings | `.shell.shell-three` | 3 |

Settings sub-tabs (`SettingsTab`): `account`, `device`, `delivery`, `auto`, `activity`, `backup`.

**Overlay / full-width:** IVR menu builder (`.ivr-composer-page`) spans columns 2–end when open from Catalog.

---

## 3. Layout patterns

### Four-panel shell

```text
┌────────┬────────────┬──────────────────┬──────────────┐
│  Rail  │  List col  │  Workspace       │  Profile     │
│  220px │  240–340px │  flex 1          │  280–380px   │
│  nav   │  threads/  │  convo / form /  │  ProfileRail │
│        │  products/ │  order detail    │  or related  │
│        │  orders    │                  │              │
└────────┴────────────┴──────────────────┴──────────────┘
```

Grid definition: `src/styles.css` → `.shell`, `.shell-with-profile`.

### Three-panel settings

```text
┌────────┬────────────┬──────────────────────────────┐
│  Rail  │  Settings  │  Settings body             │
│        │  nav tabs  │  cards (account, delivery…) │
└────────┴────────────┴──────────────────────────────┘
```

---

## 4. Module breakdown

### Frontend (`src/`)

| Module | Responsibility |
|--------|----------------|
| `App.tsx` | Global state, panel switch, inbox/people/catalog/orders/settings JSX |
| `ProfileRail.tsx` | Per-thread profile: standing, segments, actions, orders |
| `IvrMenuComposer.tsx` | Visual canvas, text editor, buyer phone preview |
| `api.ts` | TypeScript interfaces + `invoke` wrappers |
| `status.ts` | Status tone + label helpers |
| `segments.ts` | Customer segment chips (Favorite, VIP, buyer tags) |
| `EmptyState.tsx` | Structured empty / zero-result states |
| `DeviceLinkQr.tsx` | Device link QR for settings |
| `navIcons.tsx` | Sidebar SVG icons |
| `styles.css` | Tokens, components, breakpoints |

### Backend (`src-tauri/src/`)

| Module | Responsibility |
|--------|----------------|
| `lib.rs` | Tauri app, command handlers, account bootstrap |
| `demo.rs` | Seed contacts, threads, products, orders, IVR |
| `commerce.rs` | Product catalog, customers, stock |
| `orders.rs` | Order lifecycle, seeded insert |
| `ivr.rs` | Menu JSON, product binding on choices |
| `contact_store` / `group_store` | People metadata |

---

## 5. Data models (canonical)

Source of truth for TypeScript shapes: **`src/api.ts`**.

### Core entities

| Model | Key fields |
|-------|------------|
| **ThreadSummary** | `id`, `participants`, `unread_count`, `outbox_count`, `last_preview` |
| **Message** | `thread_id`, `direction`, `content`, `timestamp` |
| **ContactMeta** | `contact_id`, `display_name`, `favorite`, `muted`, `auto_reply_enabled` |
| **GroupMeta** | `group_id`, `display_name`, `member_notes` |
| **Customer** | `id`, `thread_id`, `display_name`, `notes` |
| **Product** | `id`, `name`, `price_cents`, `quantity_base_milli`, `sell_options`, `sku` |
| **Order** | `id`, `thread_id`, `status`, `lines[]`, `total_cents` |
| **OrderLine** | `product_id`, `name`, `quantity`, `unit_price_cents` |
| **IvrMenus** | `entry`, `nodes` (prompt, choices, product_id, actions) |
| **OutboxItem** | `thread_id`, `state`, `content`, `last_error` |

### Order status enum (UI mapping)

| Status | Tone | Badge |
|--------|------|-------|
| paid, confirmed, fulfilled | `ok` | ✓ green |
| draft, invoiced, pending | `warn` | ⚠ amber |
| cancelled, failed | `danger` | ✗ red |

Implemented in `src/status.ts`.

---

## 6. Design system

### Color tokens (`src/styles.css`)

| Token | Usage |
|-------|-------|
| `--bg`, `--surface-*` | Zinc dark surfaces |
| `--text`, `--text-dim` | Primary / secondary copy (5:1 target on secondary) |
| `--status-ok-*` | Success / paid / confirmed |
| `--status-warn-*` | Draft / awaiting |
| `--status-danger-*` | Cancelled / failed |
| `--accent-cta` | Primary button fill |

### Component classes

| Class | Role |
|-------|------|
| `.nav-btn`, `.nav-ico` | Sidebar navigation |
| `.thread-row`, `.thread-list` | List columns |
| `.convo`, `.msg-scroll`, `.bubble` | Message workspace |
| `.profile-rail`, `.profile-section` | Right profile column |
| `.filter-chip`, `.status-pill` | Filters and badges |
| `.action-btn.primary` | Primary CTAs |
| `.empty-state` | Zero-result blocks |
| `.form-card`, `.form-grid-2` | Catalog product forms |
| `.ivr-screen-card`, `.ivr-composer-page` | Menu builder |

### Touch targets

Minimum ~36–44px on nav, filters, search inputs, and primary buttons.

---

## 7. Event & refresh model

- Tauri events via `api.onEvent` → thread/outbox/commerce refresh
- Panel-local refresh on tab switch (e.g. settings delivery → outbox poll)
- Demo seed runs once when account has **no threads** (`demo.rs`)

---

## 8. Related docs

| Doc | Purpose |
|-----|---------|
| [`signalx_screen_manifest.md`](signalx_screen_manifest.md) | Per-screen component map |
| [`SIGNALX_QUICKSTART.md`](SIGNALX_QUICKSTART.md) | Implementation phases |
| [`QUICKSTART.md`](QUICKSTART.md) | Dev environment |
| [`BUILD.md`](BUILD.md) | Production builds |
| [`AGENTS.md`](../AGENTS.md) | Cloud agent / Linux notes |
