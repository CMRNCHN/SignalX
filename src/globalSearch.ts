import type { Message, Order, Product, SearchResult } from "./api";
import type { Person } from "./components/People/people";
import { stripThreadPrefix } from "./format";

export type SearchScope = "messages" | "people" | "catalog" | "orders";

export const SEARCH_SCOPES: { id: SearchScope; label: string }[] = [
  { id: "messages", label: "Messages" },
  { id: "people", label: "People" },
  { id: "catalog", label: "Catalog" },
  { id: "orders", label: "Orders" },
];

export type MessageHit = {
  key: string;
  threadId: string;
  timestamp: number;
  snippet: string;
  title: string;
  why: string;
};

function needle(q: string): string {
  return q.trim().toLowerCase();
}

function has(hay: string, q: string): boolean {
  const n = needle(q);
  if (!n) return false;
  return hay.toLowerCase().includes(n);
}

/** Same fields as People directory search, plus thread id. */
export function personHaystack(p: Person): string {
  return `${p.name} ${p.subtitle} ${p.tags.join(" ")} ${p.notes} ${p.key} ${p.threadId}`;
}

export function personMatchesDirect(p: Person, q: string): boolean {
  return has(personHaystack(p), q);
}

export function sameThread(a: string, b: string): boolean {
  return a === b || stripThreadPrefix(a) === stripThreadPrefix(b);
}

function personForThread(people: Person[], threadId: string): Person | undefined {
  return people.find(
    (p) => sameThread(p.threadId, threadId) || sameThread(p.key, threadId),
  );
}

/** People named in the query, plus anyone tied by a matching message or order. */
export function matchingPeople(
  people: Person[],
  q: string,
  messages: Message[],
  orders: Order[],
): Person[] {
  if (!needle(q)) return [];
  const direct = people.filter((p) => personMatchesDirect(p, q));
  const keys = new Set(direct.map((p) => p.key));
  const threadIds = new Set(direct.flatMap((p) => [p.threadId, p.key]));

  for (const m of messages) {
    if (!has(`${m.content} ${m.sender} ${m.thread_id}`, q)) continue;
    const p = personForThread(people, m.thread_id);
    if (p && !keys.has(p.key)) {
      keys.add(p.key);
      direct.push(p);
      threadIds.add(p.threadId);
      threadIds.add(p.key);
    }
  }

  for (const o of orders) {
    const lines = o.lines.map((l) => l.name).join(" ");
    const partyHit = [...threadIds].some((id) => sameThread(id, o.thread_id));
    const textHit = has(`${o.id} ${o.status} ${lines} ${o.thread_id}`, q);
    if (!partyHit && !textHit) continue;
    const p = personForThread(people, o.thread_id);
    if (p && !keys.has(p.key)) {
      keys.add(p.key);
      direct.push(p);
    }
  }

  return direct.sort((a, b) => a.name.localeCompare(b.name));
}

function orderHay(o: Order, party: string): string {
  return `${party} ${o.id} ${o.status} ${o.lines.map((l) => l.name).join(" ")} ${o.thread_id}`;
}

/** Same as the Orders page filter, plus tickets belonging to matching people. */
export function matchingOrders(
  orders: Order[],
  q: string,
  people: Person[],
  messages: Message[],
  partyOf: (threadId: string) => string,
): Order[] {
  if (!needle(q)) return [];
  const folks = matchingPeople(people, q, messages, orders);
  const threads = new Set(folks.flatMap((p) => [p.threadId, p.key]));
  return [...orders]
    .filter((o) => {
      if (has(orderHay(o, partyOf(o.thread_id)), q)) return true;
      return [...threads].some((id) => sameThread(id, o.thread_id));
    })
    .sort((a, b) => b.created_at - a.created_at);
}

function productHay(p: Product): string {
  return `${p.name} ${p.sku} ${p.description} ${p.unit} ${p.supplier ?? ""}`;
}

/** Same as Catalog type-ahead, plus SKUs on matching people's orders. */
export function matchingProducts(
  products: Product[],
  q: string,
  people: Person[],
  orders: Order[],
  messages: Message[],
): Product[] {
  if (!needle(q)) return [];
  const folks = matchingPeople(people, q, messages, orders);
  const threads = new Set(folks.flatMap((p) => [p.threadId, p.key]));
  const fromOrders = new Set<string>();
  for (const o of orders) {
    const tied = [...threads].some((id) => sameThread(id, o.thread_id));
    if (!tied && !has(orderHay(o, ""), q)) continue;
    for (const line of o.lines) {
      if (line.product_id) fromOrders.add(line.product_id);
    }
  }
  return products.filter((p) => has(productHay(p), q) || fromOrders.has(p.id));
}

export function matchingMessages(
  q: string,
  people: Person[],
  messages: Message[],
  apiHits: SearchResult[],
  partyOf: (threadId: string) => string,
): MessageHit[] {
  if (!needle(q)) return [];
  const folks = matchingPeople(people, q, messages, []);
  const namedThreads = new Set(folks.filter((p) => personMatchesDirect(p, q)).flatMap((p) => [p.threadId, p.key]));

  const hits: MessageHit[] = [];
  const seen = new Set<string>();

  const push = (
    threadId: string,
    timestamp: number,
    snippet: string,
    why: string,
    key: string,
  ) => {
    if (seen.has(key)) return;
    seen.add(key);
    hits.push({ key, threadId, timestamp, snippet, why, title: partyOf(threadId) });
  };

  for (const h of apiHits) {
    const title = partyOf(h.thread_id);
    const matchText = has(`${h.snippet} ${h.sender} ${h.thread_id} ${title}`, q);
    const matchPerson = [...namedThreads].some((id) => sameThread(id, h.thread_id));
    if (!matchText && !matchPerson) continue;
    push(
      h.thread_id,
      h.timestamp,
      h.snippet,
      matchPerson && !has(h.snippet, q) ? `From ${title}` : "Mentions query",
      `hit-${h.thread_id}-${h.message_id}`,
    );
  }

  for (const m of messages) {
    const title = partyOf(m.thread_id);
    const matchText = has(`${m.content} ${m.sender} ${m.thread_id} ${title}`, q);
    const matchPerson = [...namedThreads].some((id) => sameThread(id, m.thread_id));
    if (!matchText && !matchPerson) continue;
    push(
      m.thread_id,
      m.timestamp,
      m.content,
      matchPerson && !has(m.content, q) ? `From ${title}` : "Mentions query",
      `msg-${m.id}`,
    );
  }

  return hits.sort((a, b) => b.timestamp - a.timestamp);
}
