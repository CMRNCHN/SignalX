import { convertFileSrc } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import {
  api,
  type AiStatus,
  type ContactMeta,
  type Customer,
  type Order,
  type OutboxItem,
  type Product,
  type ThreadActionSuggestion,
} from "./api";
import { deriveCustomerSegments } from "./segments";
import { isPrimaryAction, orderStatusLabel, orderStatusTone } from "./status";

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtTime(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function computeStanding(orders: Order[]): {
  label: string;
  tone: "ok" | "warn" | "danger" | "muted";
  lifetimeCents: number;
  openCents: number;
} {
  const cancelled = orders.filter((o) => o.status === "cancelled").length;
  const open = orders.filter(
    (o) => o.status === "confirmed" || o.status === "draft" || o.status === "invoiced",
  );
  const lifetimeCents = orders
    .filter((o) => o.status === "paid" || o.status === "fulfilled")
    .reduce((s, o) => s + o.total_cents, 0);
  const openCents = open.reduce((s, o) => s + o.total_cents, 0);
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const staleConfirmed = orders.some(
    (o) => o.status === "confirmed" && Date.now() - o.created_at > sevenDaysMs,
  );
  if (staleConfirmed || cancelled >= 2) {
    return { label: "At risk", tone: "danger", lifetimeCents, openCents };
  }
  if (openCents > 0) return { label: "Open balance", tone: "warn", lifetimeCents, openCents };
  if (orders.length === 0) return { label: "New", tone: "muted", lifetimeCents, openCents };
  return { label: "Good", tone: "ok", lifetimeCents, openCents };
}

function fallbackActions(
  threadId: string,
  orders: Order[],
  hasCustomer: boolean,
  aiConfigured: boolean,
): ThreadActionSuggestion[] {
  const latestDraft = orders.find((o) => o.status === "draft");
  const latestInvoiceable = orders.find(
    (o) => o.status === "confirmed" || o.status === "invoiced",
  );
  const out: ThreadActionSuggestion[] = [];
  if (aiConfigured) {
    out.push({ label: "Refresh summary", kind: "summarize", payload: "" });
    out.push({ label: "Draft reply", kind: "draft", payload: "helpful concise reply" });
  }
  if (latestDraft) {
    out.push({ label: "Send latest quote", kind: "send_quote", payload: latestDraft.id });
  }
  if (latestInvoiceable) {
    out.push({
      label: "Send latest invoice",
      kind: "send_invoice",
      payload: latestInvoiceable.id,
    });
    out.push({ label: "Mark latest paid", kind: "mark_paid", payload: latestInvoiceable.id });
  }
  out.push({ label: "Open orders", kind: "open_orders", payload: threadId });
  if (!hasCustomer && !threadId.startsWith("group:")) {
    out.push({ label: "Link as customer", kind: "link_customer", payload: "" });
  }
  return out.slice(0, 5);
}

type Props = {
  threadId: string | null;
  title: string;
  initials: string;
  contact: ContactMeta | null;
  customer: Customer | null;
  orders: Order[];
  products: Product[];
  participants?: string[];
  ai: AiStatus | null;
  aiBusy: boolean;
  ivrEnabled?: boolean;
  ivrEffective?: boolean;
  ivrHandedOff?: boolean;
  ivrHint?: string | null;
  onStatus: (msg: string | null) => void;
  onSetComposer: (text: string) => void;
  onDraft: (intent?: string) => void;
  onSummarize: () => Promise<string | null>;
  onLinkCustomer: () => void;
  onOpenOrders: () => void;
  onOpenPeople?: () => void;
  onSendInvoice: (orderId: string) => void;
  onSendQuote?: (orderId: string) => void;
  onMarkPaid: (orderId: string) => void;
  onToggleFavorite: (next: boolean) => void;
  onToggleMute: (next: boolean) => void;
  onSaveNotes: (notes: string) => void;
  onResumeMenu?: () => void;
  onPlaceOrder?: () => void;
};

export function ProfileRail(props: Props) {
  const {
    threadId,
    title,
    initials,
    contact,
    customer,
    orders,
    products,
    participants = [],
    ai,
    aiBusy,
    ivrEnabled,
    ivrEffective,
    ivrHandedOff,
    ivrHint,
    onStatus,
    onSetComposer,
    onDraft,
    onSummarize,
    onLinkCustomer,
    onOpenOrders,
    onOpenPeople,
    onSendInvoice,
    onSendQuote,
    onMarkPaid,
    onToggleFavorite,
    onToggleMute,
    onSaveNotes,
    onResumeMenu,
    onPlaceOrder,
  } = props;

  const isGroup = !!threadId?.startsWith("group:");

  const [summary, setSummary] = useState<string | null>(null);
  const [actions, setActions] = useState<ThreadActionSuggestion[]>([]);
  const [actionsBusy, setActionsBusy] = useState(false);
  const [notes, setNotes] = useState(customer?.notes ?? "");
  const [threadOutbox, setThreadOutbox] = useState<OutboxItem[]>([]);
  const [productThumbs, setProductThumbs] = useState<{ id: string; name: string; src: string }[]>(
    [],
  );

  const threadOrders = useMemo(
    () =>
      threadId
        ? orders.filter((o) => o.thread_id === threadId).sort((a, b) => b.created_at - a.created_at)
        : [],
    [orders, threadId],
  );
  const standing = useMemo(() => computeStanding(threadOrders), [threadOrders]);
  const segments = useMemo(
    () => deriveCustomerSegments(contact, customer, threadOrders, products, standing.lifetimeCents),
    [contact, customer, threadOrders, products, standing.lifetimeCents],
  );

  useEffect(() => {
    setNotes(customer?.notes ?? "");
    setSummary(null);
  }, [threadId, customer?.id, customer?.notes]);

  useEffect(() => {
    if (!threadId) {
      setThreadOutbox([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await api.listOutbox(threadId);
      if (!cancelled && res.success) {
        setThreadOutbox(res.data.filter((i) => !!i.attachment_path));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  useEffect(() => {
    let cancelled = false;
    const ids = Array.from(
      new Set(
        threadOrders.flatMap((o) => o.lines.map((l) => l.product_id)).filter(Boolean),
      ),
    ).slice(0, 12);
    void (async () => {
      const thumbs: { id: string; name: string; src: string }[] = [];
      for (const id of ids) {
        const p = products.find((x) => x.id === id);
        if (!p?.image_path) continue;
        const img = await api.getProductImage(id);
        if (img.success) {
          thumbs.push({
            id,
            name: p.name,
            src: `data:${img.data.mime};base64,${img.data.bytes_base64}`,
          });
        }
      }
      if (!cancelled) setProductThumbs(thumbs);
    })();
    return () => {
      cancelled = true;
    };
  }, [threadOrders, products]);

  useEffect(() => {
    if (!threadId) {
      setActions([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        setActionsBusy(true);
        const res = await api.suggestThreadActions(threadId);
        if (cancelled) return;
        setActionsBusy(false);
        if (res.success && res.data.length > 0) setActions(res.data);
        else {
          setActions(
            fallbackActions(threadId, threadOrders, !!customer, !!ai?.configured),
          );
        }
      })();
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [threadId, threadOrders, customer, ai?.configured]);

  const refreshSummary = async () => {
    const text = await onSummarize();
    if (text) setSummary(text);
  };

  const runAction = async (a: ThreadActionSuggestion) => {
    const kind = a.kind.trim().toLowerCase();
    const payload = (a.payload || "").trim();
    const latestOpen = threadOrders.find(
      (o) => o.status === "confirmed" || o.status === "draft" || o.status === "invoiced",
    );
    const latestDraft = threadOrders.find((o) => o.status === "draft");
    const resolveOrderId = () => {
      if (payload && payload !== "latest") return payload;
      return latestOpen?.id ?? threadOrders[0]?.id ?? "";
    };
    switch (kind) {
      case "summarize":
        await refreshSummary();
        break;
      case "draft":
        onDraft(payload || "helpful concise reply");
        break;
      case "compose":
        if (payload) onSetComposer(payload);
        break;
      case "send_quote": {
        const id =
          payload && payload !== "latest" ? payload : latestDraft?.id ?? resolveOrderId();
        if (!id) onStatus("No draft quote to send");
        else if (onSendQuote) onSendQuote(id);
        else onStatus("Send quote not available");
        break;
      }
      case "send_invoice": {
        const id = resolveOrderId();
        if (!id) onStatus("No order to invoice");
        else onSendInvoice(id);
        break;
      }
      case "mark_paid": {
        const id = resolveOrderId();
        if (!id) onStatus("No order to mark paid");
        else onMarkPaid(id);
        break;
      }
      case "open_orders":
        onOpenOrders();
        break;
      case "link_customer":
        onLinkCustomer();
        break;
      default:
        onStatus(`Unknown action: ${kind}`);
    }
  };

  const attachThumbs = threadOutbox
    .filter((i) => i.attachment_path)
    .slice(0, 12)
    .map((i) => {
      const path = i.attachment_path!;
      let src = "";
      try {
        src = convertFileSrc(path);
      } catch {
        src = "";
      }
      return { id: i.id, path, src, label: path.split("/").pop() || "file" };
    });

  if (!threadId) {
    return (
      <aside className="profile-rail">
        <div className="profile-empty">
          <strong>Profile</strong>
          <p>Select a thread to see their profile.</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="profile-rail">
      <header className="profile-rail-head">
        <span className="avatar-dot profile-avatar" aria-hidden>
          {initials}
        </span>
        <div className="profile-rail-title wrap">
          <strong>{title}</strong>
          <div className="convo-sub wrap">{threadId}</div>
        </div>
      </header>

      <div className="profile-section">
        <div className="profile-section-title">Identity</div>
        <p className="hint tight wrap">{isGroup ? "Group chat" : "Direct message"}</p>
        {isGroup && participants.length > 0 && (
          <ul className="profile-members">
            {participants.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </div>

      {!isGroup && segments.length > 0 && (
      <div className="profile-section">
        <div className="profile-section-title">Segments</div>
        <div className="segment-chips">
          {segments.map((seg) => (
            <span key={seg.label} className={`segment-pill segment-${seg.tone}`}>
              {seg.label}
            </span>
          ))}
        </div>
      </div>
      )}

      {!isGroup && (
      <div className="profile-section">
        <div className="profile-section-title">Standing</div>
        <span className={`status-pill status-${standing.tone}`}>{standing.label}</span>
        <dl className="profile-stats">
          <div>
            <dt>Lifetime</dt>
            <dd>{money(standing.lifetimeCents)}</dd>
          </div>
          <div>
            <dt>Open</dt>
            <dd>{money(standing.openCents)}</dd>
          </div>
          <div>
            <dt>Orders</dt>
            <dd>{threadOrders.length}</dd>
          </div>
        </dl>
      </div>
      )}

      <div className="profile-section">
        <div className="profile-section-title">{isGroup ? "Group" : "Customer"}</div>
        <div className="profile-toggles">
          <label className="toggle compact">
            <input
              type="checkbox"
              checked={!!contact?.favorite}
              onChange={(e) => onToggleFavorite(e.target.checked)}
            />
            Favorite
          </label>
          <label className="toggle compact">
            <input
              type="checkbox"
              checked={!!contact?.muted}
              onChange={(e) => onToggleMute(e.target.checked)}
            />
            Muted
          </label>
        </div>
        {isGroup ? (
          <p className="hint tight">Groups have no customer record or order composer.</p>
        ) : customer ? (
          <>
            <p className="hint tight wrap">
              Customer linked · {customer.display_name || customer.id.slice(0, 8)}
            </p>
            {onOpenPeople && (
              <button type="button" className="ghost-btn" onClick={onOpenPeople}>
                Open in People
              </button>
            )}
          </>
        ) : (
          <button type="button" className="action-btn primary" onClick={onLinkCustomer}>
            Link as customer
          </button>
        )}
        {!isGroup && (
          <>
            <label className="field-stack">
              <span className="field-label">Notes</span>
              <textarea
                className="product-desc"
                rows={3}
                placeholder="Operator notes…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={!customer}
              />
            </label>
            {customer && (
              <button
                type="button"
                className="ghost-btn"
                onClick={() => onSaveNotes(notes)}
              >
                Save notes
              </button>
            )}
          </>
        )}
      </div>

      <div className="profile-section">
        <div className="allowlist-head">
          <div className="profile-section-title">AI summary</div>
          <button
            type="button"
            className="ghost-btn"
            disabled={aiBusy || !ai?.configured}
            onClick={() => void refreshSummary()}
          >
            Refresh
          </button>
        </div>
        {!ai?.configured && <p className="hint tight">AI not configured — summaries unavailable.</p>}
        {summary ? <pre className="profile-summary">{summary}</pre> : (
          <p className="hint tight">No summary yet.</p>
        )}
      </div>

      {!isGroup && (
      <div className="profile-section">
        <div className="profile-section-title">Actions</div>
        {onPlaceOrder && (
          <button type="button" className="action-btn" onClick={onPlaceOrder}>
            Place order
          </button>
        )}
        {ivrHint && <p className="hint tight">{ivrHint}</p>}
        {ivrEffective && <p className="hint tight">Buyer menu is live on this chat.</p>}
        {ivrEnabled && !ivrEffective && !ivrHandedOff && (
          <p className="hint tight">Buyer menu is on for this chat.</p>
        )}
        {ivrHandedOff && onResumeMenu && (
          <button type="button" className="ghost-btn" onClick={onResumeMenu}>
            Resume menu
          </button>
        )}
        {actionsBusy && <p className="hint tight">Suggesting…</p>}
        <div className="profile-chips">
          {actions.map((a, i) => (
            <button
              key={`${a.kind}-${i}`}
              type="button"
              className={isPrimaryAction(a.kind) ? "action-btn primary" : "action-btn"}
              disabled={
                aiBusy ||
                ((a.kind === "draft" || a.kind === "summarize") && !ai?.configured)
              }
              onClick={() => void runAction(a)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
      )}

      {!isGroup && (
      <div className="profile-section">
        <div className="profile-section-title">Orders</div>
        {threadOrders.length === 0 && <p className="hint tight">No orders for this chat.</p>}
        <ul className="profile-ledger">
          {threadOrders.slice(0, 8).map((o) => (
            <li key={o.id}>
              <div className="thread-row-top">
                <span className="thread-name">{o.id.slice(0, 8)}</span>
                <span className={`status-pill status-${orderStatusTone(o.status)}`}>
                  {orderStatusLabel(o.status)}
                </span>
              </div>
              <div className="convo-sub">
                {money(o.total_cents)} · {fmtTime(o.created_at)}
              </div>
              <div className="row-actions">
                {o.status !== "cancelled" && o.status !== "paid" && (
                  <button type="button" className="ghost-btn" onClick={() => onMarkPaid(o.id)}>
                    Paid
                  </button>
                )}
                {o.status === "draft" ? (
                  onSendQuote && (
                    <button type="button" className="action-btn primary" onClick={() => onSendQuote(o.id)}>
                      Quote
                    </button>
                  )
                ) : (
                  <button type="button" className="action-btn primary" onClick={() => onSendInvoice(o.id)}>
                    Invoice
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        {threadOrders.length > 0 && (
          <button type="button" className="ghost-btn" onClick={onOpenOrders}>
            View all orders
          </button>
        )}
      </div>
      )}

      {!isGroup && (
      <div className="profile-section">
        <div className="profile-section-title">Buyer menu</div>
        <p className="hint tight">
          {ivrEffective ? "ON for this chat" : ivrEnabled ? "Enabled — waiting to activate" : "Off"}
        </p>
      </div>
      )}

      <div className="profile-section">
        <div className="profile-section-title">Media</div>
        {attachThumbs.length === 0 && productThumbs.length === 0 && (
          <p className="hint tight">No shared outbound files or product images yet.</p>
        )}
        <div className="profile-media">
          {attachThumbs.map((t) => (
            <button
              key={t.id}
              type="button"
              className="profile-media-item"
              title={t.label}
              onClick={() => void api.openPath(t.path)}
            >
              {t.src ? <img src={t.src} alt="" /> : <span>{t.label.slice(0, 8)}</span>}
            </button>
          ))}
          {productThumbs.map((t) => (
            <div key={t.id} className="profile-media-item" title={t.name}>
              <img src={t.src} alt={t.name} />
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
