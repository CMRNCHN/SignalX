import { useEffect, useMemo, useRef, useState } from "react";
import type { ContactMeta, Customer, GroupMeta, Order, Product } from "../../api";
import type { Panel } from "../../App";
import { isGroupThread } from "../../format";
import { IconBag, IconPlus, IconX } from "../../navIcons";
import { WhyTip } from "../WhyTip";

/* The order lifecycle, in the order it actually happens. A quote is a draft
   that has been sent; it is not a separate status, so the track shows where an
   order sits rather than every transition it could make. */
const TRACK = ["draft", "confirmed", "invoiced", "paid", "fulfilled"] as const;

const trackIndex = (status: string) => TRACK.indexOf(status.toLowerCase() as (typeof TRACK)[number]);

type OrdersScreenProps = {
  orders: Order[];
  filteredOrders: Order[];
  orderFilter: { q: string; status: string; thisThread: boolean };
  setOrderFilter: React.Dispatch<
    React.SetStateAction<{ q: string; status: string; thisThread: boolean }>
  >;
  orderStatuses: string[];
  products: Product[];
  selectedId: string | null;
  setSelectedId: (id: string) => void;
  setPanel: (panel: Panel) => void;
  orderProductId: string;
  setOrderProductId: (id: string) => void;
  orderSellOptionId: string;
  setOrderSellOptionId: (id: string) => void;
  orderQty: string;
  setOrderQty: (qty: string) => void;
  placeOrder: (draft: boolean) => Promise<void>;
  sendQuote: (id: string) => Promise<void>;
  sendInvoice: (id: string) => Promise<void>;
  confirmDraftOrder: (id: string) => Promise<void>;
  editDraftFirstLineQty: (o: Order) => Promise<void>;
  setOrderLifecycle: (id: string, status: string) => Promise<void>;
  duplicateAsDraft: (id: string) => Promise<unknown>;
  focusOrderId?: string | null;
  onConsumedFocus?: () => void;
  orderParty: (o: Order) => string;
  threadTitle: (
    id: string,
    contacts: ContactMeta[],
    groups: GroupMeta[],
    customers: Customer[],
  ) => string;
  contacts: ContactMeta[];
  groups: GroupMeta[];
  customers: Customer[];
  money: (cents: number) => string;
  fmtTime: (ts: number) => string;
  orderStatusTone: (status: string) => string;
  productPriceLabel: (p: Product) => string;
  productStockLabel: (p: Product) => string;
  formatPhone: (id: string) => string;
  initials: (name: string) => string;
  avatarTint: (seed: string) => React.CSSProperties;
};

export function OrdersScreen(props: OrdersScreenProps) {
  const {
    orders,
    filteredOrders,
    orderFilter,
    setOrderFilter,
    orderStatuses,
    products,
    selectedId,
    setSelectedId,
    setPanel,
    orderProductId,
    setOrderProductId,
    orderSellOptionId,
    setOrderSellOptionId,
    orderQty,
    setOrderQty,
    placeOrder,
    sendQuote,
    sendInvoice,
    confirmDraftOrder,
    editDraftFirstLineQty,
    setOrderLifecycle,
    duplicateAsDraft,
    focusOrderId,
    onConsumedFocus,
    orderParty,
    threadTitle,
    contacts,
    groups,
    customers,
    money,
    fmtTime,
    orderStatusTone,
    productPriceLabel,
    productStockLabel,
    formatPhone,
    initials,
    avatarTint,
  } = props;

  const [openId, setOpenId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const didAutoOpen = useRef(false);

  // The list re-sorts and re-filters constantly, so hold the id and look the
  // order up rather than holding a snapshot that goes stale after an action.
  const open = openId ? (orders.find((o) => o.id === openId) ?? null) : null;

  const rollup = useMemo(() => {
    let openCents = 0;
    let paidCents = 0;
    let drafts = 0;
    for (const o of orders) {
      const s = o.status.toLowerCase();
      if (s === "draft") drafts += 1;
      else if (s === "confirmed" || s === "invoiced") openCents += o.total_cents;
      else if (s === "paid" || s === "fulfilled") paidCents += o.total_cents;
    }
    return { openCents, paidCents, drafts, count: orders.length };
  }, [orders]);

  const canOrder = !!selectedId && !isGroupThread(selectedId) && products.length > 0;

  useEffect(() => {
    if (focusOrderId) {
      setOpenId(focusOrderId);
      setComposing(false);
      onConsumedFocus?.();
      return;
    }
    if (composing) return;
    if (openId) {
      if (!filteredOrders.some((o) => o.id === openId)) {
        setOpenId(filteredOrders[0]?.id ?? null);
      }
      return;
    }
    if (!didAutoOpen.current && filteredOrders[0]) {
      didAutoOpen.current = true;
      setOpenId(filteredOrders[0].id);
    }
  }, [filteredOrders, composing, openId, focusOrderId, onConsumedFocus]);
  const activeProduct = products.find((p) => p.id === orderProductId);

  const lineQty = (l: Order["lines"][number]) => {
    const u = (l.unit || "ea").toLowerCase();
    const q =
      Math.abs(l.quantity - Math.round(l.quantity)) < 0.001
        ? String(Math.round(l.quantity))
        : l.quantity.toFixed(3);
    return u === "ea" ? q : `${q} ${u}`;
  };

  const startCompose = () => {
    setComposing(true);
    setOpenId(null);
  };

  return (
    <section className="thread-col wide">
      <header className="col-head">
        Orders
        <span className="col-meta">
          {filteredOrders.length === orders.length
            ? `${orders.length} total`
            : `${filteredOrders.length} of ${orders.length}`}
        </span>
      </header>

      <div className="orders-layout">
        <div className="orders-list-pane">
          <div className="filter-strip in-panel">
            <input
              placeholder="Filter orders…"
              value={orderFilter.q}
              onChange={(e) => setOrderFilter((f) => ({ ...f, q: e.target.value }))}
            />
            <select
              aria-label="Order status"
              value={orderFilter.status}
              onChange={(e) => setOrderFilter((f) => ({ ...f, status: e.target.value }))}
            >
              {orderStatuses.map((s) => (
                <option key={s} value={s}>
                  {s === "all" ? "All statuses" : s}
                </option>
              ))}
            </select>
            <label className="filter-check">
              <input
                type="checkbox"
                checked={orderFilter.thisThread}
                disabled={!selectedId}
                onChange={(e) => setOrderFilter((f) => ({ ...f, thisThread: e.target.checked }))}
              />
              This chat
            </label>
          </div>

          <button
            type="button"
            className="orders-new-btn"
            onClick={startCompose}
            disabled={!canOrder}
            title={canOrder ? "New order" : "Select a DM thread with catalog products first"}
          >
            <IconPlus />
            New order
          </button>

          <div className="orders-list">
            {orders.length === 0 && <p className="hint">No orders yet.</p>}
            {orders.length > 0 && filteredOrders.length === 0 && (
              <p className="hint">No orders match these filters.</p>
            )}
            {filteredOrders.map((o) => {
              const party = orderParty(o);
              return (
                <button
                  key={o.id}
                  type="button"
                  className={`order-row${o.id === openId ? " active" : ""}`}
                  onClick={() => {
                    setOpenId(o.id);
                    setComposing(false);
                  }}
                >
                  <span className="avatar-dot" style={avatarTint(o.thread_id)}>
                    {initials(party)}
                  </span>
                  <span className="order-row-main">
                    <span className="order-row-top">
                      <span className="thread-name">{party}</span>
                      <span className="order-row-total">{money(o.total_cents)}</span>
                    </span>
                    <span className="order-row-sub">
                      {o.lines.map((l) => `${l.name}×${lineQty(l)}`).join(", ") || "No lines"}
                    </span>
                    <span className="order-row-foot">
                      <span className={`status-pill status-${orderStatusTone(o.status)}`}>
                        {o.status}
                      </span>
                      <span className="order-id">{o.id.slice(0, 8)}</span>
                      <span className="thread-time">{fmtTime(o.created_at)}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="orders-detail-pane">
          {composing ? (
            <OrderComposer
              products={products}
              canOrder={canOrder}
              selectedId={selectedId}
              activeProduct={activeProduct}
              orderProductId={orderProductId}
              setOrderProductId={setOrderProductId}
              orderSellOptionId={orderSellOptionId}
              setOrderSellOptionId={setOrderSellOptionId}
              orderQty={orderQty}
              setOrderQty={setOrderQty}
              placeOrder={placeOrder}
              onClose={() => setComposing(false)}
              threadTitle={threadTitle}
              contacts={contacts}
              groups={groups}
              customers={customers}
              money={money}
              productPriceLabel={productPriceLabel}
              productStockLabel={productStockLabel}
              formatPhone={formatPhone}
            />
          ) : open ? (
            <OrderDetail
              order={open}
              party={orderParty(open)}
              siblings={orders.filter(
                (o) => o.thread_id === open.thread_id && o.id !== open.id,
              )}
              onOpenSibling={setOpenId}
              lineQty={lineQty}
              money={money}
              fmtTime={fmtTime}
              orderStatusTone={orderStatusTone}
              formatPhone={formatPhone}
              initials={initials}
              avatarTint={avatarTint}
              sendQuote={sendQuote}
              sendInvoice={sendInvoice}
              confirmDraftOrder={confirmDraftOrder}
              editDraftFirstLineQty={editDraftFirstLineQty}
              setOrderLifecycle={setOrderLifecycle}
              duplicateAsDraft={async (id) => {
                const created = await duplicateAsDraft(id);
                if (created && typeof created === "object" && created && "id" in created) {
                  setOpenId((created as { id: string }).id);
                  setComposing(false);
                }
              }}
              openChat={() => {
                setSelectedId(open.thread_id);
                setPanel("threads");
              }}
            />
          ) : (
            <div className="orders-empty">
              <div className="orders-rollup">
                <div>
                  <dt>Orders</dt>
                  <dd>{rollup.count}</dd>
                </div>
                <div>
                  <dt>
                    Open
                    <WhyTip why="Totals of orders that are confirmed or invoiced — committed but not yet paid." />
                  </dt>
                  <dd>{money(rollup.openCents)}</dd>
                </div>
                <div>
                  <dt>
                    Collected
                    <WhyTip why="Totals of orders marked paid or fulfilled. Cancelled orders are excluded." />
                  </dt>
                  <dd>{money(rollup.paidCents)}</dd>
                </div>
                <div>
                  <dt>Drafts</dt>
                  <dd>{rollup.drafts}</dd>
                </div>
              </div>
              <div className="orders-empty-inner">
                <span className="orders-empty-ico" aria-hidden>
                  <IconBag />
                </span>
                <h2>{orders.length ? "Pick an order" : "No orders yet"}</h2>
                <p>
                  {orders.length
                    ? "Choose one on the left to see its lines, where it is in the lifecycle, and what to do next."
                    : "Place an order against a DM thread and it will appear here."}
                </p>
                <button
                  type="button"
                  className="action-btn primary"
                  onClick={startCompose}
                  disabled={!canOrder}
                >
                  New order
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* --- Detail ------------------------------------------------------------- */

type OrderDetailProps = {
  order: Order;
  party: string;
  /** Every other order on the same thread — the context that makes a single
   *  order readable: is this a regular, or the first thing they have bought? */
  siblings: Order[];
  onOpenSibling: (id: string) => void;
  lineQty: (l: Order["lines"][number]) => string;
  money: (c: number) => string;
  fmtTime: (ts: number) => string;
  orderStatusTone: (s: string) => string;
  formatPhone: (id: string) => string;
  initials: (name: string) => string;
  avatarTint: (seed: string) => React.CSSProperties;
  sendQuote: (id: string) => Promise<void>;
  sendInvoice: (id: string) => Promise<void>;
  confirmDraftOrder: (id: string) => Promise<void>;
  editDraftFirstLineQty: (o: Order) => Promise<void>;
  setOrderLifecycle: (id: string, status: string) => Promise<void>;
  duplicateAsDraft: (id: string) => Promise<void>;
  openChat: () => void;
};

function OrderDetail({
  order,
  party,
  siblings,
  onOpenSibling,
  lineQty,
  money,
  fmtTime,
  orderStatusTone,
  formatPhone,
  initials,
  avatarTint,
  sendQuote,
  sendInvoice,
  confirmDraftOrder,
  editDraftFirstLineQty,
  setOrderLifecycle,
  duplicateAsDraft,
  openChat,
}: OrderDetailProps) {
  const status = order.status.toLowerCase();
  const cancelled = status === "cancelled" || status === "canceled";
  const at = trackIndex(status);
  const isGroup = isGroupThread(order.thread_id);

  // Counted across this order and its siblings, so the figures describe the
  // relationship rather than the one order that happens to be open.
  const history = [order, ...siblings];
  const lifetime = history
    .filter((o) => !/^cancel/.test(o.status.toLowerCase()))
    .reduce((sum, o) => sum + o.total_cents, 0);
  const firstAt = Math.min(...history.map((o) => o.created_at));

  return (
    <div className="order-detail">
      <header className="order-detail-head">
        <span className="avatar-dot lg" style={avatarTint(order.thread_id)}>
          {initials(party)}
        </span>
        <div className="order-detail-id">
          <h2>{party}</h2>
          <p className="convo-sub">
            {isGroup ? "Group order" : formatPhone(order.thread_id)} · order{" "}
            {order.id.slice(0, 8)} · {fmtTime(order.created_at)}
          </p>
        </div>
        <span className={`status-pill status-${orderStatusTone(order.status)}`}>
          {order.status}
        </span>
      </header>

      <div className="order-detail-cols">
        <div className="order-detail-main">
      {cancelled ? (
        <div className="order-track cancelled">
          <span>This order was cancelled. Duplicate it as a draft to start again.</span>
        </div>
      ) : (
        <ol className="order-track" aria-label="Order lifecycle">
          {TRACK.map((step, i) => (
            <li
              key={step}
              className={i < at ? "done" : i === at ? "now" : "todo"}
              aria-current={i === at ? "step" : undefined}
            >
              <span className="order-track-dot" aria-hidden />
              <span className="order-track-label">{step}</span>
            </li>
          ))}
        </ol>
      )}

      <section className="order-lines">
        <h3 className="form-card-title">Lines</h3>
        <table className="order-line-table">
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Qty</th>
              <th scope="col">Unit</th>
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.length === 0 && (
              <tr>
                <td colSpan={4} className="hint">
                  This order has no lines.
                </td>
              </tr>
            )}
            {order.lines.map((l, i) => (
              <tr key={`${l.product_id}-${i}`}>
                <td>
                  <span className="thread-name">{l.name}</span>
                  {l.sell_option_label && (
                    <span className="order-line-pack">{l.sell_option_label}</span>
                  )}
                </td>
                <td className="num">{lineQty(l)}</td>
                <td className="num">{money(l.unit_price_cents)}</td>
                <td className="num strong">
                  {money(l.line_total_cents ?? Math.round(l.unit_price_cents * l.quantity))}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>Total</td>
              <td className="num strong">{money(order.total_cents)}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      <footer className="order-actions">
        {/* One primary action per state, so the next step is obvious instead of
            being one of six equally-weighted buttons. */}
        {status === "draft" ? (
          <>
            <button
              type="button"
              className="action-btn primary"
              onClick={() => void sendQuote(order.id)}
              title="Queue quote text via outbox"
            >
              Send quote
            </button>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => void confirmDraftOrder(order.id)}
            >
              Confirm
            </button>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => void editDraftFirstLineQty(order)}
            >
              Edit lines
            </button>
          </>
        ) : (
          <>
            {!cancelled && (
              <button
                type="button"
                className="action-btn primary"
                onClick={() => void sendInvoice(order.id)}
                title="Queue invoice text to this chat via outbox"
              >
                Send invoice
              </button>
            )}
            {!cancelled && status !== "paid" && (
              <button
                type="button"
                className="ghost-btn"
                onClick={() => void setOrderLifecycle(order.id, "paid")}
              >
                Mark paid
              </button>
            )}
            {!cancelled && status !== "fulfilled" && (
              <button
                type="button"
                className="ghost-btn"
                onClick={() => void setOrderLifecycle(order.id, "fulfilled")}
              >
                Mark fulfilled
              </button>
            )}
          </>
        )}
        <button type="button" className="ghost-btn" onClick={() => void duplicateAsDraft(order.id)}>
          Duplicate as draft
        </button>
        <button type="button" className="ghost-btn" onClick={openChat}>
          Open chat
        </button>
        {!cancelled && (
          <button
            type="button"
            className="ghost-btn danger-text order-cancel"
            onClick={() => void setOrderLifecycle(order.id, "cancelled")}
          >
            Cancel order
          </button>
        )}
      </footer>
        </div>

        <aside className="order-detail-side">
          <section className="order-side-block">
            <h3 className="form-card-title">Person</h3>
            <dl className="order-side-stats">
              <div>
                <dt>Orders</dt>
                <dd>{history.length}</dd>
              </div>
              <div>
                <dt>
                  Lifetime
                  <WhyTip why="Every order on this thread added together, cancelled ones excluded." />
                </dt>
                <dd>{money(lifetime)}</dd>
              </div>
            </dl>
            <p className="hint tight">
              {history.length === 1
                ? "First order on this thread."
                : `Buying since ${fmtTime(firstAt)}.`}
            </p>
            <button type="button" className="ghost-btn full" onClick={openChat}>
              Open chat
            </button>
          </section>

          <section className="order-side-block">
            <h3 className="form-card-title">Other orders</h3>
            {siblings.length === 0 ? (
              <p className="hint tight">Nothing else on this thread yet.</p>
            ) : (
              <ul className="order-side-list">
                {siblings
                  .slice()
                  .sort((a, b) => b.created_at - a.created_at)
                  .slice(0, 8)
                  .map((o) => (
                    <li key={o.id}>
                      <button type="button" onClick={() => onOpenSibling(o.id)}>
                        <span className={`status-pill status-${orderStatusTone(o.status)}`}>
                          {o.status}
                        </span>
                        <span className="order-side-total">{money(o.total_cents)}</span>
                        <span className="thread-time">{fmtTime(o.created_at)}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

/* --- Composer ----------------------------------------------------------- */

type ComposerProps = {
  products: Product[];
  canOrder: boolean;
  selectedId: string | null;
  activeProduct: Product | undefined;
  orderProductId: string;
  setOrderProductId: (id: string) => void;
  orderSellOptionId: string;
  setOrderSellOptionId: (id: string) => void;
  orderQty: string;
  setOrderQty: (q: string) => void;
  placeOrder: (draft: boolean) => Promise<void>;
  onClose: () => void;
  threadTitle: (
    id: string,
    contacts: ContactMeta[],
    groups: GroupMeta[],
    customers: Customer[],
  ) => string;
  contacts: ContactMeta[];
  groups: GroupMeta[];
  customers: Customer[];
  money: (c: number) => string;
  productPriceLabel: (p: Product) => string;
  productStockLabel: (p: Product) => string;
  formatPhone: (id: string) => string;
};

function OrderComposer({
  products,
  canOrder,
  selectedId,
  activeProduct,
  orderProductId,
  setOrderProductId,
  orderSellOptionId,
  setOrderSellOptionId,
  orderQty,
  setOrderQty,
  placeOrder,
  onClose,
  threadTitle,
  contacts,
  groups,
  customers,
  money,
  productPriceLabel,
  productStockLabel,
  formatPhone,
}: ComposerProps) {
  const packs = activeProduct?.sell_options || [];
  const pack = packs.find((o) => o.id === orderSellOptionId);
  // Shown before anything is committed, so the operator can see what the order
  // will cost without placing it first.
  const previewCents = pack?.price_cents ?? null;
  const customTotal =
    !pack && activeProduct && Number(orderQty) > 0
      ? Math.round(activeProduct.price_cents * Number(orderQty))
      : null;

  return (
    <div className="order-compose">
      <header className="order-detail-head">
        <div className="order-detail-id">
          <h2>New order</h2>
          <p className="convo-sub">
            Placing an order decrements stock. A quote is saved as a draft and changes nothing until
            you confirm it.
          </p>
        </div>
        <button type="button" className="act-btn" onClick={onClose} title="Close">
          <IconX />
        </button>
      </header>

      <div className="order-compose-body">
        <div className="order-target">
          {selectedId && !isGroupThread(selectedId) ? (
            <>
              Ordering for <strong>{threadTitle(selectedId, contacts, groups, customers)}</strong>
              <span className="convo-sub inline">{formatPhone(selectedId)}</span>
            </>
          ) : (
            <span className="warn-text">Select a DM thread in Messages first to place an order.</span>
          )}
        </div>

        <label className="field-label" htmlFor="order-product">
          Product
        </label>
        <select
          id="order-product"
          value={orderProductId}
          onChange={(e) => {
            setOrderProductId(e.target.value);
            setOrderSellOptionId("");
          }}
          disabled={products.length === 0}
        >
          {products.length === 0 && <option value="">No products — add one in Catalog</option>}
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({productPriceLabel(p)}, {productStockLabel(p)})
            </option>
          ))}
        </select>

        <div className="form-grid-2">
          <div>
            <label className="field-label" htmlFor="order-pack">
              Pack
            </label>
            <select
              id="order-pack"
              value={orderSellOptionId}
              onChange={(e) => setOrderSellOptionId(e.target.value)}
              disabled={packs.length === 0}
            >
              <option value="">Custom qty (sales UOM)</option>
              {packs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label} — {o.amount} {o.unit}
                  {o.price_cents != null ? ` @ ${money(o.price_cents)}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="order-qty">
              Quantity
            </label>
            <input
              id="order-qty"
              placeholder="Qty (sales UOM)"
              value={orderQty}
              onChange={(e) => setOrderQty(e.target.value)}
              disabled={!!orderSellOptionId}
            />
          </div>
        </div>

        {(previewCents != null || customTotal != null) && (
          <p className="order-preview">
            Line total <strong>{money(previewCents ?? customTotal ?? 0)}</strong>
          </p>
        )}

        <div className="row-actions">
          <button
            type="button"
            className="action-btn primary"
            disabled={!canOrder}
            onClick={() => void placeOrder(false)}
          >
            Place order
          </button>
          <button
            type="button"
            className="action-btn"
            disabled={!canOrder}
            onClick={() => void placeOrder(true)}
          >
            Create quote
          </button>
        </div>
      </div>
    </div>
  );
}
