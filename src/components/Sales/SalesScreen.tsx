import { useState, useEffect } from "react";
import {
  api,
  type SalesSummary,
  type CommerceAuditEvent,
  type ContactMeta,
  type GroupMeta,
  type Customer,
} from "../../api";
import type { Panel } from "../../App";

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
  threadTitle: (id: string, contacts: ContactMeta[], groups: GroupMeta[], customers: Customer[]) => string;
  money: (cents: number) => string;
  fmtTime: (timestamp: number) => string;
  orderStatusTone: (status: string) => string;
};

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
    if (salesRange === "7") sinceMs = now - 7 * 24 * 60 * 60 * 1000;
    else if (salesRange === "30") sinceMs = now - 30 * 24 * 60 * 60 * 1000;
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
    setPanel("orders");
  };

  useEffect(() => {
    void refreshSales();
  }, [salesRange, salesStatus]);

  return (
    <section className="thread-col wide">
      <header className="col-head">
        Sales
        <span className="col-meta">
          {localSalesBusy ? "Loading…" : salesSummary ? `${salesSummary.order_count} orders` : ""}
        </span>
      </header>
      <div className="settings-body wide-body">
        <div className="filter-strip in-panel">
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

        {salesSummary && (
          <div className="sales-summary">
            <div className="sales-totals">
              <div>
                <span className="field-label">Orders</span>
                <strong>{salesSummary.order_count}</strong>
              </div>
              <div>
                <span className="field-label">Revenue</span>
                <strong>{money(salesSummary.revenue_cents)}</strong>
              </div>
            </div>
            {salesSummary.by_status.length > 0 && (
              <div className="sales-by-status">
                {salesSummary.by_status.map((row) => (
                  <span key={row.status} className="badge muted">
                    {row.status}: {row.count} · {money(row.total_cents)}
                  </span>
                ))}
              </div>
            )}
            <h3 className="form-card-title">Top products</h3>
            {salesSummary.top_products.length === 0 ? (
              <p className="hint tight">No product lines in this range.</p>
            ) : (
              <ul className="sales-top-list">
                {salesSummary.top_products.map((p) => (
                  <li key={p.product_id}>
                    <span className="thread-name">{p.name}</span>
                    <span className="convo-sub">
                      qty {p.quantity} · {money(p.revenue_cents)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <h3 className="form-card-title">Orders in range</h3>
            <div className="thread-list">
              {salesSummary.orders.length === 0 && (
                <p className="hint">No orders match these filters.</p>
              )}
              {[...salesSummary.orders]
                .sort((a, b) => b.created_at - a.created_at)
                .slice(0, 40)
                .map((o) => (
                  <div key={o.id} className="thread-row product-row">
                    <div className="thread-row-top">
                      <span className="thread-name">
                        {threadTitle(o.thread_id, contacts, groups, customers)}
                        <span className="order-id"> · {o.id.slice(0, 8)}</span>
                      </span>
                      <span className={`status-pill status-${orderStatusTone(o.status)}`}>
                        {o.status}
                      </span>
                    </div>
                    <div className="convo-sub">
                      {money(o.total_cents)} · {fmtTime(o.created_at)}
                    </div>
                    <div className="row-actions">
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
                        Open chat
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        <h3 className="form-card-title">Commerce audit</h3>
        <div className="thread-list">
          {commerceAudit.length === 0 && <p className="hint">No commerce audit events yet.</p>}
          {commerceAudit.map((e) => (
            <div key={e.id} className="thread-row">
              <div className="thread-row-top">
                <span className="thread-name">{e.kind}</span>
                <span className="thread-time">{fmtTime(e.created_at)}</span>
              </div>
              <div className="convo-sub">{e.summary}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
