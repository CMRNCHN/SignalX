# Phase 1 Type System vs. Real Backend (api.ts)

**Date**: 2026-09-07  
**Source**: Phase 1 frontend (`origin/cursor/cloud-agent-1788721043385-delzg`) types.ts vs. live backend (`src/api.ts`)  
**Status**: Read-only audit; no source files modified.

---

## Executive Summary

The Phase 1 UI uses a simplified, buyer-seller domain model. The real backend models Signal's multi-account, multi-thread messaging with thread participants (not paired buyer/seller). **Reconciliation requires structural changes to Phase 1 components, not just type adjustments.** This is a model gap, not a field naming issue.

---

## Type-by-Type Delta

### 1. `ThreadMessage` (Phase 1) → `Message` (api.ts)

**Phase 1**:
```typescript
type ThreadMessage = {
  id: string;
  role: "buyer" | "seller";
  text: string;
  timestamp: number;
  read: boolean;
}
```

**Real Backend** (`Message` from api.ts:10):
```typescript
interface Message {
  id: string;
  thread_id: string;
  timestamp: number;
  sender: string;
  recipient?: string | null;
  content: string;
  direction: "Incoming" | "Outgoing" | string;
  raw_json?: unknown;
}
```

**Deltas**:
| Phase 1 | Backend | Notes |
|---------|---------|-------|
| `role: "buyer" \| "seller"` | `direction: "Incoming" \| "Outgoing"` | Completely different semantics. Phase 1 models sender role; backend models direction in message flow. Phase 1 determines role from context (who initiates a thread). |
| `text` | `content` | Simple rename |
| `read: boolean` | ❌ Not in Message | Backend doesn't track read status per-message; relies on `ThreadSummary.unread_count` |
| ❌ No `thread_id` | `thread_id: string` | **Required**: Phase 1 assumes context; backend requires explicit thread ID |
| ❌ No `sender` | `sender: string` | **Required**: Backend always includes sender; Phase 1 assumes implicit |
| ❌ No `recipient` | `recipient?: string | null` | **New field**: Useful for DMs |
| ❌ No `raw_json` | `raw_json?: unknown` | Backend preserves Signal metadata |

**Component Impact**:
- `ThreadDetail.tsx` assumes `message.role` to determine sender/recipient styling → must adapt to `message.direction` or derive role from context
- `InboxScreen.tsx` marks reads via local state → no backend sync; must poll `ThreadSummary.unread_count`
- All message rendering must construct thread context (who sent/received) from `direction + sender`, not `role`

---

### 2. `Thread` (Phase 1) → `ThreadSummary` (api.ts) + `Message[]`

**Phase 1**:
```typescript
type Thread = {
  id: string;
  buyerId: string;
  messages: ThreadMessage[];
  status: "open" | "resolved";
  lastMessage: string;
  unread: number;
  kind: "dm" | "group";
  needsSend: boolean;
}
```

**Real Backend** (`ThreadSummary` from api.ts:21):
```typescript
interface ThreadSummary {
  id: string;
  participants: string[];
  last_message_timestamp: number;
  unread_count: number;
  message_count: number;
  outbox_count: number;
}
```

**Deltas**:
| Phase 1 | Backend | Notes |
|---------|---------|-------|
| `buyerId: string` | `participants: string[]` | **Structural**: Phase 1 assumes 2-party (buyer/seller); backend handles N-party groups. Phase 1 treats one participant as primary; backend lists all |
| `messages: ThreadMessage[]` | ❌ Not in ThreadSummary | **Separate call**: Use `api.getThreadMessages(threadId)` to fetch messages |
| `status: "open" \| "resolved"` | ❌ Not in ThreadSummary | Phase 1 custom business logic; not in backend. Must be tracked in local component state or a separate "resolved threads" list |
| `lastMessage: string` | `last_message_timestamp: number` | Backend gives timestamp only; need separate `Message` fetch to get content. Phase 1 renders last message text directly |
| `unread: number` | `unread_count: number` | Simple rename |
| `kind: "dm" \| "group"` | ❌ Not in ThreadSummary | Inferred from `participants.length`: `len=1 → "dm"`, `len>1 → "group"`. But backend might have 1-on-1 group threads |
| `needsSend: boolean` | `outbox_count: number` | Similar intent: `needsSend ≈ outbox_count > 0`. Phase 1 is boolean; backend gives count |

**Component Impact**:
- `ThreadList.tsx` renders `threads` from Phase 1 state; now must fetch `api.getThreads()` → `ThreadSummary[]`
- `ThreadDetail.tsx` expects `thread.messages` in memory; now must call `api.getThreadMessages(threadId)` + handle async loading
- Status tracking ("open" vs "resolved") is custom; either add to local state or remove from Phase 1 UI
- Deriving `kind` from `participants.length` may fail on actual Signal data (e.g., 1-person group threads)

---

### 3. `Contact` (Phase 1) → `ContactMeta` (api.ts)

**Phase 1**:
```typescript
type Contact = {
  id: string;
  name: string;
  phone: string;
  alias?: string;
  email?: string;
  meta?: {
    favorite?: boolean;
    vip?: boolean;
    coresBuyer?: boolean;
    notes?: string;
    standing?: string;
  };
}
```

**Real Backend** (`ContactMeta` from api.ts:123):
```typescript
interface ContactMeta {
  contact_id: string;
  display_name?: string | null;
  alias?: string | null;
  categories: string[];
  favorite: boolean;
  muted: boolean;
  auto_reply_enabled?: boolean;
  updated_at: number;
}
```

**Deltas**:
| Phase 1 | Backend | Notes |
|---------|---------|-------|
| `id` | `contact_id` | Simple rename |
| `name` | `display_name` | Close; backend allows null |
| `phone` | ❌ Not in ContactMeta | **Not tracked by backend**; backend uses Signal phone number as identifier (part of `contact_id`) |
| `email` | ❌ Not in ContactMeta | Backend doesn't store email |
| `meta.vip` | ❌ Not in ContactMeta | Phase 1 custom; must store locally or extend backend |
| `meta.coresBuyer` | ❌ Not in ContactMeta | Phase 1 custom; must store locally |
| `meta.notes` | ❌ Not in ContactMeta | Phase 1 custom; backend has `AutoReplyAuditEntry` entries but not free-form notes |
| `meta.standing` | ❌ Not in ContactMeta | Phase 1 custom (e.g., "Open balance", "Good") |
| ❌ No `categories` | `categories: string[]` | Backend supports arbitrary category tags; Phase 1 doesn't expose |
| ❌ No `muted` | `muted: boolean` | Backend can mute contacts; Phase 1 doesn't show this |
| ❌ No `auto_reply_enabled` | `auto_reply_enabled?: boolean` | Backend tracks per-contact auto-reply; Phase 1 doesn't |
| ❌ No `updated_at` | `updated_at: number` | Backend tracks metadata change times |

**Component Impact**:
- `PeopleScreen.tsx` / `ContactList.tsx` must call `api.listContactMeta()` instead of local fixture
- Display name only; phone number must come from thread participant list or Signal CLI
- "VIP", "core buyer", notes, standing are Phase 1-only; either remove or add local storage
- Mute / auto-reply toggles exist in backend but not in Phase 1 UI; optionally expose

---

### 4. `Product` (Phase 1) → `Product` (api.ts)

**Phase 1**:
```typescript
type Product = {
  id: string;
  name: string;
  priceCents: number;
  unit: string;
  quantity: number;
}
```

**Real Backend** (`Product` from api.ts:249):
```typescript
interface Product {
  id: string;
  name: string;
  description: string;
  sku: string;
  price_cents: number;
  cost_cents: number;
  supplier: string;
  base_unit: string;
  stock_unit: string;
  sales_unit: string;
  quantity_base_milli: number;
  quantity_in_stock: number;
  stock_qty?: number | null;
  unit: string;
  weight: number;
  weight_unit: string;
  image_path: string;
  sell_options: SellOption[];
  low_stock_threshold_milli: number;
  updated_at: number;
}
```

**Deltas**:
| Phase 1 | Backend | Notes |
|---------|---------|-------|
| `id` | `id` | ✓ Match |
| `name` | `name` | ✓ Match |
| `priceCents` | `price_cents` | Rename (camelCase → snake_case) |
| `quantity` | `quantity_in_stock` | Backend distinguishes base unit from stock unit |
| ❌ No `description` | `description: string` | Backend has product descriptions |
| ❌ No `sku` | `sku: string` | Backend tracks SKU |
| ❌ No `cost_cents` | `cost_cents: number` | Backend tracks cost; Phase 1 only shows sell price |
| ❌ No `supplier` | `supplier: string` | Backend tracks supplier |
| ❌ No unit conversions | `base_unit`, `stock_unit`, `sales_unit`, `quantity_base_milli` | Backend has sophisticated unit handling; Phase 1 is simple |
| ❌ No `weight` | `weight: number` | Backend tracks weight |
| ❌ No `weight_unit` | `weight_unit: string` | Backend tracks weight unit |
| ❌ No `image_path` | `image_path: string` | Backend stores product images |
| ❌ No `sell_options` | `sell_options: SellOption[]` | Backend supports multi-unit pricing (e.g., "3-pack @ $75" vs "single @ $30") |
| ❌ No `low_stock_threshold_milli` | `low_stock_threshold_milli: number` | Backend alerts on low stock |
| ❌ No `updated_at` | `updated_at: number` | Backend tracks last update time |

**Component Impact**:
- `CatalogScreen.tsx` simple product display; fetch via `api.listProducts()`
- Phase 1 shows price and quantity; backend has much richer data (images, descriptions, unit conversions, multi-pack pricing)
- Optional: Expand Phase 1 product card to show description, image, sell options
- Quantity display must map `quantity_in_stock` carefully; backend uses `quantity_base_milli` for fractional units

---

### 5. `Order` (Phase 1) → `Order` (api.ts)

**Phase 1**:
```typescript
type Order = {
  id: string;
  buyerId: string;
  total: number;
  status: "pending" | "confirmed" | "delivered";
  items: Array<{ productId: string; qty: number }>;
}
```

**Real Backend** (`Order` from api.ts:338):
```typescript
interface Order {
  id: string;
  customer_id: string;
  thread_id: string;
  status: string;
  lines: OrderLine[];
  total_cents: number;
  created_at: number;
  updated_at: number;
}
```

**Deltas**:
| Phase 1 | Backend | Notes |
|---------|---------|-------|
| `buyerId` | `customer_id` | Simple rename; backend uses Customer ID, not Thread ID |
| `total` | `total_cents` | Phase 1 assumes whole dollars; backend uses cents |
| `status: "pending" \| "confirmed" \| "delivered"` | `status: string` | Backend is open-ended; Phase 1 enumerates 3 states. Actual backend states: `draft`, `pending`, `confirmed`, `sent`, `paid`, etc. |
| `items: Array<{ productId, qty }>` | `lines: OrderLine[]` | Backend's `OrderLine` is richer |
| | | **OrderLine** (from api.ts:327): `product_id`, `name`, `quantity`, `unit_price_cents`, `unit`, `quantity_base_milli?`, `line_total_cents?`, `sell_option_label?` |

**Component Impact**:
- `OrdersScreen.tsx` fetch via `api.listOrders(threadId?)`
- Total in cents; display must divide by 100
- Status is open-ended string, not enum; Phase 1 enum will miss real states (draft, sent, paid)
- Each order line has `unit_price_cents` and `line_total_cents`; Phase 1 infers from product catalog

---

### 6. `Menu` & `MenuChoice` (Phase 1) → **Not in api.ts**

**Phase 1**:
```typescript
type MenuChoice = {
  id: string;
  text: string;
  action: string;
};

type Menu = {
  id: string;
  name: string;
  choices: MenuChoice[];
};
```

**Real Backend**: No direct Menu type, but see `IvrMenus` / `IvrNode` in api.ts:216

```typescript
interface IvrMenus {
  version: number;
  entry: string;
  session_ttl_ms: number;
  nodes: Record<string, IvrNode>;
}

interface IvrNode {
  prompt: string;
  choices?: Record<string, IvrChoice>;
  on_unknown?: string | null;
  capture_slot?: string | null;
  after_capture?: IvrAfterCapture | null;
}

interface IvrChoice {
  goto?: string | null;
  action?: string | null;
  reply?: string | null;
}
```

**Deltas**:
| Phase 1 Menu | Backend IVR | Notes |
|------|------|-------|
| `Menu { id, name, choices }` | `IvrMenus { version, entry, nodes }` | **Structural mismatch**: Phase 1 is a flat menu; backend is a state machine (nodes with transitions) |
| `MenuChoice { id, text, action }` | `IvrChoice { goto?, action?, reply? }` | Phase 1 choice is a label + action; backend choice includes state transition (goto) and reply text |

**Component Impact**:
- `MenuBuilder/ChoiceEditor.tsx` edits Phase 1 simplified menus
- Backend has `api.getIvrMenus()` which returns full `IvrMenus` state machine
- **Incompatible models**: Phase 1 builder would need complete rewrite to support state transitions, captures, branching
- Phase 1 menu builder is a toy UI; real builder would be `IvrMenuComposer.tsx` in live src/ (for Tauri app)

---

### 7. `ScreenId` (Phase 1) → **Not in api.ts**

**Phase 1**:
```typescript
type ScreenId =
  | "inbox"
  | "people"
  | "menu"
  | "settings"
  | "catalog"
  | "orders"
  | "sales"
  | "outbox"
  | "audit";
```

**Real Backend**: N/A (client-side navigation, not backend concern)

**Notes**: Phase 1 screen routing is independent; no backend type to match.

---

## Reconciliation Strategy

### Option A: Minimize Phase 1 (Recommended for PoC)
1. Keep Phase 1 as a **design artifact only**, not a real UI
2. Strip out custom fields (`vip`, `standing`, notes) from fixtures
3. Map Phase 1 types to real api.ts types where 1:1 correspondence exists (Product, Order mostly match)
4. Document the gaps (read status, status enum, custom contact fields) as Phase 2 features

### Option B: Full Alignment (Requires Component Rebuild)
1. Rewrite `ThreadDetail` to fetch `Message[]` + display via `direction` (not `role`)
2. Rewrite `ThreadList` to derive `kind` from `participants.length`
3. Add async loader for messages (currently assumes in-memory `thread.messages`)
4. Remove or re-implement custom Contact fields (vip, notes, standing)
5. Update Order status enum to match backend (draft, pending, confirmed, sent, paid, …)
6. Rebuild Menu builder to support IVR state machine (goto transitions, captures)

### Fixture Data Changes
If transitioning Phase 1 to consume real backend:
- **Thread**: Remove `needsSend`, `status`; add `message_count`, `outbox_count`
- **Thread.messages**: Fetch separately; add `thread_id`, `sender`, `recipient`, `direction`
- **Contact**: Remove `vip`, `coresBuyer`, `notes`, `standing`; add `categories`, `muted`, `auto_reply_enabled`
- **Product**: Rename `priceCents` → `price_cents`, `quantity` → `quantity_in_stock`; optionally add `description`, `sku`, `image_path`
- **Order**: Rename `buyerId` → `customer_id`; add `thread_id`, `created_at`, `updated_at`; expand status enum
- **Menu**: Replace entire fixture with real `IvrMenus` structure from `api.getIvrMenus()`

---

## Summary Table

| Phase 1 Type | Closest Backend Type | Alignment | Effort |
|---|---|---|---|
| `ThreadMessage` | `Message` | 40% | Medium (direction ≠ role) |
| `Thread` | `ThreadSummary` + `Message[]` | 50% | High (async loading, N-party participants) |
| `Contact` | `ContactMeta` | 60% | Medium (custom fields, no phone in backend) |
| `Product` | `Product` | 85% | Low (mostly field renames + optional expansion) |
| `Order` | `Order` | 80% | Low (cents, status enum, richer OrderLine) |
| `Menu` | `IvrMenus` | 20% | Very High (flat menu → state machine) |
| `MenuChoice` | `IvrChoice` | 30% | Very High (missing goto/capture semantics) |

---

## Conclusion

Phase 1 is a **simplified, buyer-seller-centric mockup**. The backend is **multi-account, multi-participant messaging with commerce overlays**. Reconciliation is possible but requires:

1. **Structural changes** (N-party threads, state-machine menus)
2. **Async refactoring** (messages no longer in-memory; separate fetches)
3. **Custom field replacement** (VIP, notes, standing → none; or build separate local state)
4. **Enum expansion** (order status, thread status → open-ended strings)

**Recommendation**: Keep Phase 1 as design reference. Build live Phase 2 UI incrementally from real backend types, starting with Inbox + People (largest deltas), then Orders (smallest delta).
