/**
 * Dev-only sample data for design work.
 *
 * SAFETY: these values are never written through `api.*` and never reach the
 * daemon or SQLite. They are substituted at the render layer only, and the
 * `USE_FIXTURES` gate is compiled out of release builds by Vite. Do not import
 * this module from anything that performs a mutation.
 */
import type {
  AutoReplyAuditEntry,
  CommerceAuditEvent,
  ContactMeta,
  Customer,
  GroupMeta,
  Message,
  Order,
  OutboxItem,
  Product,
  SalesSummary,
  SearchResult,
  ThreadSummary,
} from "./api";

/**
 * On in `npm run dev`. Off in any normal build — verified by grepping the
 * bundle for fixture strings. `VITE_SIGNALX_FIXTURES=on` forces it into a
 * bundled build, which exists only so design review can screenshot a real
 * .app window; never use it for a build you intend to ship.
 */
export const USE_FIXTURES =
  import.meta.env.VITE_SIGNALX_FIXTURES === "on" ||
  (import.meta.env.DEV && import.meta.env.VITE_SIGNALX_FIXTURES !== "off");

const NOW = Date.now();
const mins = (n: number) => NOW - n * 60_000;
const hours = (n: number) => NOW - n * 3_600_000;
const days = (n: number) => NOW - n * 86_400_000;

export const fxThreads: ThreadSummary[] = [
  {
    id: "+15555550142",
    participants: ["+15555550142"],
    last_message_timestamp: mins(4),
    unread_count: 3,
    message_count: 47,
    outbox_count: 0,
  },
  {
    id: "+15555550188",
    participants: ["+15555550188"],
    last_message_timestamp: mins(38),
    unread_count: 0,
    message_count: 112,
    outbox_count: 1,
  },
  {
    id: "group.aGFydmVzdA",
    participants: ["+15555550142", "+15555550188", "+15555550196"],
    last_message_timestamp: hours(2),
    unread_count: 12,
    message_count: 340,
    outbox_count: 0,
  },
  {
    id: "+15555550196",
    participants: ["+15555550196"],
    last_message_timestamp: hours(6),
    unread_count: 0,
    message_count: 23,
    outbox_count: 0,
  },
  {
    id: "+15555550173",
    participants: ["+15555550173"],
    last_message_timestamp: days(1),
    unread_count: 0,
    message_count: 8,
    outbox_count: 0,
  },
  {
    id: "group.d2hvbGVzYWxl",
    participants: ["+15555550142", "+15555550173"],
    last_message_timestamp: days(2),
    unread_count: 0,
    message_count: 61,
    outbox_count: 0,
  },
  {
    id: "+15555550205",
    participants: ["+15555550205"],
    last_message_timestamp: days(4),
    unread_count: 0,
    message_count: 15,
    outbox_count: 0,
  },
];

export const fxMessages: Message[] = [
  {
    id: "m1",
    thread_id: "+15555550142",
    timestamp: mins(52),
    sender: "+15555550142",
    content: "morning! do you still have the ethiopia natural in stock?",
    direction: "Incoming",
  },
  {
    id: "m2",
    thread_id: "+15555550142",
    timestamp: mins(48),
    sender: "self",
    recipient: "+15555550142",
    content:
      "We do — 340g bags, $18.50. Just roasted Tuesday so it'll be peaking this weekend.",
    direction: "Outgoing",
  },
  {
    id: "m3",
    thread_id: "+15555550142",
    timestamp: mins(31),
    sender: "+15555550142",
    content: "perfect. can i get two bags plus a kilo of the house blend?",
    direction: "Incoming",
  },
  {
    id: "m4",
    thread_id: "+15555550142",
    timestamp: mins(28),
    sender: "self",
    recipient: "+15555550142",
    content:
      "Done — 2× Ethiopia Natural 340g and 1kg House Blend. That's $61.00 total. Want me to invoice the usual way?",
    direction: "Outgoing",
  },
  {
    id: "m5",
    thread_id: "+15555550142",
    timestamp: mins(9),
    sender: "+15555550142",
    content: "yes please. same address as last time",
    direction: "Incoming",
  },
  {
    id: "m6",
    thread_id: "+15555550142",
    timestamp: mins(4),
    sender: "+15555550142",
    content: "also — do you ship to PO boxes?",
    direction: "Incoming",
  },
];

export const fxContacts: ContactMeta[] = [
  {
    contact_id: "+15555550142",
    display_name: "Marta Vieira",
    alias: "Marta — Cafe Lumen",
    categories: ["wholesale", "vip"],
    favorite: true,
    muted: false,
    auto_reply_enabled: true,
    updated_at: mins(4),
  },
  {
    contact_id: "+15555550188",
    display_name: "Dev Raman",
    alias: "Dev (Tuesday market)",
    categories: ["retail"],
    favorite: true,
    muted: false,
    auto_reply_enabled: false,
    updated_at: mins(38),
  },
  {
    contact_id: "+15555550196",
    display_name: "Priya Anand",
    alias: null,
    categories: ["wholesale"],
    favorite: false,
    muted: false,
    auto_reply_enabled: true,
    updated_at: hours(6),
  },
  {
    contact_id: "+15555550173",
    display_name: "Tomas Lindqvist",
    alias: "Tomas — supplier",
    categories: ["supplier"],
    favorite: false,
    muted: true,
    auto_reply_enabled: false,
    updated_at: days(1),
  },
  {
    contact_id: "+15555550205",
    display_name: "Ana Reyes",
    alias: null,
    categories: ["retail", "new"],
    favorite: false,
    muted: false,
    auto_reply_enabled: false,
    updated_at: days(4),
  },
  {
    contact_id: "+15555550231",
    display_name: null,
    alias: null,
    categories: [],
    favorite: false,
    muted: false,
    auto_reply_enabled: false,
    updated_at: days(9),
  },
];

export const fxGroups: GroupMeta[] = [
  {
    group_id: "group.aGFydmVzdA",
    display_name: "Harvest Co-op",
    categories: ["wholesale"],
    favorite: true,
    muted: false,
    auto_reply_enabled: false,
    updated_at: hours(2),
  },
  {
    group_id: "group.d2hvbGVzYWxl",
    display_name: "Wholesale Buyers",
    categories: ["wholesale", "priority"],
    favorite: false,
    muted: false,
    auto_reply_enabled: true,
    updated_at: days(2),
  },
  {
    group_id: "group.bWFya2V0",
    display_name: "Saturday Market Crew",
    categories: ["ops"],
    favorite: false,
    muted: true,
    auto_reply_enabled: false,
    updated_at: days(5),
  },
];

const opt = (
  id: string,
  label: string,
  amount: number,
  unit: string,
  price_cents?: number,
) => ({ id, label, amount, unit, price_cents: price_cents ?? null });

export const fxProducts: Product[] = [
  {
    id: "p_eth_nat",
    name: "Ethiopia Natural — Guji",
    description: "Blueberry, stone fruit, cocoa finish. Roasted Tuesdays.",
    sku: "ETH-GUJ-01",
    price_cents: 1850,
    cost_cents: 940,
    supplier: "Lindqvist Green Coffee",
    base_unit: "g",
    stock_unit: "kg",
    sales_unit: "g",
    quantity_base_milli: 14_000_000,
    quantity_in_stock: 14,
    stock_qty: 14,
    unit: "g",
    weight: 340,
    weight_unit: "g",
    image_path: "",
    sell_options: [
      opt("so1", "340g bag", 340, "g", 1850),
      opt("so2", "1kg bag", 1000, "g", 4900),
    ],
    low_stock_threshold_milli: 3_000_000,
    updated_at: hours(20),
  },
  {
    id: "p_house",
    name: "House Blend",
    description: "Everyday espresso. Chocolate, hazelnut, brown sugar.",
    sku: "HSE-BLD-01",
    price_cents: 1450,
    cost_cents: 690,
    supplier: "Lindqvist Green Coffee",
    base_unit: "g",
    stock_unit: "kg",
    sales_unit: "g",
    quantity_base_milli: 41_000_000,
    quantity_in_stock: 41,
    stock_qty: 41,
    unit: "g",
    weight: 340,
    weight_unit: "g",
    image_path: "",
    sell_options: [
      opt("so3", "340g bag", 340, "g", 1450),
      opt("so4", "1kg bag", 1000, "g", 3800),
    ],
    low_stock_threshold_milli: 5_000_000,
    updated_at: days(3),
  },
  {
    id: "p_colombia",
    name: "Colombia Washed — Huila",
    description: "Caramel, red apple, clean finish.",
    sku: "COL-HUI-02",
    price_cents: 1650,
    cost_cents: 820,
    supplier: "Andes Direct",
    base_unit: "g",
    stock_unit: "kg",
    sales_unit: "g",
    quantity_base_milli: 2_100_000,
    quantity_in_stock: 2,
    stock_qty: 2,
    unit: "g",
    weight: 340,
    weight_unit: "g",
    image_path: "",
    sell_options: [opt("so5", "340g bag", 340, "g", 1650)],
    low_stock_threshold_milli: 4_000_000,
    updated_at: days(6),
  },
  {
    id: "p_decaf",
    name: "Decaf Swiss Water",
    description: "Full body, no jitters. Great for late orders.",
    sku: "DEC-SW-01",
    price_cents: 1550,
    cost_cents: 810,
    supplier: "Andes Direct",
    base_unit: "g",
    stock_unit: "kg",
    sales_unit: "g",
    quantity_base_milli: 8_500_000,
    quantity_in_stock: 8,
    stock_qty: 8,
    unit: "g",
    weight: 340,
    weight_unit: "g",
    image_path: "",
    sell_options: [opt("so6", "340g bag", 340, "g", 1550)],
    low_stock_threshold_milli: 3_000_000,
    updated_at: days(11),
  },
  {
    id: "p_filters",
    name: "V60 Filters (100ct)",
    description: "Tabbed, natural paper.",
    sku: "ACC-V60-100",
    price_cents: 900,
    cost_cents: 380,
    supplier: "Brewgear Wholesale",
    base_unit: "ea",
    stock_unit: "ea",
    sales_unit: "ea",
    quantity_base_milli: 63_000,
    quantity_in_stock: 63,
    stock_qty: 63,
    unit: "ea",
    weight: 120,
    weight_unit: "g",
    image_path: "",
    sell_options: [],
    low_stock_threshold_milli: 20_000,
    updated_at: days(14),
  },
];

export const fxCustomers: Customer[] = [
  {
    id: "c_marta",
    thread_id: "+15555550142",
    display_name: "Marta Vieira — Cafe Lumen",
    notes: "Wholesale, net-14. Prefers Tuesday delivery. Always takes the Guji.",
    updated_at: mins(4),
  },
  {
    id: "c_dev",
    thread_id: "+15555550188",
    display_name: "Dev Raman",
    notes: "Retail regular. Picks up at Saturday market.",
    updated_at: mins(38),
  },
  {
    id: "c_priya",
    thread_id: "+15555550196",
    display_name: "Priya Anand",
    notes: "New wholesale account — first order shipped last week.",
    updated_at: hours(6),
  },
  {
    id: "c_ana",
    thread_id: "+15555550205",
    display_name: "Ana Reyes",
    notes: "",
    updated_at: days(4),
  },
];

export const fxOrders: Order[] = [
  {
    id: "ord_9f2a71c4",
    customer_id: "c_marta",
    thread_id: "+15555550142",
    status: "confirmed",
    lines: [
      {
        product_id: "p_eth_nat",
        name: "Ethiopia Natural — Guji",
        quantity: 2,
        unit_price_cents: 1850,
        unit: "g",
        quantity_base_milli: 680_000,
        line_total_cents: 3700,
        sell_option_label: "340g bag",
      },
      {
        product_id: "p_house",
        name: "House Blend",
        quantity: 1,
        unit_price_cents: 3800,
        unit: "g",
        quantity_base_milli: 1_000_000,
        line_total_cents: 3800,
        sell_option_label: "1kg bag",
      },
    ],
    total_cents: 7500,
    created_at: mins(26),
    updated_at: mins(24),
  },
  {
    id: "ord_4c81de09",
    customer_id: "c_dev",
    thread_id: "+15555550188",
    status: "invoiced",
    lines: [
      {
        product_id: "p_colombia",
        name: "Colombia Washed — Huila",
        quantity: 1,
        unit_price_cents: 1650,
        unit: "g",
        line_total_cents: 1650,
        sell_option_label: "340g bag",
      },
    ],
    total_cents: 1650,
    created_at: hours(5),
    updated_at: hours(4),
  },
  {
    id: "ord_b7305e12",
    customer_id: "c_priya",
    thread_id: "+15555550196",
    status: "paid",
    lines: [
      {
        product_id: "p_house",
        name: "House Blend",
        quantity: 4,
        unit_price_cents: 3800,
        unit: "g",
        line_total_cents: 15200,
        sell_option_label: "1kg bag",
      },
    ],
    total_cents: 15200,
    created_at: days(1),
    updated_at: hours(20),
  },
  {
    id: "ord_2ae64f88",
    customer_id: "c_ana",
    thread_id: "+15555550205",
    status: "draft",
    lines: [
      {
        product_id: "p_decaf",
        name: "Decaf Swiss Water",
        quantity: 1,
        unit_price_cents: 1550,
        unit: "g",
        line_total_cents: 1550,
      },
    ],
    total_cents: 1550,
    created_at: days(2),
    updated_at: days(2),
  },
  {
    id: "ord_15c9a730",
    customer_id: "c_marta",
    thread_id: "+15555550142",
    status: "fulfilled",
    lines: [
      {
        product_id: "p_eth_nat",
        name: "Ethiopia Natural — Guji",
        quantity: 6,
        unit_price_cents: 1850,
        unit: "g",
        line_total_cents: 11100,
        sell_option_label: "340g bag",
      },
    ],
    total_cents: 11100,
    created_at: days(6),
    updated_at: days(5),
  },
  {
    id: "ord_88d1b204",
    customer_id: "c_dev",
    thread_id: "+15555550188",
    status: "cancelled",
    lines: [
      {
        product_id: "p_filters",
        name: "V60 Filters (100ct)",
        quantity: 2,
        unit_price_cents: 900,
        unit: "ea",
        line_total_cents: 1800,
      },
    ],
    total_cents: 1800,
    created_at: days(8),
    updated_at: days(8),
  },
];

export const fxOutbox: OutboxItem[] = [
  {
    id: "ob_01",
    account_id: "acct_local",
    thread_id: "+15555550188",
    recipient: "+15555550188",
    content: "Invoice for order 4c81de09 — $16.50. Payable on pickup Saturday.",
    created_at: mins(3),
    last_attempt_at: mins(1),
    attempt_count: 1,
    state: "sending",
    last_error: null,
    attachment_path: null,
  },
  {
    id: "ob_02",
    account_id: "acct_local",
    thread_id: "+15555550196",
    recipient: "+15555550196",
    content: "Your 4kg House Blend shipped this morning — tracking to follow.",
    created_at: mins(11),
    last_attempt_at: null,
    attempt_count: 0,
    state: "queued",
    last_error: null,
    attachment_path: null,
  },
  {
    id: "ob_03",
    account_id: "acct_local",
    thread_id: "+15555550231",
    recipient: "+15555550231",
    content: "Thanks for reaching out — here's this week's list.",
    created_at: hours(3),
    last_attempt_at: hours(1),
    attempt_count: 4,
    state: "failed",
    last_error: "signal-cli: recipient not registered",
    attachment_path: null,
  },
  {
    id: "ob_04",
    account_id: "acct_local",
    thread_id: "group.d2hvbGVzYWxl",
    recipient: "group.d2hvbGVzYWxl",
    content: "October price sheet attached. Order cutoff is Thursday 5pm.",
    created_at: hours(4),
    last_attempt_at: null,
    attempt_count: 0,
    state: "queued",
    last_error: null,
    attachment_path: "/tmp/price-sheet-oct.pdf",
  },
];

export const fxAudit: AutoReplyAuditEntry[] = [
  {
    id: "ar_01",
    account_id: "acct_local",
    thread_id: "+15555550142",
    message_id: "m6",
    draft:
      "We ship to PO boxes for anything under 2kg — anything heavier needs a street address.",
    created_at: mins(4),
    outcome: "sent",
    reason: null,
  },
  {
    id: "ar_02",
    account_id: "acct_local",
    thread_id: "+15555550196",
    message_id: "m22",
    draft: "Yes, the Huila is back in stock as of this morning.",
    created_at: hours(6),
    outcome: "draft_only",
    reason: "chat not in allowlist",
  },
  {
    id: "ar_03",
    account_id: "acct_local",
    thread_id: "group.aGFydmVzdA",
    message_id: "m41",
    draft: "Pickup is 8am Saturday at the north gate.",
    created_at: hours(9),
    outcome: "blocked",
    reason: "groups disabled for auto-reply",
  },
  {
    id: "ar_04",
    account_id: "acct_local",
    thread_id: "+15555550188",
    message_id: "m18",
    draft: "That's $16.50 — I'll queue the invoice now.",
    created_at: days(1),
    outcome: "sent",
    reason: null,
  },
  {
    id: "ar_05",
    account_id: "acct_local",
    thread_id: "+15555550205",
    message_id: "m7",
    draft: "We're closed Sunday but I can have it ready Monday morning.",
    created_at: days(2),
    outcome: "draft_only",
    reason: "hourly cap reached",
  },
];

export const fxSearchHits: SearchResult[] = [
  {
    thread_id: "+15555550142",
    message_id: "m3",
    timestamp: mins(31),
    sender: "+15555550142",
    snippet: "can i get two bags plus a kilo of the house blend?",
  },
  {
    thread_id: "+15555550188",
    message_id: "m18",
    timestamp: days(1),
    sender: "self",
    snippet: "That's $16.50 — I'll queue the invoice now.",
  },
  {
    thread_id: "group.d2hvbGVzYWxl",
    message_id: "m52",
    timestamp: days(2),
    sender: "+15555550173",
    snippet: "October price sheet attached. Order cutoff is Thursday 5pm.",
  },
];

export const fxCommerceAudit: CommerceAuditEvent[] = [
  {
    id: "ce_01",
    kind: "order.confirmed",
    summary: "Order 9f2a71c4 confirmed — $75.00 (Marta Vieira)",
    order_id: "ord_9f2a71c4",
    thread_id: "+15555550142",
    created_at: mins(24),
  },
  {
    id: "ce_02",
    kind: "stock.decrement",
    summary: "Ethiopia Natural — Guji −680g (order 9f2a71c4)",
    product_id: "p_eth_nat",
    created_at: mins(24),
  },
  {
    id: "ce_03",
    kind: "invoice.queued",
    summary: "Invoice for 4c81de09 queued to outbox",
    order_id: "ord_4c81de09",
    thread_id: "+15555550188",
    created_at: hours(4),
  },
  {
    id: "ce_04",
    kind: "stock.low",
    summary: "Colombia Washed — Huila fell below 4kg threshold",
    product_id: "p_colombia",
    created_at: hours(7),
  },
  {
    id: "ce_05",
    kind: "order.paid",
    summary: "Order b7305e12 marked paid — $152.00 (Priya Anand)",
    order_id: "ord_b7305e12",
    thread_id: "+15555550196",
    created_at: hours(20),
  },
  {
    id: "ce_06",
    kind: "order.cancelled",
    summary: "Order 88d1b204 cancelled — restocked 2× V60 Filters",
    order_id: "ord_88d1b204",
    thread_id: "+15555550188",
    created_at: days(8),
  },
];

export const fxSalesSummary: SalesSummary = {
  order_count: 6,
  revenue_cents: 38450,
  by_status: [
    { status: "draft", count: 1, total_cents: 1550 },
    { status: "confirmed", count: 1, total_cents: 7500 },
    { status: "invoiced", count: 1, total_cents: 1650 },
    { status: "paid", count: 1, total_cents: 15200 },
    { status: "fulfilled", count: 1, total_cents: 11100 },
    { status: "cancelled", count: 1, total_cents: 1800 },
  ],
  top_products: [
    { product_id: "p_house", name: "House Blend", quantity: 5, revenue_cents: 19000 },
    {
      product_id: "p_eth_nat",
      name: "Ethiopia Natural — Guji",
      quantity: 8,
      revenue_cents: 14800,
    },
    {
      product_id: "p_colombia",
      name: "Colombia Washed — Huila",
      quantity: 1,
      revenue_cents: 1650,
    },
    { product_id: "p_decaf", name: "Decaf Swiss Water", quantity: 1, revenue_cents: 1550 },
  ],
  orders: fxOrders,
};

/** Last-message text per thread. ThreadSummary carries no snippet, so the
 *  People directory would otherwise show nothing while running on fixtures. */
export const fxThreadPreviews: Record<string, string> = {
  "+15555550142": "also — do you ship to PO boxes?",
  "+15555550188": "Invoice for order 4c81de09 — $16.50. Payable on pickup Saturday.",
  "group.aGFydmVzdA": "Pickup is 8am Saturday at the north gate.",
  "+15555550196": "Your 4kg House Blend shipped this morning — tracking to follow.",
  "+15555550173": "Contract renewal terms agreed. All documents signed.",
  "group.d2hvbGVzYWxl": "October price sheet attached. Order cutoff is Thursday 5pm.",
  "+15555550205": "Thanks for sending over the invoice details!",
  "group.bWFya2V0": "Booth setup starts at 6:00 AM sharp on Saturday.",
};

/* --- Product photography stand-in ----------------------------------------
   Fixture products carry no `image_path`, so the catalog grid rendered five
   identical placeholder glyphs and every card looked the same. These are
   drawn, not photographed: a bag silhouette tinted per product so cards are
   distinguishable at a glance while still reading as sample data.

   They are inert. Nothing here goes through `api.setProductImage`, and the
   loader effect still skips these products because `image_path` stays empty
   — the map is merged in at the render layer only.
-------------------------------------------------------------------------- */

const svgUri = (svg: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(svg.replace(/\s+/g, " ").trim())}`;

/** A 16:10 backdrop matching `.product-card-media`, with a soft floor shadow. */
const stage = (body: string, tint: string) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#26262e"/><stop offset="1" stop-color="#0d0d11"/>
    </linearGradient>
    <radialGradient id="spot" cx="0.5" cy="0.18" r="0.75">
      <stop offset="0" stop-color="${tint}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${tint}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="320" height="200" fill="url(#bg)"/>
  <rect width="320" height="200" fill="url(#spot)"/>
  <ellipse cx="160" cy="180" rx="82" ry="9" fill="#000" opacity="0.5"/>
  ${body}
</svg>`;

/** Coffee bag: crimped top fold, tinted label band, one-way valve. */
const bagSvg = (dark: string, mid: string, label: string, mark: string) =>
  svgUri(
    stage(
      `
  <g>
    <path d="M112 56 h96 a6 6 0 0 1 6 6 v108 a6 6 0 0 1 -6 6 h-96 a6 6 0 0 1 -6 -6 v-108 a6 6 0 0 1 6 -6 z"
          fill="${dark}"/>
    <path d="M112 56 h48 v120 h-48 a6 6 0 0 1 -6 -6 v-108 a6 6 0 0 1 6 -6 z" fill="${mid}" opacity="0.55"/>
    <rect x="104" y="40" width="112" height="18" rx="4" fill="${dark}"/>
    <rect x="104" y="40" width="112" height="18" rx="4" fill="#000" opacity="0.35"/>
    <g fill="#000" opacity="0.25">
      <rect x="110" y="43" width="3" height="12"/><rect x="120" y="43" width="3" height="12"/>
      <rect x="130" y="43" width="3" height="12"/><rect x="140" y="43" width="3" height="12"/>
      <rect x="150" y="43" width="3" height="12"/><rect x="160" y="43" width="3" height="12"/>
      <rect x="170" y="43" width="3" height="12"/><rect x="180" y="43" width="3" height="12"/>
      <rect x="190" y="43" width="3" height="12"/><rect x="200" y="43" width="3" height="12"/>
    </g>
    <rect x="106" y="92" width="108" height="42" fill="${label}"/>
    <rect x="106" y="92" width="108" height="42" fill="#fff" opacity="0.06"/>
    <rect x="118" y="104" width="52" height="5" rx="2.5" fill="${mark}" opacity="0.85"/>
    <rect x="118" y="116" width="32" height="4" rx="2" fill="${mark}" opacity="0.5"/>
    <circle cx="192" cy="150" r="7" fill="#000" opacity="0.45"/>
    <circle cx="192" cy="150" r="3" fill="${mark}" opacity="0.4"/>
  </g>`,
      label,
    ),
  );

export const fxProductImages: Record<string, string> = {
  // Berry-forward natural — magenta label.
  p_eth_nat: bagSvg("#2a2028", "#3a2c37", "#8d5b7a", "#1a1016"),
  // Everyday espresso — warm brown.
  p_house: bagSvg("#282018", "#372c20", "#8a6a45", "#1c130a"),
  // Red apple, caramel — clay red.
  p_colombia: bagSvg("#2b1e1b", "#3b2a25", "#9a5b4c", "#1c100d"),
  // Decaf reads cool so it is never confused with the others on the shelf.
  p_decaf: bagSvg("#1b2429", "#253238", "#4e7183", "#0d161a"),
  // Not coffee: a stack of paper cones in a carton.
  p_filters: svgUri(
    stage(
      `
  <g>
    <path d="M96 118 h128 l-14 56 h-100 z" fill="#2d2a24"/>
    <path d="M96 118 h64 v56 h-50 z" fill="#3a362e" opacity="0.6"/>
    <path d="M92 108 h136 v14 h-136 z" fill="#443f35"/>
    <g>
      <path d="M120 46 l34 66 h-68 z" fill="#a89a80"/>
      <path d="M120 46 l34 66 h-34 z" fill="#8d8069"/>
      <path d="M160 38 l36 74 h-72 z" fill="#c0b295"/>
      <path d="M160 38 l36 74 h-36 z" fill="#a3977c"/>
      <path d="M200 46 l34 66 h-68 z" fill="#a89a80"/>
      <path d="M200 46 l34 66 h-34 z" fill="#8d8069"/>
      <rect x="150" y="36" width="20" height="5" rx="2.5" fill="#6f6650"/>
    </g>
  </g>`,
      "#a89a80",
    ),
  ),
};
