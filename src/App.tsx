import { useEffect, useRef, useState } from "react";
import {
  api,
  errMsg,
  onEvent,
  unwrap,
  type AiStatus,
  type AutoReplyAuditEntry,
  type AutoReplySettings,
  type ContactMeta,
  type Customer,
  type Diagnostics,
  type GroupMeta,
  type IvrSettings,
  type Message,
  type Order,
  type OutboxItem,
  type Product,
  type ReceiveLoopState,
  type SearchResult,
  type ThreadAutoReplyStatus,
  type ThreadIvrStatus,
  type ThreadSummary,
} from "./api";

type Panel = "threads" | "search" | "contacts" | "groups" | "products" | "customers" | "orders" | "audit" | "settings";

function healthTone(s: ReceiveLoopState | null): "green" | "yellow" | "red" {
  if (!s) return "yellow";
  if (s.cooldown_until && s.cooldown_until > Date.now()) return "red";
  if (s.last_receive_error) return s.consecutive_failures > 3 ? "red" : "yellow";
  if (s.last_receive_ok_at) return "green";
  return "yellow";
}

function healthLabel(s: ReceiveLoopState | null): string {
  if (!s) return "Connecting…";
  if (s.cooldown_until && s.cooldown_until > Date.now()) return "Self-heal cooldown";
  if (s.last_receive_error) return s.last_receive_error.slice(0, 80);
  if (s.last_receive_ok_at) return "Receive loop healthy";
  return "Waiting for first receive";
}

function fmtTime(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function threadTitle(id: string, contacts: ContactMeta[], groups: GroupMeta[]): string {
  if (id.startsWith("group:")) {
    const g = groups.find((x) => x.group_id === id || x.group_id === id.replace(/^group:/, ""));
    return g?.display_name || id.replace(/^group:/, "Group ");
  }
  const raw = id.replace(/^dm:/, "");
  const c = contacts.find(
    (x) => x.contact_id === id || x.contact_id === raw || x.contact_id === `dm:${raw}`,
  );
  return c?.display_name || c?.alias || raw || id;
}

function isOutgoing(m: Message): boolean {
  const d = String(m.direction).toLowerCase();
  return d === "outgoing" || d.includes("out");
}

export default function App() {
  const [panel, setPanel] = useState<Panel>("threads");
  const [accountNumber, setAccountNumber] = useState<string | null>(null);
  const [health, setHealth] = useState<ReceiveLoopState | null>(null);
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [searchHits, setSearchHits] = useState<SearchResult[]>([]);
  const [contacts, setContacts] = useState<ContactMeta[]>([]);
  const [groups, setGroups] = useState<GroupMeta[]>([]);
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [autoSettings, setAutoSettings] = useState<AutoReplySettings | null>(null);
  const [ivrSettings, setIvrSettings] = useState<IvrSettings | null>(null);
  const [threadAuto, setThreadAuto] = useState<ThreadAutoReplyStatus | null>(null);
  const [threadIvr, setThreadIvr] = useState<ThreadIvrStatus | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [productForm, setProductForm] = useState({
    name: "",
    price: "",
    stock: "0",
    sku: "",
  });
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderProductId, setOrderProductId] = useState("");
  const [orderQty, setOrderQty] = useState("1");
  const [audit, setAudit] = useState<AutoReplyAuditEntry[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedId;

  const refreshThreads = async () => {
    const res = await api.getThreads();
    if (res.success) setThreads(res.data);
  };

  const refreshMessages = async (threadId: string) => {
    const [msgs, box] = await Promise.all([
      api.getThreadMessages(threadId),
      api.listOutbox(threadId),
    ]);
    if (msgs.success) setMessages(msgs.data);
    if (box.success) setOutbox(box.data.filter((i) => i.state !== "sent"));
    await api.markThreadRead(threadId);
  };

  const refreshMeta = async () => {
    const [c, g, ar, au, ivr, prods, custs, ords] = await Promise.all([
      api.listContactMeta(),
      api.listGroupMeta(),
      api.getAutoReplySettings(),
      api.listAutoReplyAudit(80),
      api.getIvrSettings(),
      api.listProducts(),
      api.listCustomers(),
      api.listOrders(),
    ]);
    if (c.success) setContacts(c.data);
    if (g.success) setGroups(g.data);
    if (ar.success) setAutoSettings(ar.data);
    if (au.success) setAudit(au.data);
    if (ivr.success) setIvrSettings(ivr.data);
    if (prods.success) {
      setProducts(prods.data);
      if (!orderProductId && prods.data[0]) setOrderProductId(prods.data[0].id);
    }
    if (custs.success) setCustomers(custs.data);
    if (ords.success) setOrders(ords.data);
  };

  const bootstrap = async () => {
    const [diag, recv, aiStatus] = await Promise.all([
      api.getDiagnostics(),
      api.getReceiveLoopState(),
      api.checkAiStatus(),
    ]);
    const d = unwrap(diag, null as unknown as Diagnostics | null);
    setAccountNumber(d?.number ?? null);
    if (!d?.number) {
      setStatus("Not configured — set SIGNALX_NUMBER and SIGNALX_SIGNALCLI_CONFIG in .signalx.env");
    }
    setHealth(unwrap(recv, null as unknown as ReceiveLoopState));
    setAi(unwrap(aiStatus, null as unknown as AiStatus));
    await refreshThreads();
    await refreshMeta();
  };

  useEffect(() => {
    void bootstrap();
    const unsubs: Array<() => void> = [];
    void (async () => {
      unsubs.push(
        await onEvent<{ thread_id?: string }>("message://new", (p) => {
          void refreshThreads();
          const cur = selectedRef.current;
          if (p.thread_id && p.thread_id === cur) void refreshMessages(p.thread_id);
        }),
      );
      unsubs.push(
        await onEvent("outbox://updated", () => {
          void refreshThreads();
          const cur = selectedRef.current;
          if (cur) void refreshMessages(cur);
        }),
      );
      unsubs.push(
        await onEvent("outbox://item-updated", () => {
          const cur = selectedRef.current;
          if (cur) void refreshMessages(cur);
        }),
      );
      unsubs.push(
        await onEvent<ReceiveLoopState>("receive://health", (s) => setHealth(s)),
      );
      unsubs.push(
        await onEvent<{ pending?: { draft: string; thread_id: string } }>("agent://draft", (p) => {
          if (p.pending && p.pending.thread_id === selectedRef.current) {
            setComposer((c) => c || p.pending!.draft);
            setStatus("AI draft ready — review before sending");
          }
        }),
      );
      unsubs.push(
        await onEvent("auto-reply://audit", () => {
          void api.listAutoReplyAudit(80).then((r) => {
            if (r.success) setAudit(r.data);
          });
        }),
      );
      unsubs.push(
        await onEvent<AutoReplySettings>("auto-reply://settings", (s) => setAutoSettings(s)),
      );
      unsubs.push(
        await onEvent<IvrSettings>("ivr://settings", (s) => setIvrSettings(s)),
      );
      unsubs.push(
        await onEvent<{ thread_id?: string; handed_off?: boolean; node_id?: string }>(
          "ivr://session",
          (p) => {
            if (p.thread_id && p.thread_id === selectedRef.current) {
              void api.getThreadIvr(p.thread_id).then((r) => {
                if (r.success) setThreadIvr(r.data);
              });
            }
          },
        ),
      );
    })();
    const poll = window.setInterval(() => {
      void api.getReceiveLoopState().then((r) => {
        if (r.success) setHealth(r.data);
      });
      void api.checkAiStatus().then((r) => {
        if (r.success) setAi(r.data);
      });
    }, 15000);
    return () => {
      unsubs.forEach((u) => u());
      window.clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      setOutbox([]);
      setThreadAuto(null);
      setThreadIvr(null);
      setSummaryText(null);
      return;
    }
    void refreshMessages(selectedId);
    void api.getThreadAutoReply(selectedId).then((r) => {
      if (r.success) setThreadAuto(r.data);
    });
    void api.getThreadIvr(selectedId).then((r) => {
      if (r.success) setThreadIvr(r.data);
    });
  }, [selectedId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, outbox]);

  const onSend = async () => {
    if (!selectedId || !composer.trim() || sending) return;
    setSending(true);
    const text = composer.trim();
    const res = await api.queueMessage(selectedId, text);
    setSending(false);
    if (!res.success) {
      setStatus(res.error);
      return;
    }
    setComposer("");
    setStatus(null);
    await refreshMessages(selectedId);
    await refreshThreads();
  };

  const onRetry = async (id: string) => {
    const res = await api.retryOutbox(id);
    if (!res.success) setStatus(res.error);
    if (selectedId) await refreshMessages(selectedId);
  };

  const onDeleteOutbox = async (id: string) => {
    await api.deleteOutbox(id);
    if (selectedId) await refreshMessages(selectedId);
  };

  const onSearch = async () => {
    if (!searchQ.trim()) {
      setSearchHits([]);
      return;
    }
    const res = await api.searchMessages(searchQ.trim());
    if (res.success) setSearchHits(res.data);
    else setStatus(res.error);
  };

  const onSummarize = async () => {
    if (!selectedId) return;
    setAiBusy(true);
    setSummaryText(null);
    const res = await api.summarizeThread(selectedId);
    setAiBusy(false);
    if (res.success) setSummaryText(res.data);
    else setStatus(res.error);
  };

  const onDraft = async () => {
    if (!selectedId) return;
    setAiBusy(true);
    const res = await api.draftReply(selectedId, "helpful concise reply", "do not auto-send");
    setAiBusy(false);
    if (res.success) {
      setComposer(res.data);
      setStatus("Draft filled into composer — review before send");
    } else setStatus(res.error);
  };

  const onExportThread = async () => {
    if (!selectedId) return;
    const res = await api.exportThread(selectedId, "json");
    if (!res.success) {
      setStatus(res.error);
      return;
    }
    const path =
      res.data && typeof res.data === "object" && "path" in res.data
        ? String((res.data as { path: string }).path)
        : null;
    if (path) {
      await api.openPath(path);
      setStatus(`Exported to ${path}`);
    } else setStatus("Export complete");
  };

  const toggleThreadAuto = async (enabled: boolean) => {
    if (!selectedId) return;
    if (selectedId.startsWith("group:") && enabled) {
      const ok = window.confirm(
        "Enable auto-reply for this group? Groups are off by default.",
      );
      if (!ok) return;
    }
    const res = await api.setThreadAutoReply(selectedId, enabled);
    if (!res.success) {
      setStatus(res.error);
      return;
    }
    const st = await api.getThreadAutoReply(selectedId);
    if (st.success) setThreadAuto(st.data);
    await refreshMeta();
  };

  const saveAutoSettings = async (patch: Partial<AutoReplySettings>) => {
    if (!autoSettings) return;
    const next = { ...autoSettings, ...patch };
    const res = await api.setAutoReplySettings(next);
    if (res.success) setAutoSettings(res.data);
    else setStatus(res.error);
  };

  const saveIvrSettings = async (patch: Partial<IvrSettings>) => {
    if (!ivrSettings) return;
    const next = { ...ivrSettings, ...patch };
    const res = await api.setIvrSettings(next);
    if (res.success) setIvrSettings(res.data);
    else setStatus(res.error);
  };

  const toggleThreadIvr = async (enabled: boolean) => {
    if (!selectedId) return;
    if (selectedId.startsWith("group:")) {
      setStatus("IVR is not available for group threads");
      return;
    }
    const res = await api.setThreadIvr(selectedId, enabled);
    if (!res.success) {
      setStatus(res.error);
      return;
    }
    setThreadIvr(res.data);
    setStatus(enabled ? "IVR on — menu sent to this chat" : "IVR off for this chat");
    await refreshMeta();
  };

  const resumeIvrBot = async () => {
    if (!selectedId) return;
    const res = await api.clearThreadHandoff(selectedId);
    if (!res.success) {
      setStatus(res.error);
      return;
    }
    setThreadIvr(res.data);
    setStatus("Bot resumed on this chat");
  };

  const saveProduct = async () => {
    const name = productForm.name.trim();
    if (!name) {
      setStatus("Product name required");
      return;
    }
    const priceCents = Math.round(Number(productForm.price || "0") * 100);
    const stock = Math.max(0, Math.floor(Number(productForm.stock || "0")));
    const res = await api.upsertProduct({
      id: "",
      name,
      description: "",
      sku: productForm.sku.trim(),
      price_cents: Number.isFinite(priceCents) ? priceCents : 0,
      quantity_in_stock: Number.isFinite(stock) ? stock : 0,
      updated_at: 0,
    });
    if (!res.success) {
      setStatus(res.error);
      return;
    }
    setProductForm({ name: "", price: "", stock: "0", sku: "" });
    await refreshMeta();
  };

  const removeProduct = async (id: string) => {
    await api.deleteProduct(id);
    await refreshMeta();
  };

  const linkCustomerFromThread = async () => {
    if (!selectedId || selectedId.startsWith("group:")) {
      setStatus("Select a DM thread first");
      return;
    }
    const res = await api.ensureCustomerForThread(
      selectedId,
      threadTitle(selectedId, contacts, groups),
    );
    if (!res.success) {
      setStatus(res.error);
      return;
    }
    setStatus(`Customer linked: ${res.data.display_name || res.data.thread_id}`);
    await refreshMeta();
    setPanel("customers");
  };

  const removeCustomer = async (id: string) => {
    await api.deleteCustomer(id);
    await refreshMeta();
  };

  const placeOrder = async () => {
    if (!selectedId || selectedId.startsWith("group:")) {
      setStatus("Select a DM thread to place an order");
      return;
    }
    const qty = Math.max(1, Math.floor(Number(orderQty) || 1));
    const pid = orderProductId || products[0]?.id;
    if (!pid) {
      setStatus("Add a product first");
      return;
    }
    const res = await api.createOrder(selectedId, [{ productId: pid, quantity: qty }]);
    if (!res.success) {
      setStatus(res.error);
      return;
    }
    setStatus(`Order ${res.data.id.slice(0, 8)} created — $${(res.data.total_cents / 100).toFixed(2)}`);
    await refreshMeta();
    setPanel("orders");
  };

  const markOrderPaid = async (id: string) => {
    const res = await api.setOrderStatus(id, "paid");
    if (!res.success) setStatus(res.error);
    await refreshMeta();
  };

  const sendInvoice = async (id: string) => {
    const res = await api.sendOrderInvoice(id);
    if (!res.success) setStatus(res.error);
    else setStatus("Invoice queued to Signal outbox");
    if (selectedId) await refreshMessages(selectedId);
  };

  const tone = healthTone(health);
  const title = selectedId ? threadTitle(selectedId, contacts, groups) : "SignalX";

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">
          <span className="brand-mark">SignalX</span>
          <span className={`health health-${tone}`} title={healthLabel(health)} />
        </div>

        <label className="field-label">Account</label>
        <div className="account-label" title={accountNumber ?? undefined}>
          {accountNumber ?? "Not configured"}
        </div>

        <div className={`ai-pill ${ai?.configured && ai.ollama_reachable ? "ok" : "warn"}`}>
          {ai?.configured
            ? ai.ollama_reachable
              ? `AI · ${ai.ollama_model || "ollama"}`
              : "AI · unreachable"
            : "AI · not configured"}
        </div>

        {autoSettings?.enabled && (
          <div className="auto-global-banner">Auto-reply ON</div>
        )}
        {ivrSettings?.enabled && (
          <div className="auto-global-banner">IVR menu ON</div>
        )}

        <nav className="nav">
          {(
            [
              ["threads", "Messages"],
              ["search", "Search"],
              ["contacts", "Contacts"],
              ["groups", "Groups"],
              ["products", "Products"],
              ["customers", "Customers"],
              ["orders", "Orders"],
              ["audit", "Auto-reply log"],
              ["settings", "Settings"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={panel === id ? "nav-btn active" : "nav-btn"}
              onClick={() => setPanel(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="rail-foot">
          <button
            type="button"
            className="ghost-btn"
            onClick={() => void api.exportAccount("json").then((r) => setStatus(errMsg(r) || "Account exported"))}
          >
            Export account
          </button>
        </div>
      </aside>

      {panel === "threads" && (
        <section className="thread-col">
          <header className="col-head">Threads</header>
          <div className="thread-list">
            {threads.length === 0 && (
              <p className="empty">No threads yet. Waiting for Signal traffic…</p>
            )}
            {threads.map((t) => (
              <button
                key={t.id}
                type="button"
                className={selectedId === t.id ? "thread-row active" : "thread-row"}
                onClick={() => {
                  setSelectedId(t.id);
                  setPanel("threads");
                }}
              >
                <div className="thread-row-top">
                  <span className="thread-name">{threadTitle(t.id, contacts, groups)}</span>
                  <span className="thread-time">{fmtTime(t.last_message_timestamp)}</span>
                </div>
                <div className="thread-row-meta">
                  {t.unread_count > 0 && <span className="badge">{t.unread_count}</span>}
                  {t.outbox_count > 0 && <span className="badge muted">{t.outbox_count} pending</span>}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {panel === "search" && (
        <section className="thread-col">
          <header className="col-head">Search</header>
          <div className="search-box">
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void onSearch()}
              placeholder="Search messages…"
            />
            <button type="button" onClick={() => void onSearch()}>
              Go
            </button>
          </div>
          <div className="thread-list">
            {searchHits.map((h) => (
              <button
                key={`${h.thread_id}-${h.message_id}`}
                type="button"
                className="thread-row"
                onClick={() => {
                  setSelectedId(h.thread_id);
                  setPanel("threads");
                }}
              >
                <div className="thread-row-top">
                  <span className="thread-name">{threadTitle(h.thread_id, contacts, groups)}</span>
                  <span className="thread-time">{fmtTime(h.timestamp)}</span>
                </div>
                <div className="snippet">{h.snippet}</div>
              </button>
            ))}
          </div>
        </section>
      )}

      {panel === "contacts" && (
        <section className="thread-col">
          <header className="col-head">Contacts</header>
          <div className="thread-list">
            {contacts.map((c) => (
              <button
                key={c.contact_id}
                type="button"
                className="thread-row"
                onClick={() => {
                  const tid = c.contact_id.startsWith("dm:")
                    ? c.contact_id
                    : `dm:${c.contact_id}`;
                  setSelectedId(tid);
                  setPanel("threads");
                }}
              >
                <div className="thread-row-top">
                  <span className="thread-name">
                    {c.display_name || c.alias || c.contact_id}
                  </span>
                  {c.auto_reply_enabled && <span className="badge danger">Auto</span>}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {panel === "groups" && (
        <section className="thread-col">
          <header className="col-head">Groups</header>
          <div className="thread-list">
            {groups.map((g) => (
              <button
                key={g.group_id}
                type="button"
                className="thread-row"
                onClick={() => {
                  setSelectedId(g.group_id.startsWith("group:") ? g.group_id : `group:${g.group_id}`);
                  setPanel("threads");
                }}
              >
                <div className="thread-row-top">
                  <span className="thread-name">{g.display_name || g.group_id}</span>
                  {g.auto_reply_enabled && <span className="badge danger">Auto</span>}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {panel === "products" && (
        <section className="thread-col wide">
          <header className="col-head">Products</header>
          <div className="settings-body">
            <div className="product-form">
              <input
                placeholder="Name"
                value={productForm.name}
                onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))}
              />
              <input
                placeholder="Price (USD)"
                value={productForm.price}
                onChange={(e) => setProductForm((f) => ({ ...f, price: e.target.value }))}
              />
              <input
                placeholder="Stock"
                value={productForm.stock}
                onChange={(e) => setProductForm((f) => ({ ...f, stock: e.target.value }))}
              />
              <input
                placeholder="SKU"
                value={productForm.sku}
                onChange={(e) => setProductForm((f) => ({ ...f, sku: e.target.value }))}
              />
              <button type="button" className="send-btn" onClick={() => void saveProduct()}>
                Add product
              </button>
            </div>
            <div className="thread-list">
              {products.map((p) => (
                <div key={p.id} className="thread-row product-row">
                  <div className="thread-row-top">
                    <span className="thread-name">{p.name}</span>
                    <span className="thread-time">
                      ${(p.price_cents / 100).toFixed(2)} · {p.quantity_in_stock} left
                    </span>
                  </div>
                  <div className="convo-sub">{p.sku || p.id.slice(0, 8)}</div>
                  <button type="button" className="ghost-btn" onClick={() => void removeProduct(p.id)}>
                    Delete
                  </button>
                </div>
              ))}
              {products.length === 0 && <p className="hint">No products yet — add one above.</p>}
            </div>
          </div>
        </section>
      )}

      {panel === "customers" && (
        <section className="thread-col">
          <header className="col-head">
            Customers
            <button type="button" className="ghost-btn" onClick={() => void linkCustomerFromThread()}>
              Link current chat
            </button>
          </header>
          <div className="thread-list">
            {customers.map((c) => (
              <button
                key={c.id}
                type="button"
                className="thread-row"
                onClick={() => {
                  setSelectedId(c.thread_id);
                  setPanel("threads");
                }}
              >
                <div className="thread-row-top">
                  <span className="thread-name">{c.display_name || c.thread_id}</span>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      void removeCustomer(c.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
                <div className="convo-sub">{c.thread_id}</div>
              </button>
            ))}
            {customers.length === 0 && (
              <p className="hint">Open a DM and use “Link current chat”.</p>
            )}
          </div>
        </section>
      )}

      {panel === "orders" && (
        <section className="thread-col wide">
          <header className="col-head">Orders</header>
          <div className="settings-body">
            <div className="product-form">
              <p className="hint">
                Creates an order for the selected DM, decrements stock, and can send an invoice
                over Signal.
              </p>
              <select
                value={orderProductId}
                onChange={(e) => setOrderProductId(e.target.value)}
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (${(p.price_cents / 100).toFixed(2)}, {p.quantity_in_stock} left)
                  </option>
                ))}
              </select>
              <input
                placeholder="Qty"
                value={orderQty}
                onChange={(e) => setOrderQty(e.target.value)}
              />
              <button type="button" className="send-btn" onClick={() => void placeOrder()}>
                Place order on current chat
              </button>
            </div>
            <div className="thread-list">
              {orders.map((o) => (
                <div key={o.id} className="thread-row product-row">
                  <div className="thread-row-top">
                    <span className="thread-name">
                      {o.id.slice(0, 8)} · {o.status}
                    </span>
                    <span className="thread-time">${(o.total_cents / 100).toFixed(2)}</span>
                  </div>
                  <div className="convo-sub">
                    {o.thread_id} · {o.lines.map((l) => `${l.name}×${l.quantity}`).join(", ")}
                  </div>
                  <div className="row-actions">
                    <button type="button" className="ghost-btn" onClick={() => void sendInvoice(o.id)}>
                      Send invoice
                    </button>
                    {o.status !== "paid" && (
                      <button type="button" className="ghost-btn" onClick={() => void markOrderPaid(o.id)}>
                        Mark paid
                      </button>
                    )}
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
              {orders.length === 0 && <p className="hint">No orders yet.</p>}
            </div>
          </div>
        </section>
      )}

      {panel === "audit" && (
        <section className="thread-col wide">
          <header className="col-head">Auto-reply audit</header>
          <div className="audit-list">
            {audit.length === 0 && <p className="empty">No auto-reply activity yet.</p>}
            {audit.map((e) => (
              <div key={e.id} className="audit-row">
                <div className="audit-top">
                  <span className={`outcome outcome-${e.outcome}`}>{e.outcome}</span>
                  <span className="thread-time">{fmtTime(e.created_at)}</span>
                </div>
                <div className="audit-thread">{e.thread_id}</div>
                <div className="snippet">{e.draft}</div>
                {e.reason && <div className="reason">{e.reason}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {panel === "settings" && (
        <section className="thread-col wide">
          <header className="col-head">Settings</header>
          <div className="settings-body">
            <h3>Auto-reply (global)</h3>
            <p className="hint">
              Off by default. Even when on, only allowlisted + opted-in threads can auto-send.
              Groups stay off unless explicitly enabled per thread.
            </p>
            {autoSettings && (
              <>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={autoSettings.enabled}
                    onChange={(e) => void saveAutoSettings({ enabled: e.target.checked })}
                  />
                  Master switch (kill-switch when off)
                </label>
                <label className="field-label">Max per thread / window</label>
                <input
                  type="number"
                  min={1}
                  value={autoSettings.max_per_thread_per_hour}
                  onChange={(e) =>
                    void saveAutoSettings({
                      max_per_thread_per_hour: Number(e.target.value) || 1,
                    })
                  }
                />
                <label className="field-label">Max global / window</label>
                <input
                  type="number"
                  min={1}
                  value={autoSettings.max_per_window}
                  onChange={(e) =>
                    void saveAutoSettings({ max_per_window: Number(e.target.value) || 1 })
                  }
                />
                <label className="field-label">Quiet hours start (0–23, blank = off)</label>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={autoSettings.quiet_hours_start ?? ""}
                  onChange={(e) =>
                    void saveAutoSettings({
                      quiet_hours_start: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
                <label className="field-label">Quiet hours end</label>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={autoSettings.quiet_hours_end ?? ""}
                  onChange={(e) =>
                    void saveAutoSettings({
                      quiet_hours_end: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
                <label className="field-label">Allowlist ({autoSettings.allowlist.length})</label>
                <pre className="allowlist">{autoSettings.allowlist.join("\n") || "(empty — nobody)"}</pre>
              </>
            )}

            <h3>Menu IVR (global)</h3>
            <p className="hint">
              Text menus over Signal. Off by default. Enable globally, then opt in per
              thread. Groups are never handled. Customer “3” hands off to you.
            </p>
            {ivrSettings && (
              <>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={ivrSettings.enabled}
                    onChange={(e) => void saveIvrSettings({ enabled: e.target.checked })}
                  />
                  Master switch
                </label>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={ivrSettings.require_allowlist}
                    onChange={(e) =>
                      void saveIvrSettings({ require_allowlist: e.target.checked })
                    }
                  />
                  Require per-thread allowlist
                </label>
                <label className="field-label">
                  IVR allowlist ({ivrSettings.allowlist.length})
                </label>
                <pre className="allowlist">
                  {ivrSettings.allowlist.join("\n") || "(empty — enable per thread)"}
                </pre>
              </>
            )}
          </div>
        </section>
      )}

      {(panel === "audit" || panel === "settings" || panel === "products" || panel === "orders") ? null : (
      <main className="convo">
        {!selectedId ? (
          <div className="convo-empty">
            <h1>SignalX</h1>
            <p>Select a thread to read and reply.</p>
          </div>
        ) : (
          <>
            <header className="convo-head">
              <div>
                <h2>{title}</h2>
                <div className="convo-sub">{selectedId}</div>
              </div>
              <div className="convo-actions">
                {threadAuto?.effective && (
                  <span className="auto-thread-badge">Auto-reply ON</span>
                )}
                {threadIvr?.effective && (
                  <span className="auto-thread-badge">IVR ON</span>
                )}
                {threadIvr?.handed_off && (
                  <span className="auto-thread-badge warn">Handed off</span>
                )}
                <label className="toggle compact">
                  <input
                    type="checkbox"
                    checked={!!threadIvr?.enabled}
                    disabled={!!selectedId?.startsWith("group:")}
                    onChange={(e) => void toggleThreadIvr(e.target.checked)}
                  />
                  Menu IVR
                </label>
                {threadIvr?.handed_off && (
                  <button type="button" className="ghost-btn" onClick={() => void resumeIvrBot()}>
                    Resume bot
                  </button>
                )}
                <label className="toggle compact">
                  <input
                    type="checkbox"
                    checked={!!threadAuto?.opted_in}
                    onChange={(e) => void toggleThreadAuto(e.target.checked)}
                  />
                  Opt-in auto
                </label>
                <button type="button" className="ghost-btn" disabled={aiBusy || !ai?.configured} onClick={() => void onSummarize()}>
                  Summarize
                </button>
                <button type="button" className="ghost-btn" disabled={aiBusy || !ai?.configured} onClick={() => void onDraft()}>
                  Draft reply
                </button>
                <button type="button" className="ghost-btn" onClick={() => void onExportThread()}>
                  Export
                </button>
              </div>
            </header>

            {summaryText && (
              <div className="summary-box">
                <div className="summary-head">
                  <strong>Summary</strong>
                  <button type="button" className="ghost-btn" onClick={() => setSummaryText(null)}>
                    Dismiss
                  </button>
                </div>
                <pre>{summaryText}</pre>
              </div>
            )}

            <div className="msg-scroll">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={isOutgoing(m) ? "bubble out" : "bubble in"}
                >
                  <div className="bubble-meta">
                    <span>{isOutgoing(m) ? "You" : m.sender}</span>
                    <span>{fmtTime(m.timestamp)}</span>
                  </div>
                  <div className="bubble-body">{m.content}</div>
                </div>
              ))}
              {outbox.map((o) => (
                <div key={o.id} className={`bubble out pending state-${o.state}`}>
                  <div className="bubble-meta">
                    <span>{o.state}</span>
                    <span>{fmtTime(o.created_at)}</span>
                  </div>
                  <div className="bubble-body">{o.content}</div>
                  {o.last_error && <div className="bubble-err">{o.last_error}</div>}
                  <div className="bubble-actions">
                    {o.state === "failed" && (
                      <button type="button" onClick={() => void onRetry(o.id)}>
                        Retry
                      </button>
                    )}
                    <button type="button" onClick={() => void onDeleteOutbox(o.id)}>
                      Discard
                    </button>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {status && <div className="status-bar">{status}</div>}

            <div className="composer">
              <textarea
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void onSend();
                  }
                }}
                placeholder="Write a message… (Enter to send, Shift+Enter for newline)"
                rows={3}
              />
              <button
                type="button"
                className="send-btn"
                disabled={sending || !composer.trim()}
                onClick={() => void onSend()}
              >
                {sending ? "…" : "Send"}
              </button>
            </div>
          </>
        )}
      </main>
      )}
    </div>
  );
}
