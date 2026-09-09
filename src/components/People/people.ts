import type { ContactMeta, Customer, GroupMeta, Order, ThreadSummary } from "../../api";
import { formatPhone } from "../../format";

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
  const bare = id.replace(/^(dm:|group:)/, "");
  return threads.find((t) => t.id === id || t.id.replace(/^(dm:|group:)/, "") === bare);
}

function ordersFor(orders: Order[], id: string): Order[] {
  const bare = id.replace(/^(dm:|group:)/, "");
  return orders
    .filter((o) => o.thread_id === id || o.thread_id.replace(/^(dm:|group:)/, "") === bare)
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
      (x) => x.thread_id.replace(/^(dm:|group:)/, "") === c.contact_id.replace(/^(dm:|group:)/, ""),
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
      name: (g.display_name || "").trim() || g.group_id,
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
      notes: "",
      customerId: null,
    });
  }

  return people;
}

/** Observations computed from the record itself. This is the slot an LLM
 *  summary drops into once one is configured; until then it stays factual. */
export function insightsFor(p: Person, money: (c: number) => string): string[] {
  const out: string[] = [];

  if (p.unreadCount > 0) {
    out.push(
      `${p.unreadCount} unread message${p.unreadCount === 1 ? "" : "s"} waiting on a reply.`,
    );
  }
  if (p.pendingCount > 0) {
    out.push(`${p.pendingCount} message${p.pendingCount === 1 ? "" : "s"} queued to send.`);
  }
  if (p.openCents > 0) {
    out.push(`${money(p.openCents)} outstanding across unpaid orders.`);
  }

  const settled = p.orders.filter((o) => o.status !== "cancelled");
  if (settled.length >= 2) {
    const times = settled.map((o) => o.created_at).sort((a, b) => a - b);
    let gap = 0;
    for (let i = 1; i < times.length; i += 1) gap += times[i] - times[i - 1];
    const avgDays = Math.round(gap / (times.length - 1) / 86_400_000);
    if (avgDays > 0) out.push(`Orders roughly every ${avgDays} day${avgDays === 1 ? "" : "s"}.`);

    const last = times[times.length - 1];
    const since = Math.round((Date.now() - last) / 86_400_000);
    if (avgDays > 0 && since > avgDays * 2) {
      out.push(`Last ordered ${since} days ago — overdue against their usual pace.`);
    }
  }

  const counts = new Map<string, number>();
  for (const o of settled) {
    for (const l of o.lines) counts.set(l.name, (counts.get(l.name) ?? 0) + l.quantity);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top) out.push(`Buys ${top[0]} most often.`);

  if (p.autoReply) out.push("Auto-reply is armed for this chat.");
  if (p.muted) out.push("Muted — notifications are suppressed.");

  return out;
}

export type PersonAction = {
  id: string;
  label: string;
  detail?: string;
  cta: string;
  target: "chat" | "orders" | "outbox";
  urgent: boolean;
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
    });
  }

  if (p.pendingCount > 0) {
    out.push({
      id: "queued",
      label: `${p.pendingCount} message${p.pendingCount === 1 ? "" : "s"} queued to send`,
      cta: "Open outbox",
      target: "outbox",
      urgent: false,
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
      });
    }
  }

  return out;
}
