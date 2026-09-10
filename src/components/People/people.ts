import type { ContactMeta, Customer, GroupMeta, Order, ThreadSummary } from "../../api";
import { formatPhone, isGroupThread, stripThreadPrefix } from "../../format";

export type PersonType = "Consumer" | "Supplier" | "Team";
export type PersonStatus =
  | "Unread"
  | "Needs attention"
  | "Pending send"
  | "Auto-replied"
  | "Read";

export type Person = {
  key: string;
  threadId: string;
  kind: "contact" | "group";
  name: string;
  subtitle: string;
  type: PersonType;
  statuses: PersonStatus[];
  unreadCount: number;
  pendingCount: number;
  messageCount: number;
  lastActivity: number | null;
  tags: string[];
  orders: Order[];
  orderCount: number;
  lifetimeCents: number;
  openCents: number;
  favorite: boolean;
  muted: boolean;
  autoReply: boolean;
  notes: string;
  customerId: string | null;
};

const OPEN_STATUSES = new Set(["draft", "confirmed", "invoiced"]);

/** Thread ids are the bare contact id for DMs and may be prefixed for groups. */
function threadFor(threads: ThreadSummary[], id: string): ThreadSummary | undefined {
  const bare = stripThreadPrefix(id);
  return threads.find((t) => t.id === id || stripThreadPrefix(t.id) === bare);
}

function ordersFor(orders: Order[], id: string): Order[] {
  const bare = stripThreadPrefix(id);
  return orders
    .filter((o) => o.thread_id === id || stripThreadPrefix(o.thread_id) === bare)
    .sort((a, b) => b.created_at - a.created_at);
}

function statusesFor(p: {
  unreadCount: number;
  pendingCount: number;
  autoReply: boolean;
}): PersonStatus[] {
  const out: PersonStatus[] = [];
  if (p.unreadCount > 0) out.push("Unread");
  // Three or more unread with nothing queued back means nobody has replied yet.
  if (p.unreadCount >= 3 && p.pendingCount === 0) out.push("Needs attention");
  if (p.pendingCount > 0) out.push("Pending send");
  if (p.autoReply) out.push("Auto-replied");
  if (out.length === 0) out.push("Read");
  return out;
}

/** Collapses contacts, groups, customers, threads and orders into one directory
 *  row per person, so People is a record of who someone is rather than a
 *  second view of the thread list. */
export function buildDirectory(
  contacts: ContactMeta[],
  groups: GroupMeta[],
  customers: Customer[],
  threads: ThreadSummary[],
  orders: Order[],
): Person[] {
  const people: Person[] = [];

  for (const c of contacts) {
    const thread = threadFor(threads, c.contact_id);
    const mine = ordersFor(orders, c.contact_id);
    const customer = customers.find(
      (x) => stripThreadPrefix(x.thread_id) === stripThreadPrefix(c.contact_id),
    );
    const cats = c.categories || [];
    const type: PersonType = cats.includes("supplier") ? "Supplier" : "Consumer";
    const unreadCount = thread?.unread_count ?? 0;
    const pendingCount = thread?.outbox_count ?? 0;
    const autoReply = !!c.auto_reply_enabled;
    const lifetimeCents = mine
      .filter((o) => o.status !== "cancelled")
      .reduce((n, o) => n + o.total_cents, 0);

    people.push({
      key: c.contact_id,
      threadId: thread?.id ?? c.contact_id,
      kind: "contact",
      name: (c.display_name || c.alias || "").trim() || formatPhone(c.contact_id),
      subtitle: formatPhone(c.contact_id),
      type,
      statuses: statusesFor({ unreadCount, pendingCount, autoReply }),
      unreadCount,
      pendingCount,
      messageCount: thread?.message_count ?? 0,
      lastActivity: thread?.last_message_timestamp ?? c.updated_at ?? null,
      tags: [
        ...cats.filter((t) => t !== "supplier"),
        ...(c.favorite ? ["favorite"] : []),
        ...(c.muted ? ["muted"] : []),
      ],
      orders: mine,
      orderCount: mine.length,
      lifetimeCents,
      openCents: mine
        .filter((o) => OPEN_STATUSES.has(o.status))
        .reduce((n, o) => n + o.total_cents, 0),
      favorite: !!c.favorite,
      muted: !!c.muted,
      autoReply,
      notes: customer?.notes ?? "",
      customerId: customer?.id ?? null,
    });
  }

  for (const g of groups) {
    const thread = threadFor(threads, g.group_id);
    const mine = ordersFor(orders, g.group_id);
    const unreadCount = thread?.unread_count ?? 0;
    const pendingCount = thread?.outbox_count ?? 0;
    const autoReply = !!g.auto_reply_enabled;
    const members = thread?.participants?.length ?? 0;

    people.push({
      key: g.group_id,
      threadId: thread?.id ?? g.group_id,
      kind: "group",
      name: (g.display_name || "").trim() || "Unnamed group",
      subtitle: members ? `${members} member${members === 1 ? "" : "s"}` : "Group",
      type: "Team",
      statuses: statusesFor({ unreadCount, pendingCount, autoReply }),
      unreadCount,
      pendingCount,
      messageCount: thread?.message_count ?? 0,
      lastActivity: thread?.last_message_timestamp ?? g.updated_at ?? null,
      tags: [
        ...(g.categories || []),
        ...(g.favorite ? ["favorite"] : []),
        ...(g.muted ? ["muted"] : []),
      ],
      orders: mine,
      orderCount: mine.length,
      lifetimeCents: mine
        .filter((o) => o.status !== "cancelled")
        .reduce((n, o) => n + o.total_cents, 0),
      openCents: mine
        .filter((o) => OPEN_STATUSES.has(o.status))
        .reduce((n, o) => n + o.total_cents, 0),
      favorite: !!g.favorite,
      muted: !!g.muted,
      autoReply,
      notes: (g.notes || "").trim(),
      customerId: null,
    });
  }

  const seen = new Set(people.map((p) => stripThreadPrefix(p.threadId)));
  for (const c of customers) {
    const bare = stripThreadPrefix(c.thread_id);
    if (!bare || seen.has(bare) || isGroupThread(c.thread_id)) continue;
    seen.add(bare);
    const thread = threadFor(threads, c.thread_id);
    const mine = ordersFor(orders, c.thread_id);
    const unreadCount = thread?.unread_count ?? 0;
    const pendingCount = thread?.outbox_count ?? 0;
    people.push({
      key: c.thread_id,
      threadId: thread?.id ?? c.thread_id,
      kind: "contact",
      name: (c.display_name || "").trim() || formatPhone(c.thread_id),
      subtitle: formatPhone(c.thread_id),
      type: "Consumer",
      statuses: statusesFor({ unreadCount, pendingCount, autoReply: false }),
      unreadCount,
      pendingCount,
      messageCount: thread?.message_count ?? 0,
      lastActivity: thread?.last_message_timestamp ?? c.updated_at ?? null,
      tags: [],
      orders: mine,
      orderCount: mine.length,
      lifetimeCents: mine
        .filter((o) => o.status !== "cancelled")
        .reduce((n, o) => n + o.total_cents, 0),
      openCents: mine
        .filter((o) => OPEN_STATUSES.has(o.status))
        .reduce((n, o) => n + o.total_cents, 0),
      favorite: false,
      muted: false,
      autoReply: false,
      notes: c.notes ?? "",
      customerId: c.id,
    });
  }

  return people;
}

/** Observations computed from the record itself. This is the slot an LLM
 *  summary drops into once one is configured; until then it stays factual. */
export type Insight = { text: string; why: string };

export function insightsFor(p: Person, money: (c: number) => string): Insight[] {
  const out: Insight[] = [];

  if (p.unreadCount > 0) {
    out.push({
      text: `${p.unreadCount} unread message${p.unreadCount === 1 ? "" : "s"} waiting on a reply.`,
      why: "The unread count reported by the Signal thread. It clears when the thread is opened.",
    });
  }
  if (p.pendingCount > 0) {
    out.push({
      text: `${p.pendingCount} message${p.pendingCount === 1 ? "" : "s"} queued to send.`,
      why: "Messages sitting in the outbox for this chat that have not been delivered yet.",
    });
  }
  if (p.openCents > 0) {
    out.push({
      text: `${money(p.openCents)} outstanding across unpaid orders.`,
      why: "Sums orders in draft, confirmed or invoiced status. Paid, fulfilled and cancelled are excluded.",
    });
  }

  const settled = p.orders.filter((o) => o.status !== "cancelled");
  if (settled.length >= 2) {
    const times = settled.map((o) => o.created_at).sort((a, b) => a - b);
    let gap = 0;
    for (let i = 1; i < times.length; i += 1) gap += times[i] - times[i - 1];
    const avgDays = Math.round(gap / (times.length - 1) / 86_400_000);
    if (avgDays > 0) {
      out.push({
        text: `Orders roughly every ${avgDays} day${avgDays === 1 ? "" : "s"}.`,
        why: `Mean gap between their ${settled.length} non-cancelled orders. Needs at least two to compute.`,
      });
    }

    const last = times[times.length - 1];
    const since = Math.round((Date.now() - last) / 86_400_000);
    if (avgDays > 0 && since > avgDays * 2) {
      out.push({
        text: `Last ordered ${since} days ago — overdue against their usual pace.`,
        why: `Flagged once the gap passes twice their average — ${since} days against a ${avgDays}-day norm.`,
      });
    }
  }

  const counts = new Map<string, number>();
  for (const o of settled) {
    for (const l of o.lines) counts.set(l.name, (counts.get(l.name) ?? 0) + l.quantity);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top) {
    out.push({
      text: `Buys ${top[0]} most often.`,
      why: `Highest total quantity across their order lines — ${top[1]} units. Cancelled orders are ignored.`,
    });
  }

  if (p.autoReply) {
    out.push({
      text: "Auto-reply is armed for this chat.",
      why: "Auto-reply is enabled on this contact, so drafts can send without you when the account allows it.",
    });
  }
  if (p.muted) {
    out.push({
      text: "Muted — notifications are suppressed.",
      why: "Set on the contact record. Muting hides alerts but does not stop messages arriving.",
    });
  }

  return out;
}

export type PersonAction = {
  id: string;
  label: string;
  detail?: string;
  cta: string;
  target: "chat" | "orders" | "outbox";
  urgent: boolean;
  why: string;
};

const UNPAID = new Set(["confirmed", "invoiced"]);

/** What this person is waiting on, derived from their record. Every entry
 *  maps to somewhere the operator can actually go and finish the job. */
export function actionsFor(p: Person, money: (c: number) => string): PersonAction[] {
  const out: PersonAction[] = [];

  if (p.unreadCount > 0) {
    out.push({
      id: "unread",
      label: `Reply to ${p.unreadCount} unread message${p.unreadCount === 1 ? "" : "s"}`,
      detail: p.unreadCount >= 3 ? "Nothing has been sent back yet" : undefined,
      cta: "Open chat",
      target: "chat",
      urgent: p.unreadCount >= 3,
      why: `${p.unreadCount} unread with ${p.pendingCount === 0 ? "nothing" : `${p.pendingCount} message(s)`} queued back. Marked urgent at three or more unread and nothing queued.`,
    });
  }

  const drafts = p.orders.filter((o) => o.status === "draft");
  if (drafts.length > 0) {
    out.push({
      id: "drafts",
      label: `Confirm ${drafts.length} draft order${drafts.length === 1 ? "" : "s"}`,
      detail: drafts.map((o) => `${o.id.slice(0, 10)} · ${money(o.total_cents)}`).join(", "),
      cta: "Open orders",
      target: "orders",
      urgent: false,
      why: "Draft orders hold no stock and never reach an invoice until they are confirmed.",
    });
  }

  const unpaid = p.orders.filter((o) => UNPAID.has(o.status));
  if (unpaid.length > 0) {
    const total = unpaid.reduce((n, o) => n + o.total_cents, 0);
    out.push({
      id: "unpaid",
      label: `Collect ${money(total)} across ${unpaid.length} order${unpaid.length === 1 ? "" : "s"}`,
      detail: unpaid.some((o) => o.status === "confirmed")
        ? "Some are confirmed but not invoiced"
        : undefined,
      cta: "Open orders",
      target: "orders",
      urgent: total > 10_000,
      why: `Orders in confirmed or invoiced status. Marked urgent above ${money(10_000)}.`,
    });
  }

  if (p.pendingCount > 0) {
    out.push({
      id: "queued",
      label: `${p.pendingCount} message${p.pendingCount === 1 ? "" : "s"} queued to send`,
      cta: "Open outbox",
      target: "outbox",
      urgent: false,
      why: "Queued or failed sends for this chat, taken from the thread's outbox count.",
    });
  }

  const settled = p.orders.filter((o) => o.status !== "cancelled");
  if (settled.length >= 2) {
    const times = settled.map((o) => o.created_at).sort((a, b) => a - b);
    let gap = 0;
    for (let i = 1; i < times.length; i += 1) gap += times[i] - times[i - 1];
    const avgDays = gap / (times.length - 1) / 86_400_000;
    const sinceDays = (Date.now() - times[times.length - 1]) / 86_400_000;
    if (avgDays > 0 && sinceDays > avgDays * 2) {
      out.push({
        id: "lapsed",
        label: "Check in — they're overdue to reorder",
        detail: `Last ordered ${Math.round(sinceDays)} days ago, usually every ${Math.round(avgDays)}`,
        cta: "Open chat",
        target: "chat",
        urgent: false,
        why: `Their average gap is ${Math.round(avgDays)} days and it has been ${Math.round(sinceDays)}. Flagged past twice the average.`,
      });
    }
  }

  return out;
}
