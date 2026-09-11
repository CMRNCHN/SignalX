import { useState, useEffect, useMemo } from "react";
import {
  api,
  type SalesSummary,
  type CommerceAuditEvent,
  type ContactMeta,
  type GroupMeta,
  type Customer,
  type Order,
} from "../../api";
import type { Panel } from "../../App";
import { countsTowardRevenue } from "../../format";
import { WhyTip } from "../WhyTip";

type SalesScreenProps = {
  salesSummary: SalesSummary | null;
  commerceAudit: CommerceAuditEvent[];
  salesRange: "7" | "30" | "all";
  setSalesRange: (range: "7" | "30" | "all") => void;
  salesStatus: string;
  setSalesStatus: (status: string) => void;
  setSalesSummary: (summary: SalesSummary | null) => void;
  setCommerceAudit: (audit: CommerceAuditEvent[]) => void;
  contacts: ContactMeta[];
  groups: GroupMeta[];
  customers: Customer[];
  setStatus: (msg: string | null) => void;
  setPanel: (panel: Panel) => void;
  setSelectedId: (id: string) => void;
  setFocusOrderId?: (id: string) => void;
  threadTitle: (
    id: string,
    contacts: ContactMeta[],
    groups: GroupMeta[],
    customers: Customer[],
  ) => string;
  money: (cents: number) => string;
  fmtTime: (timestamp: number) => string;
  orderStatusTone: (status: string) => string;
};

const DAY = 24 * 60 * 60 * 1000;

type Bucket = { start: number; label: string; cents: number; count: number };

/** Revenue grouped into even time buckets across the visible range.
 *  Days while a range stays readable at one bar per day, weeks beyond that —
 *  180 one-pixel bars say less than 26 legible ones. */
function bucketRevenue(orders: Order[], range: "7" | "30" | "all"): Bucket[] {
  if (orders.length === 0) return [];
  const now = Date.now();
  const earliest = Math.min(...orders.map((o) => o.created_at));
  const spanDays =
    range === "7" ? 7 : range === "30" ? 30 : Math.max(7, Math.ceil((now - earliest) / DAY) + 1);
  const stepDays = spanDays > 45 ? 7 : 1;
  const count = Math.ceil(spanDays / stepDays);

  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const buckets: Bucket[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const start = endOfToday.getTime() - (i + 1) * stepDays * DAY + 1;
    buckets.push({
      start,
      label: new Date(start).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      cents: 0,
      count: 0,
    });
  }
  for (const o of orders) {
    if (!countsTowardRevenue(o.status)) continue;
    // Anything older than the first bucket lands in it rather than vanishing,
    // so the bars always add up to the headline revenue figure.
    let idx = buckets.findIndex(
      (b, i) => o.created_at < (buckets[i + 1]?.start ?? Infinity) && o.created_at >= b.start,
    );
    if (idx < 0) idx = o.created_at < buckets[0].start ? 0 : buckets.length - 1;
    buckets[idx].cents += o.total_cents;
    buckets[idx].count += 1;
  }
  return buckets;
}

export function SalesScreen({
  salesSummary,
  commerceAudit,
  salesRange,
  setSalesRange,
  salesStatus,
  setSalesStatus,
  setSalesSummary,
  setCommerceAudit,
  contacts,
  groups,
  customers,
  setStatus,
  setPanel,
  setSelectedId,
  setFocusOrderId,
  threadTitle,
  money,
  fmtTime,
  orderStatusTone,
}: SalesScreenProps) {
  const [localSalesBusy, setLocalSalesBusy] = useState(false);

  const refreshSales = async () => {
    setLocalSalesBusy(true);
    const now = Date.now();
    let sinceMs: number | null = null;
    if (salesRange === "7") sinceMs = now - 7 * DAY;
    else if (salesRange === "30") sinceMs = now - 30 * DAY;
    const [sum, auditRes] = await Promise.all([
      api.salesSummary({
        sinceMs,
        untilMs: null,
        status: salesStatus === "all" ? null : salesStatus,
      }),
      api.listCommerceAudit(80),
    ]);
    setLocalSalesBusy(false);
    if (sum.success) setSalesSummary(sum.data);
    else setStatus(sum.error);
    if (auditRes.success) setCommerceAudit(auditRes.data);
  };

  const duplicateAsDraft = async (id: string) => {
    const res = await api.duplicateOrderAsDraft(id);
    if (!res.success) {
      setStatus(res.error);
      return;
    }
    setStatus(`Draft ${res.data.id.slice(0, 8)} from ${id.slice(0, 8)}`);
    setSelectedId(res.data.thread_id);
    setFocusOrderId?.(res.data.id);
    setPanel("orders");
  };

  useEffect(() => {
    void refreshSales();
  }, [salesRange, salesStatus]);

  const orders = salesSummary?.orders ?? [];

  const buckets = useMemo(() => bucketRevenue(orders, salesRange), [orders, salesRange]);
  const peak = Math.max(1, ...buckets.map((b) => b.cents));

  const derived = useMemo(() => {
    const revenueOrders = orders.filter((o) => countsTowardRevenue(o.status));
    const avg = revenueOrders.length
      ? Math.round((salesSummary?.revenue_cents ?? 0) / revenueOrders.length)
      : 0;
    const outstanding = orders
      .filter((o) => ["confirmed", "invoiced"].includes(o.status.toLowerCase()))
      .reduce((sum, o) => sum + o.total_cents, 0);
    return { avg, outstanding };
  }, [salesSummary, orders]);

  const statusMax = Math.max(1, ...(salesSummary?.by_status ?? []).map((r) => r.total_cents));
  const productMax = Math.max(1, ...(salesSummary?.top_products ?? []).map((p) => p.revenue_cents));
  const rangeLabel =
    salesRange === "7" ? "last 7 days" : salesRange === "30" ? "last 30 days" : "all time";

  return (
    <section className="thread-col wide">
      <header className="col-head">
        Sales
        <span className="col-meta">
          {localSalesBusy
            ? "Loading…"
            : salesSummary
              ? `${salesSummary.order_count} orders · ${rangeLabel}`
              : ""}
        </span>
      </header>

      <div className="sales-scroll">
        <div className="filter-strip in-panel sales-filters">
          <select
            aria-label="Date range"
            value={salesRange}
            onChange={(e) => setSalesRange(e.target.value as "7" | "30" | "all")}
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="all">All time</option>
          </select>
          <select
            aria-label="Status filter"
            value={salesStatus}
            onChange={(e) => setSalesStatus(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="draft">draft</option>
            <option value="confirmed">confirmed</option>
            <option value="invoiced">invoiced</option>
            <option value="paid">paid</option>
            <option value="fulfilled">fulfilled</option>
            <option value="cancelled">cancelled</option>
          </select>
          <button type="button" className="ghost-btn" onClick={() => void refreshSales()}>
            Refresh
          </button>
        </div>

        {!salesSummary ? (
          <p className="hint">No sales data yet.</p>
        ) : (
          <div className="sales-layout">
            <div className="sales-main">
              <dl className="sales-metrics">
                <div>
                  <dt>Orders</dt>
                  <dd>{salesSummary.order_count}</dd>
                  <span className="sales-metric-foot">{rangeLabel}</span>
                </div>
                <div>
                  <dt>Revenue</dt>
                  <dd>{money(salesSummary.revenue_cents)}</dd>
                  <span className="sales-metric-foot">excluding draft and cancelled</span>
                </div>
                <div>
                  <dt>
                    Average order
                    <WhyTip why="Revenue divided by order count, over the range and statuses currently filtered." />
                  </dt>
                  <dd>{money(derived.avg)}</dd>
                  <span className="sales-metric-foot">
                    {salesSummary.order_count} order{salesSummary.order_count === 1 ? "" : "s"}
                  </span>
                </div>
                <div>
                  <dt>
                    Outstanding
                    <WhyTip why="Totals of orders sitting at confirmed or invoiced — committed but not yet marked paid." />
                  </dt>
                  <dd>{money(derived.outstanding)}</dd>
                  <span className="sales-metric-foot">awaiting payment</span>
                </div>
              </dl>

              <section className="sales-card">
                <header className="sales-card-head">
                  <h3>Revenue</h3>
                  <span className="sales-card-meta">peak {money(peak)}</span>
                </header>
                {buckets.length === 0 ? (
                  <p className="hint tight">No orders in this range.</p>
                ) : (
                  <div className="sales-chart">
                    <div className="sales-chart-grid" aria-hidden>
                      <span />
                      <span />
                      <span />
                      <span />
                    </div>
                    <div className="sales-bars">
                      {buckets.map((b) => {
                        const pct = (b.cents / peak) * 100;
                        return (
                          <div
                            key={b.start}
                            className={`sales-bar${b.cents === peak && peak > 0 ? " peak" : ""}`}
                            title={`${b.label} — ${money(b.cents)} from ${b.count} order${b.count === 1 ? "" : "s"}`}
                          >
                            <span
                              className="sales-bar-fill"
                              // A zero day still needs a visible baseline tick,
                              // or the chart reads as missing rather than empty.
                              style={{ height: `${b.cents > 0 ? Math.max(pct, 2) : 0}%` }}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="sales-axis">
                      {/* Selective labels only: the ends and the middle. */}
                      <span>{buckets[0].label}</span>
                      {buckets.length > 2 && (
                        <span>{buckets[Math.floor(buckets.length / 2)].label}</span>
                      )}
                      <span>{buckets[buckets.length - 1].label}</span>
                    </div>
                  </div>
                )}
              </section>

              <section className="sales-card">
                <header className="sales-card-head">
                  <h3>Top products</h3>
                  <span className="sales-card-meta">by revenue</span>
                </header>
                {salesSummary.top_products.length === 0 ? (
                  <p className="hint tight">No product lines in this range.</p>
                ) : (
                  <ul className="sales-ranked">
                    {salesSummary.top_products.map((p) => (
                      <li key={p.product_id}>
                        <span className="sales-ranked-label">{p.name}</span>
                        <span className="sales-ranked-track">
                          <span
                            className="sales-ranked-fill"
                            style={{ width: `${Math.max((p.revenue_cents / productMax) * 100, 1.5)}%` }}
                          />
                        </span>
                        <span className="sales-ranked-value">
                          {money(p.revenue_cents)}
                          <em>qty {p.quantity}</em>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="sales-card">
                <header className="sales-card-head">
                  <h3>Orders in range</h3>
                  <span className="sales-card-meta">
                    newest first{orders.length > 40 ? " · first 40" : ""}
                  </span>
                </header>
                {orders.length === 0 ? (
                  <p className="hint tight">No orders match these filters.</p>
                ) : (
                  <table className="sales-table">
                    <thead>
                      <tr>
                        <th scope="col">Person</th>
                        <th scope="col">Status</th>
                        <th scope="col">Date</th>
                        <th scope="col">Total</th>
                        <th scope="col">
                          <span className="visually-hidden">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...orders]
                        .sort((a, b) => b.created_at - a.created_at)
                        .slice(0, 40)
                        .map((o) => (
                          <tr key={o.id}>
                            <td>
                              <span className="thread-name">
                                {threadTitle(o.thread_id, contacts, groups, customers)}
                              </span>
                              <span className="order-id">{o.id.slice(0, 8)}</span>
                            </td>
                            <td>
                              <span className={`status-pill status-${orderStatusTone(o.status)}`}>
                                {o.status}
                              </span>
                            </td>
                            <td className="num dim">{fmtTime(o.created_at)}</td>
                            <td className="num strong">{money(o.total_cents)}</td>
                            <td className="sales-table-actions">
                              <button
                                type="button"
                                className="ghost-btn"
                                onClick={() => void duplicateAsDraft(o.id)}
                              >
                                Reorder
                              </button>
                              <button
                                type="button"
                                className="ghost-btn"
                                onClick={() => {
                                  setSelectedId(o.thread_id);
                                  setPanel("threads");
                                }}
                              >
                                Chat
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}
              </section>
            </div>

            <aside className="sales-side">
              <section className="sales-card">
                <header className="sales-card-head">
                  <h3>By status</h3>
                </header>
                {salesSummary.by_status.length === 0 ? (
                  <p className="hint tight">Nothing to break down yet.</p>
                ) : (
                  <ul className="sales-ranked compact">
                    {salesSummary.by_status.map((row) => (
                      <li key={row.status}>
                        <span className="sales-ranked-label">
                          <span className={`status-pill status-${orderStatusTone(row.status)}`}>
                            {row.status}
                          </span>
                        </span>
                        <span className="sales-ranked-track">
                          <span
                            className={`sales-ranked-fill tone-${orderStatusTone(row.status)}`}
                            style={{ width: `${Math.max((row.total_cents / statusMax) * 100, 1.5)}%` }}
                          />
                        </span>
                        <span className="sales-ranked-value">
                          {money(row.total_cents)}
                          <em>{row.count}×</em>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="sales-card">
                <header className="sales-card-head">
                  <h3>Commerce audit</h3>
                  <span className="sales-card-meta">{commerceAudit.length}</span>
                </header>
                {commerceAudit.length === 0 ? (
                  <p className="hint tight">No commerce audit events yet.</p>
                ) : (
                  <ul className="sales-audit">
                    {commerceAudit.slice(0, 30).map((e) => (
                      <li key={e.id}>
                        <span className="sales-audit-top">
                          <span className="thread-name">{e.kind}</span>
                          <span className="thread-time">{fmtTime(e.created_at)}</span>
                        </span>
                        <span className="convo-sub">{e.summary}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </aside>
          </div>
        )}
      </div>
    </section>
  );
}
