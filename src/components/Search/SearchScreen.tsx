import type { CSSProperties } from "react";
import type { Order, Product } from "../../api";
import type { Person } from "../People/people";
import { SEARCH_SCOPES, type MessageHit, type SearchScope } from "../../globalSearch";

type Props = {
  query: string;
  scope: SearchScope;
  onTabClick: (s: SearchScope) => void;
  people: Person[];
  products: Product[];
  orders: Order[];
  messages: MessageHit[];
  counts: Record<SearchScope, number>;
  money: (cents: number) => string;
  fmtTime: (ts: number) => string;
  initials: (label: string) => string;
  avatarTint: (seed: string) => CSSProperties;
  productPriceLabel: (p: Product) => string;
  onOpenMessage: (threadId: string) => void;
  onOpenPerson: (key: string) => void;
  onOpenProduct: (id: string) => void;
  onOpenOrder: (id: string) => void;
};

export function SearchScreen({
  query,
  scope,
  onTabClick,
  people,
  products,
  orders,
  messages,
  counts,
  money,
  fmtTime,
  initials,
  avatarTint,
  productPriceLabel,
  onOpenMessage,
  onOpenPerson,
  onOpenProduct,
  onOpenOrder,
}: Props) {
  const empty = !query.trim();

  return (
    <section className="thread-col wide">
      <header className="col-head">
        <div>
          <div>Search</div>
          <div className="col-head-sub">
            {empty
              ? "One search — pick Messages, People, Catalog, or Orders"
              : `Results for “${query.trim()}”`}
          </div>
        </div>
      </header>

      <div className="search-scopes" role="tablist" aria-label="Search in">
        {SEARCH_SCOPES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={scope === s.id}
            className={scope === s.id ? "chip active" : "chip"}
            onClick={() => onTabClick(s.id)}
          >
            {s.label}
            {!empty && <span className="search-scope-n">{counts[s.id]}</span>}
          </button>
        ))}
      </div>

      <div className="thread-list search-results">
        {empty && <p className="empty">Same matching as on each page, plus who that person is tied to.</p>}

        {!empty && scope === "messages" && messages.length === 0 && (
          <p className="empty">No messages from or mentioning that.</p>
        )}
        {scope === "messages" &&
          messages.map((h) => (
            <button
              key={h.key}
              type="button"
              className="thread-row p-3 gap-3"
              onClick={() => onOpenMessage(h.threadId)}
            >
              <span className="avatar-dot" style={avatarTint(h.threadId)} aria-hidden>
                {initials(h.title)}
              </span>
              <div className="thread-row-body">
                <div className="thread-row-top">
                  <span className="thread-name">{h.title}</span>
                  <span className="thread-time">{fmtTime(h.timestamp)}</span>
                </div>
                <div className="snippet">
                  {h.why} · {h.snippet}
                </div>
              </div>
            </button>
          ))}

        {!empty && scope === "people" && people.length === 0 && (
          <p className="empty">No one by that name or tied to it.</p>
        )}
        {scope === "people" &&
          people.map((p) => (
            <button
              key={p.key}
              type="button"
              className="thread-row p-3 gap-3"
              onClick={() => onOpenPerson(p.key)}
            >
              <span className="avatar-dot" style={avatarTint(p.key)} aria-hidden>
                {initials(p.name)}
              </span>
              <div className="thread-row-body">
                <div className="thread-row-top">
                  <span className="thread-name">{p.name}</span>
                  <span className="person-type">{p.type}</span>
                </div>
                <div className="snippet">
                  {p.subtitle}
                  {p.orderCount ? ` · ${p.orderCount} orders` : ""}
                </div>
              </div>
            </button>
          ))}

        {!empty && scope === "catalog" && products.length === 0 && (
          <p className="empty">No products matching that, or on their orders.</p>
        )}
        {scope === "catalog" &&
          products.map((p) => (
            <button
              key={p.id}
              type="button"
              className="thread-row p-3 gap-3"
              onClick={() => onOpenProduct(p.id)}
            >
              <span className="avatar-dot" aria-hidden>
                {initials(p.name)}
              </span>
              <div className="thread-row-body">
                <div className="thread-row-top">
                  <span className="thread-name">{p.name}</span>
                  <span className="thread-time">{productPriceLabel(p)}</span>
                </div>
                <div className="snippet">
                  {[p.sku, p.description].filter(Boolean).join(" · ")}
                </div>
              </div>
            </button>
          ))}

        {!empty && scope === "orders" && orders.length === 0 && (
          <p className="empty">No orders matching that, or belonging to them.</p>
        )}
        {scope === "orders" &&
          orders.map((o) => (
            <button
              key={o.id}
              type="button"
              className="thread-row p-3 gap-3"
              onClick={() => onOpenOrder(o.id)}
            >
              <span className="avatar-dot" style={avatarTint(o.thread_id)} aria-hidden>
                {initials(o.id)}
              </span>
              <div className="thread-row-body">
                <div className="thread-row-top">
                  <span className="thread-name">{o.lines.map((l) => l.name).join(", ") || o.id.slice(0, 8)}</span>
                  <span className="thread-time">{money(o.total_cents)}</span>
                </div>
                <div className="snippet">
                  {o.status} · {fmtTime(o.created_at)} · {o.id.slice(0, 8)}
                </div>
              </div>
            </button>
          ))}
      </div>
    </section>
  );
}
