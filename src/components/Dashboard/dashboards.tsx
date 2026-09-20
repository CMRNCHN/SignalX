import type { ContactMeta, GroupMeta, Order, OutboxSummary, Product, ThreadSummary } from "../../api";
import { countsTowardRevenue } from "../../format";
import { isLowStock, isOutOfStock } from "../Catalog/catalog";
import { actionsFor, type Person } from "../People/people";
import type { DashboardCard, DashboardShortcut, DashboardStat } from "./PageDashboard";
import {
  IconAutoReplyOn,
  IconBestSeller,
  IconDueToReorder,
  IconFulfilled,
  IconHaventHeard,
  IconLowStock,
  IconNeedsFollowup,
  IconNeedsReply,
  IconNewCustomer,
  IconOpenOrders,
  IconOutOfStock,
  IconPendingInvoice,
  IconQueued,
  IconRevenue,
  IconTotalProducts,
  IconUnread,
} from "./dashboardIcons";

const DAY_MS = 86_400_000;
const daysSince = (ts: number) => Math.floor((Date.now() - ts) / DAY_MS);

export type DashboardData = {
  title: string;
  subtitle: string;
  sectionLabel: string;
  stats: DashboardStat[];
  cards: DashboardCard[];
  shortcuts: DashboardShortcut[];
};

/* ---------------------------------------------------------------- Messages */

export function messagesDashboard(
  threads: ThreadSummary[],
  outboxSummary: OutboxSummary | null,
  contacts: ContactMeta[],
  groups: GroupMeta[],
  actions: {
    openThread: (id: string) => void;
    goOutbox: () => void;
    goNewMessage: () => void;
  },
): DashboardData {
  const unreadTotal = threads.reduce((n, t) => n + t.unread_count, 0);
  const needsReply = threads.filter((t) => t.unread_count > 0);
  const queued = outboxSummary ? outboxSummary.queued + outboxSummary.sending : 0;
  const autoReplyOn =
    contacts.filter((c) => c.auto_reply_enabled).length +
    groups.filter((g) => g.auto_reply_enabled).length;

  const oldestUnanswered = needsReply
    .slice()
    .sort((a, b) => a.last_message_timestamp - b.last_message_timestamp)[0];

  const stats: DashboardStat[] = [
    {
      key: "unread",
      icon: <IconUnread />,
      label: "Unread",
      value: String(unreadTotal),
      detail: `across ${needsReply.length} thread${needsReply.length === 1 ? "" : "s"}`,
    },
    {
      key: "needs-reply",
      icon: <IconNeedsReply />,
      label: "Needs reply",
      value: String(needsReply.length),
      urgent: !!oldestUnanswered && daysSince(oldestUnanswered.last_message_timestamp) >= 1,
      detail: oldestUnanswered
        ? `oldest ${Math.max(1, daysSince(oldestUnanswered.last_message_timestamp))}d`
        : undefined,
    },
    {
      key: "queued",
      icon: <IconQueued />,
      label: "Queued",
      value: String(queued),
      detail: "not yet sent",
    },
    {
      key: "auto-reply",
      icon: <IconAutoReplyOn />,
      label: "Auto-reply on",
      value: String(autoReplyOn),
      detail: "threads on autopilot",
    },
  ];

  const cards: DashboardCard[] = [];
  if (oldestUnanswered) {
    const days = daysSince(oldestUnanswered.last_message_timestamp);
    cards.push({
      key: "oldest-unanswered",
      kicker: days >= 1 ? "Unanswered" : "Needs a reply",
      title: oldestUnanswered.participants[0] ?? oldestUnanswered.id,
      body: `${oldestUnanswered.unread_count} unread, ${
        days >= 1 ? `waiting ${days} day${days === 1 ? "" : "s"}` : "just came in"
      }.`,
      urgent: days >= 1,
      primary: { label: "Open thread", onClick: () => actions.openThread(oldestUnanswered.id) },
    });
  }
  if (outboxSummary && outboxSummary.failed > 0) {
    cards.push({
      key: "outbox-failed",
      kicker: "Delivery failed",
      title: `${outboxSummary.failed} message${outboxSummary.failed === 1 ? "" : "s"} failed to send`,
      body: "Check the connection or the recipient — these will not retry on their own.",
      urgent: true,
      primary: { label: "Review outbox", onClick: actions.goOutbox },
    });
  } else if (queued > 0) {
    cards.push({
      key: "outbox-queued",
      kicker: "Sending",
      title: `${queued} message${queued === 1 ? "" : "s"} in the outbox`,
      body: "Queued or in progress — nothing needs attention unless it stalls.",
      secondary: { label: "Review outbox", onClick: actions.goOutbox },
    });
  }

  return {
    title: "Messages",
    subtitle: `${threads.length} thread${threads.length === 1 ? "" : "s"} · updated just now`,
    sectionLabel: "Worth a look",
    stats,
    cards,
    shortcuts: [
      { key: "new", label: "＋ New message", onClick: actions.goNewMessage, primary: true },
      ...(oldestUnanswered
        ? [{ key: "oldest", label: "Open oldest unread", onClick: () => actions.openThread(oldestUnanswered.id) }]
        : []),
    ],
  };
}

/* ----------------------------------------------------------------- Catalog */

export function catalogDashboard(
  products: Product[],
  orders: Order[],
  actions: {
    openProduct: (id: string) => void;
    goAddProduct: () => void;
    goLowStockList: () => void;
  },
): DashboardData {
  const outOfStock = products.filter(isOutOfStock);
  const lowStock = products.filter((p) => isLowStock(p) && !isOutOfStock(p));

  const soldQty = new Map<string, number>();
  const soldQty30d = new Map<string, number>();
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    const within30 = daysSince(o.created_at) <= 30;
    for (const l of o.lines) {
      soldQty.set(l.product_id, (soldQty.get(l.product_id) ?? 0) + l.quantity);
      if (within30) soldQty30d.set(l.product_id, (soldQty30d.get(l.product_id) ?? 0) + l.quantity);
    }
  }
  const bestSeller = [...soldQty.entries()].sort((a, b) => b[1] - a[1])[0];
  const bestSellerProduct = bestSeller ? products.find((p) => p.id === bestSeller[0]) : undefined;

  const slowMovers = products.filter(
    (p) => !isOutOfStock(p) && (p.quantity_in_stock ?? 0) > 0 && !soldQty30d.has(p.id),
  );

  const stats: DashboardStat[] = [
    {
      key: "low-stock",
      icon: <IconLowStock />,
      label: "Low stock",
      value: String(lowStock.length),
      detail: "below reorder line",
      urgent: lowStock.length > 0,
      onClick: actions.goLowStockList,
    },
    {
      key: "best-seller",
      icon: <IconBestSeller />,
      label: "Best seller",
      value: bestSellerProduct?.name ?? "—",
      detail: bestSeller ? `${bestSeller[1]} sold` : "no sales yet",
    },
    {
      key: "out-of-stock",
      icon: <IconOutOfStock />,
      label: "Out of stock",
      value: String(outOfStock.length),
      urgent: outOfStock.length > 0,
    },
    {
      key: "total",
      icon: <IconTotalProducts />,
      label: "Total products",
      value: String(products.length),
    },
  ];

  const cards: DashboardCard[] = [];
  for (const p of lowStock.slice(0, 2)) {
    cards.push({
      key: `low-${p.id}`,
      icon: <IconLowStock />,
      kicker: "Reorder soon",
      title: p.name,
      body: `${p.quantity_in_stock} ${p.stock_unit} left — at or below the ${p.low_stock_threshold_milli / 1000}${p.base_unit} threshold.`,
      urgent: true,
      primary: { label: "View product", onClick: () => actions.openProduct(p.id) },
    });
  }
  for (const p of outOfStock.slice(0, 1)) {
    cards.push({
      key: `oos-${p.id}`,
      icon: <IconOutOfStock />,
      kicker: "Out of stock",
      title: p.name,
      body: "Sold out — orders for this item can't be fulfilled until it's restocked.",
      urgent: true,
      primary: { label: "View product", onClick: () => actions.openProduct(p.id) },
    });
  }
  for (const p of slowMovers.slice(0, 1)) {
    cards.push({
      key: `slow-${p.id}`,
      icon: <IconBestSeller />,
      kicker: "Slow mover",
      title: p.name,
      body: `No sales in 30+ days despite ${p.quantity_in_stock} ${p.stock_unit} in stock.`,
      secondary: { label: "View product", onClick: () => actions.openProduct(p.id) },
    });
  }

  return {
    title: "Catalog",
    subtitle: `${products.length} product${products.length === 1 ? "" : "s"} · updated just now`,
    sectionLabel: "Worth a look",
    stats,
    cards,
    shortcuts: [
      { key: "add", label: "＋ Add product", onClick: actions.goAddProduct, primary: true },
      ...(lowStock.length > 0
        ? [{ key: "low", label: `Review low stock (${lowStock.length})`, onClick: actions.goLowStockList }]
        : []),
    ],
  };
}

/* ------------------------------------------------------------------ Orders */

const OPEN_STATUSES = new Set(["draft", "confirmed", "invoiced"]);

export function ordersDashboard(
  orders: Order[],
  money: (cents: number) => string,
  actions: {
    openOrder: (id: string) => void;
    goNewOrder: () => void;
    goUnpaidList: () => void;
  },
): DashboardData {
  const open = orders.filter((o) => OPEN_STATUSES.has(o.status));
  const invoiced = orders.filter((o) => o.status === "invoiced");
  const invoicedTotal = invoiced.reduce((n, o) => n + o.total_cents, 0);
  const oldestInvoiced = invoiced.slice().sort((a, b) => a.created_at - b.created_at)[0];

  const fulfilledThisWeek = orders.filter((o) => o.status === "fulfilled" && daysSince(o.updated_at) <= 7);

  const revenueThisWeek = orders
    .filter((o) => countsTowardRevenue(o.status) && daysSince(o.created_at) <= 7)
    .reduce((n, o) => n + o.total_cents, 0);
  const revenuePrevWeek = orders
    .filter((o) => {
      const d = daysSince(o.created_at);
      return countsTowardRevenue(o.status) && d > 7 && d <= 14;
    })
    .reduce((n, o) => n + o.total_cents, 0);
  const revenueChange =
    revenuePrevWeek > 0 ? Math.round(((revenueThisWeek - revenuePrevWeek) / revenuePrevWeek) * 100) : null;

  const stats: DashboardStat[] = [
    {
      key: "open",
      icon: <IconOpenOrders />,
      label: "Open orders",
      value: String(open.length),
      detail: "not yet fulfilled",
    },
    {
      key: "pending-invoice",
      icon: <IconPendingInvoice />,
      label: "Pending invoice",
      value: String(invoiced.length),
      detail: invoiced.length > 0 ? `${money(invoicedTotal)} total` : undefined,
      urgent: !!oldestInvoiced && daysSince(oldestInvoiced.created_at) >= 5,
      onClick: actions.goUnpaidList,
    },
    {
      key: "fulfilled",
      icon: <IconFulfilled />,
      label: "Fulfilled",
      value: String(fulfilledThisWeek.length),
      detail: "this week",
    },
    {
      key: "revenue",
      icon: <IconRevenue />,
      label: "Revenue",
      value: money(revenueThisWeek),
      detail:
        revenueChange === null
          ? "this week"
          : `${revenueChange >= 0 ? "+" : ""}${revenueChange}% vs last week`,
    },
  ];

  const cards: DashboardCard[] = [];
  if (oldestInvoiced) {
    const days = daysSince(oldestInvoiced.created_at);
    cards.push({
      key: `invoiced-${oldestInvoiced.id}`,
      icon: <IconPendingInvoice />,
      kicker: days >= 5 ? `${days} days overdue` : "Pending invoice",
      title: `Order ${oldestInvoiced.id.slice(0, 10)}`,
      body: `Invoiced ${days} day${days === 1 ? "" : "s"} ago for ${money(oldestInvoiced.total_cents)} — still unpaid.`,
      urgent: days >= 5,
      primary: { label: "Open order", onClick: () => actions.openOrder(oldestInvoiced.id) },
    });
  }

  return {
    title: "Orders",
    subtitle: `${open.length} open · updated just now`,
    sectionLabel: "Worth a look",
    stats,
    cards,
    shortcuts: [
      { key: "new", label: "＋ New order", onClick: actions.goNewOrder, primary: true },
      ...(invoiced.length > 0
        ? [{ key: "unpaid", label: `Send overdue invoices (${invoiced.length})`, onClick: actions.goUnpaidList }]
        : []),
    ],
  };
}

/* ------------------------------------------------------------------ People */

export function peopleDashboard(
  directory: Person[],
  money: (cents: number) => string,
  actions: {
    openPerson: (key: string) => void;
    openChat: (threadId: string) => void;
    goAddPerson: () => void;
    goHaventHeardList: () => void;
  },
): DashboardData {
  const earliestOrder = (p: Person) =>
    p.orders.length ? Math.min(...p.orders.map((o) => o.created_at)) : null;

  const newThisWeek = directory.filter((p) => {
    const first = earliestOrder(p);
    return first !== null && daysSince(first) <= 7;
  });
  const haventHeard = directory.filter(
    (p) => p.lastActivity !== null && daysSince(p.lastActivity) >= 14 && (p.orderCount > 0 || p.messageCount > 0),
  );
  const withActions = directory
    .map((p) => ({ p, actions: actionsFor(p, money) }))
    .filter((x) => x.actions.length > 0);
  const dueToReorder = withActions.filter((x) => x.actions.some((a) => a.id === "lapsed"));
  const needsFollowup = directory.filter(
    (p) => p.orderCount === 1 && p.lastActivity !== null && daysSince(p.lastActivity) > 3,
  );

  const stats: DashboardStat[] = [
    {
      key: "new",
      icon: <IconNewCustomer />,
      label: "New this week",
      value: String(newThisWeek.length),
      detail: newThisWeek
        .slice(0, 2)
        .map((p) => p.name)
        .join(", ") || undefined,
    },
    {
      key: "quiet",
      icon: <IconHaventHeard />,
      label: "Haven't heard",
      value: String(haventHeard.length),
      detail: "no activity 14+ days",
      onClick: actions.goHaventHeardList,
    },
    {
      key: "reorder",
      icon: <IconDueToReorder />,
      label: "Due to reorder",
      value: String(dueToReorder.length),
      detail: "past their usual pace",
    },
    {
      key: "followup",
      icon: <IconNeedsFollowup />,
      label: "Needs follow-up",
      value: String(needsFollowup.length),
      detail: "first order, no check-in",
    },
  ];

  const cards: DashboardCard[] = [];
  for (const { p, actions: acts } of dueToReorder.slice(0, 1)) {
    const a = acts.find((x) => x.id === "lapsed")!;
    cards.push({
      key: `reorder-${p.key}`,
      avatarLabel: p.name.slice(0, 2).toUpperCase(),
      kicker: "Order pattern",
      title: p.name,
      body: a.detail ?? a.label,
      why: a.why,
      primary: { label: "Open chat", onClick: () => actions.openChat(p.threadId) },
    });
  }
  for (const p of needsFollowup.slice(0, 1)) {
    cards.push({
      key: `followup-${p.key}`,
      avatarLabel: p.name.slice(0, 2).toUpperCase(),
      kicker: "New customer",
      title: p.name,
      body: `First order placed, no check-in sent since — it's been ${daysSince(p.lastActivity!)} days.`,
      primary: { label: "Open chat", onClick: () => actions.openChat(p.threadId) },
    });
  }
  for (const { p, actions: acts } of withActions
    .filter((x) => x.actions.some((a) => a.urgent) && !dueToReorder.includes(x))
    .slice(0, 1)) {
    const a = acts.find((x) => x.urgent)!;
    cards.push({
      key: `urgent-${p.key}`,
      avatarLabel: p.name.slice(0, 2).toUpperCase(),
      kicker: "Needs attention",
      title: p.name,
      body: a.detail ?? a.label,
      why: a.why,
      urgent: true,
      primary: {
        label: a.target === "orders" ? "Open orders" : a.target === "outbox" ? "Open outbox" : "Open chat",
        onClick: () => (a.target === "chat" ? actions.openChat(p.threadId) : actions.openPerson(p.key)),
      },
    });
  }

  return {
    title: "People",
    subtitle: `${directory.length} people · updated just now`,
    sectionLabel: "Patterns worth knowing",
    stats,
    cards,
    shortcuts: [
      { key: "add", label: "＋ Add person", onClick: actions.goAddPerson, primary: true },
      ...(haventHeard.length > 0
        ? [
            {
              key: "quiet",
              label: `Review haven't-heard-from (${haventHeard.length})`,
              onClick: actions.goHaventHeardList,
            },
          ]
        : []),
    ],
  };
}

/* -------------------------------------------------------------------- Home */

/** Consolidates the four page dashboards into one landing view: the single
 *  most-telling stat from each page, plus each page's top card if it has
 *  one. Pages themselves no longer have a separate dashboard-first screen —
 *  this is the one place that view lives now. */
export function homeDashboard(
  pages: {
    messages: DashboardData;
    catalog: DashboardData;
    orders: DashboardData;
    people: DashboardData;
  },
  nav: {
    goMessages: () => void;
    goCatalog: () => void;
    goOrders: () => void;
    goPeople: () => void;
  },
): DashboardData {
  const pick = (d: DashboardData, key: string, onClick: () => void): DashboardStat | null => {
    const s = d.stats.find((x) => x.urgent) ?? d.stats[0];
    return s ? { ...s, key, onClick } : null;
  };

  const stats = [
    pick(pages.messages, "home-messages", nav.goMessages),
    pick(pages.catalog, "home-catalog", nav.goCatalog),
    pick(pages.orders, "home-orders", nav.goOrders),
    pick(pages.people, "home-people", nav.goPeople),
  ].filter((s): s is DashboardStat => s !== null);

  const cards = [
    pages.messages.cards[0],
    pages.catalog.cards[0],
    pages.orders.cards[0],
    pages.people.cards[0],
  ].filter((c): c is DashboardCard => c !== undefined);

  return {
    title: "SignalX",
    subtitle: "Today across Messages, Catalog, Orders and People",
    sectionLabel: "Worth a look",
    stats,
    cards,
    shortcuts: [
      { key: "messages", label: "Messages", onClick: nav.goMessages, primary: true },
      { key: "catalog", label: "Catalog", onClick: nav.goCatalog },
      { key: "orders", label: "Orders", onClick: nav.goOrders },
      { key: "people", label: "People", onClick: nav.goPeople },
    ],
  };
}
