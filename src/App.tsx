import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  type DeviceLinkStatus,
  type DeviceLinkUri,
  type GroupMeta,
  type IvrSettings,
  type Message,
  type Order,
  type OutboxItem,
  type OutboxSummary,
  type Product,
  type ReceiveLoopState,
  type SearchResult,
  type ThreadAutoReplyStatus,
  type ThreadIvrStatus,
  type ThreadSummary,
} from "./api";
import { DeviceLinkQr } from "./DeviceLinkQr";
import { ProfileRail } from "./ProfileRail";
import {
  IconAudit,
  IconCatalog,
  IconContacts,
  IconCustomers,
  IconGroups,
  IconImage,
  IconMessages,
  IconOrders,
  IconOutbox,
  IconSearch,
  IconSettings,
} from "./navIcons";

type Panel =
  | "threads"
  | "search"
  | "contacts"
  | "groups"
  | "products"
  | "customers"
  | "orders"
  | "outbox"
  | "audit"
  | "settings";
type SettingsTab = "system" | "device" | "auto" | "ivr";

type SellPackRow = {
  key: string;
  label: string;
  amount: string;
  unit: string;
  price: string;
};

const UNIT_OPTIONS = ["ea", "g", "kg", "oz", "lb", "ml", "l"] as const;

function newPackRow(): SellPackRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    label: "",
    amount: "",
    unit: "oz",
    price: "",
  };
}

const NAV_ITEMS: { id: Panel; label: string; ico: ReactNode }[] = [
  { id: "threads", label: "Messages", ico: <IconMessages /> },
  { id: "search", label: "Search", ico: <IconSearch /> },
  { id: "contacts", label: "Contacts", ico: <IconContacts /> },
  { id: "groups", label: "Groups", ico: <IconGroups /> },
  { id: "products", label: "Catalog", ico: <IconCatalog /> },
  { id: "customers", label: "Customers", ico: <IconCustomers /> },
  { id: "orders", label: "Orders", ico: <IconOrders /> },
  { id: "outbox", label: "Outbox", ico: <IconOutbox /> },
  { id: "audit", label: "Auto-reply log", ico: <IconAudit /> },
  { id: "settings", label: "Settings", ico: <IconSettings /> },
];

function initials(label: string): string {
  const parts = label.replace(/^\+/, "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function needsDeviceSetup(
  diagnostics: Diagnostics | null,
  health: ReceiveLoopState | null,
  linkStatus: DeviceLinkStatus | null,
): boolean {
  if (linkStatus?.state === "success" && diagnostics?.number) return false;
  if (!diagnostics?.config_path) return true;
  if (!diagnostics?.number) return true;
  const blob = `${diagnostics.signal_cli_last_error ?? ""} ${health?.last_receive_error ?? ""}`;
  return /notregistered/i.test(blob);
}

/** Receive polls every ~2s; treat success older than this as stale. */
const HEALTH_OK_MS = 30_000;
const HEALTH_STALE_MS = 120_000;

function healthTone(s: ReceiveLoopState | null): "green" | "yellow" | "red" {
  if (!s) return "yellow";
  if (s.cooldown_until && s.cooldown_until > Date.now()) return "red";
  if (s.last_receive_error) return s.consecutive_failures > 3 ? "red" : "yellow";
  if (s.last_receive_ok_at) {
    const age = Date.now() - s.last_receive_ok_at;
    if (age <= HEALTH_OK_MS) return "green";
    if (age <= HEALTH_STALE_MS) return "yellow";
    return "red";
  }
  return "yellow";
}

function healthLabel(s: ReceiveLoopState | null): string {
  if (!s) return "Connecting…";
  if (s.cooldown_until && s.cooldown_until > Date.now()) return "Self-heal cooldown";
  if (s.last_receive_error) return s.last_receive_error.slice(0, 80);
  if (s.last_receive_ok_at) {
    const age = Date.now() - s.last_receive_ok_at;
    if (age <= HEALTH_OK_MS) return "Receive loop healthy";
    if (age <= HEALTH_STALE_MS) return "Receive loop quiet";
    return "Receive loop stale";
  }
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

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function productUnit(p: { unit?: string; base_unit?: string; sales_unit?: string }): string {
  const sales = (p.sales_unit || "").trim().toLowerCase();
  if (sales) return sales;
  const base = (p.base_unit || p.unit || "ea").trim().toLowerCase();
  return base || "ea";
}

function productBaseUnit(p: { unit?: string; base_unit?: string }): string {
  const base = (p.base_unit || p.unit || "ea").trim().toLowerCase();
  return base || "ea";
}

function productPriceLabel(p: Product): string {
  const base = productBaseUnit(p);
  return base === "ea" ? money(p.price_cents) : `${money(p.price_cents)}/${base}`;
}

function productStockLabel(p: Product): string {
  const milli = p.quantity_base_milli || 0;
  const base = productBaseUnit(p);
  const stockU = (p.stock_unit || "").trim().toLowerCase() || base;
  // Approximate display: prefer legacy whole units when milli unset
  if (!milli && p.quantity_in_stock != null) {
    return stockU === "ea"
      ? `${p.quantity_in_stock} left`
      : `${p.quantity_in_stock} ${stockU} left`;
  }
  const baseAmt = milli / 1000;
  // lightweight client display — server formats precisely in IVR
  if (stockU === base) {
    const shown =
      Math.abs(baseAmt - Math.round(baseAmt)) < 0.001
        ? String(Math.round(baseAmt))
        : baseAmt.toFixed(2);
    return `${shown} ${stockU} left`;
  }
  return `${baseAmt.toFixed(2)} ${base} left`;
}

function productWeightLabel(p: Product): string | null {
  if (!(p.weight > 0) || !p.weight_unit) return null;
  const w = Number.isInteger(p.weight) ? String(p.weight) : p.weight.toFixed(2);
  return `${w} ${p.weight_unit}`;
}

/** Normalize to E.164-ish (+digits). Returns null if invalid. */
function normalizePhoneInput(raw: string): string | null {
  const digits = raw.trim().replace(/[^\d+]/g, "");
  if (!digits.startsWith("+")) return null;
  const rest = digits.slice(1);
  if (rest.length < 7 || rest.length > 15 || !/^\d+$/.test(rest)) return null;
  return `+${rest}`;
}

async function fileToBase64(file: File): Promise<{ b64: string; ext: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsDataURL(file);
  });
  const b64 = dataUrl.includes(",") ? dataUrl.split(",")[1]! : dataUrl;
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  return { b64, ext };
}

function orderStatusTone(status: string): "ok" | "warn" | "danger" | "muted" {
  const s = status.toLowerCase();
  if (s === "paid" || s === "fulfilled" || s === "completed") return "ok";
  if (s === "cancelled" || s === "canceled" || s === "failed") return "danger";
  if (s === "invoiced" || s === "sent" || s === "pending" || s === "confirmed") return "warn";
  return "muted";
}

function ivrInactiveReason(ivr: ThreadIvrStatus | null): string | null {
  if (!ivr || ivr.effective) return null;
  if (ivr.handed_off) return null;
  if (ivr.global_enabled === false) return "IVR armed · global switch is off";
  if (!ivr.enabled) return null;
  return "IVR armed · waiting to become effective";
}

function includesQ(hay: string, q: string): boolean {
  if (!q.trim()) return true;
  return hay.toLowerCase().includes(q.trim().toLowerCase());
}

export default function App() {
  const [panel, setPanel] = useState<Panel>("threads");
  const [accountNumber, setAccountNumber] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [health, setHealth] = useState<ReceiveLoopState | null>(null);
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [globalOutbox, setGlobalOutbox] = useState<OutboxItem[]>([]);
  const [outboxSummary, setOutboxSummary] = useState<OutboxSummary | null>(null);
  const [composer, setComposer] = useState("");
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [attachPreview, setAttachPreview] = useState<string | null>(null);
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
    id: "",
    name: "",
    description: "",
    price: "",
    cost: "",
    supplier: "",
    stock: "0",
    sku: "",
    baseUnit: "ea",
    stockUnit: "",
    salesUnit: "",
    weight: "",
    weightUnit: "g",
    imagePath: "",
  });
  const [sellPacks, setSellPacks] = useState<SellPackRow[]>([]);
  const [orderSellOptionId, setOrderSellOptionId] = useState("");
  const [productImageFile, setProductImageFile] = useState<File | null>(null);
  const [productImagePreview, setProductImagePreview] = useState<string | null>(null);
  const [clearProductImageFlag, setClearProductImageFlag] = useState(false);
  const [imageDragOver, setImageDragOver] = useState(false);
  const [newDmPhone, setNewDmPhone] = useState("");
  const [contactForm, setContactForm] = useState({ phone: "", name: "" });
  const [groupForm, setGroupForm] = useState({ name: "", members: "" });
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderProductId, setOrderProductId] = useState("");
  const [orderQty, setOrderQty] = useState("1");
  const [audit, setAudit] = useState<AutoReplyAuditEntry[]>([]);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkUri, setLinkUri] = useState<string | null>(null);
  const [linkStatus, setLinkStatus] = useState<DeviceLinkStatus | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("system");
  const [threadFilter, setThreadFilter] = useState({
    q: "",
    kind: "all" as "all" | "dm" | "group",
    unread: false,
    pending: false,
  });
  const [contactFilter, setContactFilter] = useState({
    q: "",
    favorites: false,
    hideMuted: false,
    autoOnly: false,
  });
  const [groupFilter, setGroupFilter] = useState({
    q: "",
    favorites: false,
    hideMuted: false,
    autoOnly: false,
  });
  const [productFilter, setProductFilter] = useState({
    q: "",
    stock: "all" as "all" | "in" | "out",
    unit: "all",
    hasImage: false,
  });
  const [customerFilter, setCustomerFilter] = useState({
    q: "",
    hasOrders: false,
  });
  const [orderFilter, setOrderFilter] = useState({
    q: "",
    status: "all",
    thisThread: false,
  });
  const [auditFilter, setAuditFilter] = useState({
    q: "",
    outcome: "all",
  });
  const bottomRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedId;

  const refreshThreads = async () => {
    const res = await api.getThreads();
    if (res.success) setThreads(res.data);
  };

  const refreshDiagnostics = async () => {
    const res = await api.getDiagnostics();
    if (res.success) setDiagnostics(res.data);
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
    setDiagnostics(d);
    setAccountNumber(d?.number ?? null);
    if (!d?.number) {
      setStatus("Not configured — set SIGNALX_NUMBER and SIGNALX_SIGNALCLI_CONFIG in .signalx.env");
    }
    setHealth(unwrap(recv, null as unknown as ReceiveLoopState));
    setAi(unwrap(aiStatus, null as unknown as AiStatus));
    await refreshThreads();
    await refreshMeta();
    await refreshGlobalOutbox();
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
          void refreshGlobalOutbox();
          const cur = selectedRef.current;
          if (cur) void refreshMessages(cur);
        }),
      );
      unsubs.push(
        await onEvent("outbox://item-updated", () => {
          void refreshGlobalOutbox();
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
      unsubs.push(
        await onEvent<DeviceLinkUri>("device-link://uri", (p) => {
          if (p.uri) setLinkUri(p.uri);
        }),
      );
      unsubs.push(
        await onEvent<DeviceLinkStatus>("device-link://status", (s) => {
          setLinkStatus(s);
          setLinkBusy(false);
          if (s.state === "success") {
            setStatus("Device linked — set SIGNALX_NUMBER if needed, then restart receive");
            void refreshDiagnostics();
          }
        }),
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
    if (!selectedId || sending) return;
    const text = composer.trim();
    if (!text && !attachFile) return;
    setSending(true);
    let res;
    if (attachFile) {
      try {
        const { b64, ext } = await fileToBase64(attachFile);
        res = await api.queueMessageWithAttachment(selectedId, text, b64, ext);
      } catch (e) {
        setSending(false);
        setStatus(`Attachment failed: ${String(e)}`);
        return;
      }
    } else {
      res = await api.queueMessage(selectedId, text);
    }
    setSending(false);
    if (!res.success) {
      setStatus(res.error);
      return;
    }
    setComposer("");
    setAttachFile(null);
    if (attachPreview) URL.revokeObjectURL(attachPreview);
    setAttachPreview(null);
    setStatus(null);
    await refreshMessages(selectedId);
    await refreshThreads();
    await refreshGlobalOutbox();
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

  const onSummarize = async (): Promise<string | null> => {
    if (!selectedId) return null;
    setAiBusy(true);
    setSummaryText(null);
    const res = await api.summarizeThread(selectedId);
    setAiBusy(false);
    if (res.success) {
      setSummaryText(res.data);
      return res.data;
    }
    setStatus(res.error);
    return null;
  };

  const onDraft = async (intent?: string) => {
    if (!selectedId) return;
    setAiBusy(true);
    const res = await api.draftReply(
      selectedId,
      intent?.trim() || "helpful concise reply",
      "do not auto-send",
    );
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
    if (res.success) {
      setIvrSettings(res.data);
      if (selectedId) {
        const st = await api.getThreadIvr(selectedId);
        if (st.success) setThreadIvr(st.data);
      }
    } else {
      setStatus(res.error);
    }
  };

  const addToAllowlist = async (kind: "ivr" | "auto", threadId: string | null) => {
    if (!threadId || threadId.startsWith("group:")) {
      setStatus("Select a DM thread first");
      return;
    }
    if (kind === "ivr") {
      if (!ivrSettings) return;
      if (ivrSettings.allowlist.includes(threadId)) {
        setStatus("Already on IVR allowlist");
        return;
      }
      await saveIvrSettings({ allowlist: [...ivrSettings.allowlist, threadId] });
      setStatus(`Added to IVR allowlist: ${threadTitle(threadId, contacts, groups)}`);
      return;
    }
    if (!autoSettings) return;
    if (autoSettings.allowlist.includes(threadId)) {
      setStatus("Already on auto-reply allowlist");
      return;
    }
    await saveAutoSettings({ allowlist: [...autoSettings.allowlist, threadId] });
    setStatus(`Added to auto-reply allowlist: ${threadTitle(threadId, contacts, groups)}`);
  };

  const removeFromAllowlist = async (kind: "ivr" | "auto", threadId: string) => {
    if (kind === "ivr") {
      if (!ivrSettings) return;
      await saveIvrSettings({
        allowlist: ivrSettings.allowlist.filter((t) => t !== threadId),
      });
      return;
    }
    if (!autoSettings) return;
    await saveAutoSettings({
      allowlist: autoSettings.allowlist.filter((t) => t !== threadId),
    });
  };

  const startDeviceLink = async () => {
    setLinkCopied(false);
    setLinkUri(null);
    setLinkStatus(null);
    setLinkBusy(true);
    const res = await api.startDeviceLink();
    if (!res.success) {
      setLinkBusy(false);
      setLinkStatus({ state: "error", message: res.error });
      setStatus(res.error);
      return;
    }
    setLinkStatus({ state: "waiting", message: "Waiting for phone scan…" });
  };

  const cancelDeviceLink = async () => {
    const res = await api.cancelDeviceLink();
    if (!res.success) {
      setStatus(res.error);
      setLinkBusy(false);
    }
  };

  const copyLinkUri = async () => {
    if (!linkUri) return;
    try {
      await navigator.clipboard.writeText(linkUri);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      setStatus("Could not copy URI — select and copy manually");
    }
  };

  const orderParty = (o: Order): string => {
    const cust = customers.find((c) => c.id === o.customer_id || c.thread_id === o.thread_id);
    if (cust?.display_name) return cust.display_name;
    return threadTitle(o.thread_id, contacts, groups);
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

  const emptyProductForm = () => ({
    id: "",
    name: "",
    description: "",
    price: "",
    cost: "",
    supplier: "",
    stock: "0",
    sku: "",
    baseUnit: "ea",
    stockUnit: "",
    salesUnit: "",
    weight: "",
    weightUnit: "g",
    imagePath: "",
  });

  const resetProductForm = () => {
    setProductForm(emptyProductForm());
    setSellPacks([]);
    setProductImageFile(null);
    setProductImagePreview(null);
    setClearProductImageFlag(false);
  };

  const applyProductImageFile = (file: File | null) => {
    setProductImageFile(file);
    setClearProductImageFlag(false);
    if (file) {
      const url = URL.createObjectURL(file);
      setProductImagePreview(url);
    }
  };

  const packsFromProduct = (p: Product): SellPackRow[] =>
    (p.sell_options || []).map((o) => ({
      key: o.id || newPackRow().key,
      label: o.label,
      amount: String(o.amount),
      unit: o.unit || "oz",
      price:
        o.price_cents != null && o.price_cents !== undefined
          ? (o.price_cents / 100).toFixed(2)
          : "",
    }));

  const sellOptionsFromPacks = (): Product["sell_options"] => {
    const out: Product["sell_options"] = [];
    for (const row of sellPacks) {
      const label = row.label.trim();
      if (!label && !row.amount.trim() && !row.price.trim()) continue;
      if (!label) throw new Error("Each sell pack needs a label");
      const amount = Number(row.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error(`Pack “${label}” needs a quantity > 0`);
      }
      let price_cents: number | null = null;
      if (row.price.trim()) {
        const dollars = Number(row.price);
        if (!Number.isFinite(dollars) || dollars < 0) {
          throw new Error(`Pack “${label}” has a bad custom price`);
        }
        price_cents = Math.round(dollars * 100);
      }
      out.push({
        id: "",
        label,
        amount,
        unit: row.unit || "oz",
        price_cents,
      });
    }
    return out;
  };

  const saveProduct = async () => {
    const name = productForm.name.trim();
    if (!name) {
      setStatus("Product name required");
      return;
    }
    const priceCents = Math.round(Number(productForm.price || "0") * 100);
    const costCents = Math.round(Number(productForm.cost || "0") * 100);
    const stock = Number(productForm.stock || "0");
    if (!Number.isFinite(stock) || stock < 0) {
      setStatus("Stock must be a number ≥ 0");
      return;
    }
    const weightRaw = productForm.weight.trim();
    const weight = weightRaw === "" ? 0 : Number(weightRaw);
    if (!Number.isFinite(weight) || weight < 0) {
      setStatus("Weight must be a number ≥ 0");
      return;
    }
    let sell_options: Product["sell_options"] = [];
    try {
      sell_options = sellOptionsFromPacks();
    } catch (e) {
      setStatus(String(e));
      return;
    }
    const res = await api.upsertProduct({
      id: productForm.id,
      name,
      description: productForm.description.trim(),
      sku: productForm.sku.trim(),
      price_cents: Number.isFinite(priceCents) ? priceCents : 0,
      cost_cents: Number.isFinite(costCents) ? costCents : 0,
      supplier: productForm.supplier.trim(),
      base_unit: productForm.baseUnit || "ea",
      stock_unit: productForm.stockUnit.trim(),
      sales_unit: productForm.salesUnit.trim(),
      quantity_base_milli: 0,
      quantity_in_stock: 0,
      stock_qty: stock,
      unit: productForm.baseUnit || "ea",
      weight,
      weight_unit: weight > 0 ? productForm.weightUnit || "g" : "",
      image_path: "",
      sell_options,
      updated_at: 0,
    });
    if (!res.success) {
      setStatus(res.error);
      return;
    }
    let product = res.data;
    // If stock was fractional, re-upsert with milli via stock amount in stock_unit:
    // backend already converted quantity_in_stock through stock_unit when milli was 0.
    if (clearProductImageFlag && product.id) {
      const cleared = await api.clearProductImage(product.id);
      if (cleared.success) product = cleared.data;
      else setStatus(cleared.error);
    } else if (productImageFile && product.id) {
      try {
        const { b64, ext } = await fileToBase64(productImageFile);
        const img = await api.setProductImage(product.id, b64, ext);
        if (img.success) product = img.data;
        else setStatus(img.error);
      } catch (e) {
        setStatus(`Image upload failed: ${String(e)}`);
      }
    }
    resetProductForm();
    setStatus(productForm.id ? `Updated ${product.name}` : `Added ${product.name}`);
    await refreshMeta();
  };

  const editProduct = async (p: Product) => {
    const stockU = (p.stock_unit || p.base_unit || p.unit || "ea").trim();
    // Prefer server floor stock_in_unit via quantity_in_stock; for weight use milli→approx in stock unit
    let stockAmt = String(p.quantity_in_stock ?? 0);
    if (p.quantity_base_milli > 0 && stockU) {
      // Show milli/1000 when stock unit == base; otherwise keep quantity_in_stock floor
      const base = (p.base_unit || p.unit || "ea").trim();
      if (stockU === base) {
        const v = p.quantity_base_milli / 1000;
        stockAmt = Math.abs(v - Math.round(v)) < 0.001 ? String(Math.round(v)) : v.toFixed(3);
      }
    }
    setProductForm({
      id: p.id,
      name: p.name,
      description: p.description || "",
      price: (p.price_cents / 100).toFixed(2),
      cost: ((p.cost_cents || 0) / 100).toFixed(2),
      supplier: p.supplier || "",
      stock: stockAmt,
      sku: p.sku || "",
      baseUnit: p.base_unit || p.unit || "ea",
      stockUnit: p.stock_unit || "",
      salesUnit: p.sales_unit || "",
      weight: p.weight > 0 ? String(p.weight) : "",
      weightUnit: p.weight_unit || "g",
      imagePath: p.image_path || "",
    });
    setSellPacks(packsFromProduct(p));
    setProductImageFile(null);
    setClearProductImageFlag(false);
    setProductImagePreview(null);
    if (p.image_path) {
      const img = await api.getProductImage(p.id);
      if (img.success) {
        setProductImagePreview(`data:${img.data.mime};base64,${img.data.bytes_base64}`);
      }
    }
    setStatus(`Editing ${p.name}`);
  };

  const openNewDm = async () => {
    const phone = normalizePhoneInput(newDmPhone);
    if (!phone) {
      setStatus("Enter a phone as +E164 (e.g. +15551234567)");
      return;
    }
    const tid = `dm:${phone}`;
    await api.setContactMeta(tid, {});
    setSelectedId(tid);
    setPanel("threads");
    setNewDmPhone("");
    setStatus(`Compose to ${phone}`);
    await refreshMeta();
    await refreshThreads();
  };

  const addContact = async () => {
    const phone = normalizePhoneInput(contactForm.phone);
    if (!phone) {
      setStatus("Contact phone must be +E164 (e.g. +15551234567)");
      return;
    }
    const tid = `dm:${phone}`;
    const res = await api.setContactMeta(tid, {
      display_name: contactForm.name.trim() || null,
    });
    if (!res.success) {
      setStatus(res.error);
      return;
    }
    setContactForm({ phone: "", name: "" });
    setStatus(`Contact saved: ${res.data.display_name || phone}`);
    await refreshMeta();
  };

  const createGroup = async () => {
    const name = groupForm.name.trim();
    if (!name) {
      setStatus("Group name required");
      return;
    }
    const members = groupForm.members
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (members.length === 0) {
      setStatus("Add at least one member phone (+E164)");
      return;
    }
    const res = await api.createSignalGroup(name, members);
    if (!res.success) {
      setStatus(res.error);
      return;
    }
    setGroupForm({ name: "", members: "" });
    setSelectedId(res.data.thread_id);
    setPanel("threads");
    setStatus(`Group created: ${name}`);
    await refreshMeta();
    await refreshThreads();
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
    const pid = orderProductId || products[0]?.id;
    if (!pid) {
      setStatus("Add a product first");
      return;
    }
    const product = products.find((p) => p.id === pid);
    const sellOpt = orderSellOptionId
      ? product?.sell_options?.find((o) => o.id === orderSellOptionId)
      : undefined;
    const qty = sellOpt
      ? sellOpt.amount
      : Math.max(0.001, Number(orderQty) || 1);
    const unit = sellOpt
      ? sellOpt.unit
      : productUnit(product || { unit: "ea" });
    const res = await api.createOrder(selectedId, [
      {
        productId: pid,
        quantity: qty,
        unit,
        sellOptionId: sellOpt?.id,
      },
    ]);
    if (!res.success) {
      setStatus(res.error);
      return;
    }
    setStatus(`Order ${res.data.id.slice(0, 8)} created — $${(res.data.total_cents / 100).toFixed(2)}`);
    await refreshMeta();
    setPanel("orders");
  };

  const refreshGlobalOutbox = async () => {
    const [list, sum] = await Promise.all([api.listOutbox(), api.getOutboxSummary()]);
    if (list.success) {
      setGlobalOutbox(
        list.data
          .filter((i) => i.state !== "sent")
          .sort((a, b) => b.created_at - a.created_at),
      );
    }
    if (sum.success) setOutboxSummary(sum.data);
  };

  const setOrderLifecycle = async (id: string, status: string) => {
    const res = await api.setOrderStatus(id, status);
    if (!res.success) setStatus(res.error);
    else setStatus(`Order → ${status}`);
    await refreshMeta();
  };

  const sendInvoice = async (id: string) => {
    const res = await api.sendOrderInvoice(id);
    if (!res.success) setStatus(res.error);
    else setStatus("Invoice queued to Signal outbox");
    if (selectedId) await refreshMessages(selectedId);
  };

  useEffect(() => {
    if (panel === "outbox") void refreshGlobalOutbox();
  }, [panel]);

  const tone = healthTone(health);
  const title = selectedId ? threadTitle(selectedId, contacts, groups) : "SignalX";
  const showProfileRail = panel === "threads" && !!selectedId;
  const profileContact = selectedId
    ? contacts.find((c) => {
        const raw = selectedId.replace(/^dm:/, "");
        return (
          c.contact_id === selectedId ||
          c.contact_id === raw ||
          c.contact_id === `dm:${raw}`
        );
      }) ?? null
    : null;
  const profileCustomer = selectedId
    ? customers.find((c) => c.thread_id === selectedId) ?? null
    : null;
  const ivrHint = ivrInactiveReason(threadIvr);

  const filteredThreads = useMemo(() => {
    return threads.filter((t) => {
      if (threadFilter.kind === "dm" && t.id.startsWith("group:")) return false;
      if (threadFilter.kind === "group" && !t.id.startsWith("group:")) return false;
      if (threadFilter.unread && t.unread_count <= 0) return false;
      if (threadFilter.pending && t.outbox_count <= 0) return false;
      const label = threadTitle(t.id, contacts, groups);
      return includesQ(`${label} ${t.id}`, threadFilter.q);
    });
  }, [threads, threadFilter, contacts, groups]);

  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      if (contactFilter.favorites && !c.favorite) return false;
      if (contactFilter.hideMuted && c.muted) return false;
      if (contactFilter.autoOnly && !c.auto_reply_enabled) return false;
      return includesQ(
        `${c.display_name || ""} ${c.alias || ""} ${c.contact_id}`,
        contactFilter.q,
      );
    });
  }, [contacts, contactFilter]);

  const filteredGroups = useMemo(() => {
    return groups.filter((g) => {
      if (groupFilter.favorites && !g.favorite) return false;
      if (groupFilter.hideMuted && g.muted) return false;
      if (groupFilter.autoOnly && !g.auto_reply_enabled) return false;
      return includesQ(`${g.display_name || ""} ${g.group_id}`, groupFilter.q);
    });
  }, [groups, groupFilter]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (productFilter.stock === "in" && p.quantity_in_stock <= 0) return false;
      if (productFilter.stock === "out" && p.quantity_in_stock > 0) return false;
      if (productFilter.unit !== "all" && productUnit(p) !== productFilter.unit) return false;
      if (productFilter.hasImage && !p.image_path) return false;
      return includesQ(
        `${p.name} ${p.sku} ${p.description} ${p.unit}`,
        productFilter.q,
      );
    });
  }, [products, productFilter]);

  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      const orderCount = orders.filter(
        (o) => o.customer_id === c.id || o.thread_id === c.thread_id,
      ).length;
      if (customerFilter.hasOrders && orderCount === 0) return false;
      return includesQ(`${c.display_name} ${c.thread_id} ${c.notes}`, customerFilter.q);
    });
  }, [customers, customerFilter, orders]);

  const filteredOrders = useMemo(() => {
    return [...orders]
      .sort((a, b) => b.created_at - a.created_at)
      .filter((o) => {
        if (orderFilter.status !== "all" && o.status !== orderFilter.status) return false;
        if (orderFilter.thisThread && selectedId && o.thread_id !== selectedId) return false;
        const party = threadTitle(o.thread_id, contacts, groups);
        const lines = o.lines.map((l) => l.name).join(" ");
        return includesQ(`${party} ${o.id} ${o.status} ${lines} ${o.thread_id}`, orderFilter.q);
      });
  }, [orders, orderFilter, selectedId, contacts, groups]);

  const filteredAudit = useMemo(() => {
    return audit.filter((e) => {
      if (auditFilter.outcome !== "all" && e.outcome !== auditFilter.outcome) return false;
      return includesQ(
        `${e.thread_id} ${e.outcome} ${e.draft} ${e.reason || ""}`,
        auditFilter.q,
      );
    });
  }, [audit, auditFilter]);

  const orderStatuses = useMemo(() => {
    const set = new Set(orders.map((o) => o.status).filter(Boolean));
    return ["all", ...Array.from(set).sort()];
  }, [orders]);

  const auditOutcomes = useMemo(() => {
    const set = new Set(audit.map((e) => e.outcome).filter(Boolean));
    return ["all", ...Array.from(set).sort()];
  }, [audit]);

  const productUnits = useMemo(() => {
    const set = new Set(products.map((p) => productUnit(p)));
    return ["all", ...Array.from(set).sort()];
  }, [products]);

  const setupNeeded = useMemo(
    () => needsDeviceSetup(diagnostics, health, linkStatus),
    [diagnostics, health, linkStatus],
  );

  const openDeviceLinkSetup = () => {
    setPanel("settings");
    setSettingsTab("device");
  };

  return (
    <div className={showProfileRail ? "shell shell-with-profile" : "shell"}>
      <aside className="rail">
        <div className="brand">
          <span className="brand-mark">SignalX</span>
          <span className={`health health-${tone}`} title={healthLabel(health)} />
        </div>

        <label className="field-label">Account</label>
        <div className="account-label" title={accountNumber ?? undefined}>
          {accountNumber ?? "Not configured"}
        </div>

        {setupNeeded && (
          <div className="setup-banner">
            <p>Link this Mac to start receiving Signal messages.</p>
            <button type="button" className="action-btn primary" onClick={openDeviceLinkSetup}>
              Open device link
            </button>
          </div>
        )}

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
          <div className="auto-global-banner ivr">IVR menu ON</div>
        )}

        <nav className="nav">
          {NAV_ITEMS.map(({ id, label, ico }) => (
            <button
              key={id}
              type="button"
              className={panel === id ? "nav-btn active" : "nav-btn"}
              onClick={() => {
                setPanel(id);
                if (id === "settings" && setupNeeded) setSettingsTab("device");
              }}
            >
              <span className="nav-btn-label">
                <span className="nav-ico" aria-hidden>
                  {ico}
                </span>
                <span>{label}</span>
              </span>
              {id === "orders" && orders.length > 0 && (
                <span className="nav-count">{orders.length}</span>
              )}
              {id === "outbox" &&
                outboxSummary &&
                outboxSummary.queued + outboxSummary.sending + outboxSummary.failed > 0 && (
                  <span className="nav-count">
                    {outboxSummary.failed > 0
                      ? outboxSummary.failed
                      : outboxSummary.queued + outboxSummary.sending}
                  </span>
                )}
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
          <div className="compose-strip">
            <input
              placeholder="New message — +15551234567"
              value={newDmPhone}
              onChange={(e) => setNewDmPhone(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void openNewDm()}
            />
            <button type="button" className="send-btn" onClick={() => void openNewDm()}>
              Open
            </button>
          </div>
          <div className="filter-strip">
            <input
              placeholder="Filter threads…"
              value={threadFilter.q}
              onChange={(e) => setThreadFilter((f) => ({ ...f, q: e.target.value }))}
            />
            <select
              aria-label="Thread type"
              value={threadFilter.kind}
              onChange={(e) =>
                setThreadFilter((f) => ({
                  ...f,
                  kind: e.target.value as "all" | "dm" | "group",
                }))
              }
            >
              <option value="all">All types</option>
              <option value="dm">DMs</option>
              <option value="group">Groups</option>
            </select>
            <label className="filter-check">
              <input
                type="checkbox"
                checked={threadFilter.unread}
                onChange={(e) => setThreadFilter((f) => ({ ...f, unread: e.target.checked }))}
              />
              Unread
            </label>
            <label className="filter-check">
              <input
                type="checkbox"
                checked={threadFilter.pending}
                onChange={(e) => setThreadFilter((f) => ({ ...f, pending: e.target.checked }))}
              />
              Pending
            </label>
            <span className="col-meta">
              {filteredThreads.length}/{threads.length}
            </span>
          </div>
          <div className="thread-list">
            {threads.length === 0 && (
              <p className="empty">No threads yet — open a chat above or wait for Signal traffic.</p>
            )}
            {threads.length > 0 && filteredThreads.length === 0 && (
              <p className="empty">No threads match these filters.</p>
            )}
            {filteredThreads.map((t) => (
              <button
                key={t.id}
                type="button"
                className={selectedId === t.id ? "thread-row active" : "thread-row"}
                onClick={() => {
                  setSelectedId(t.id);
                  setPanel("threads");
                }}
              >
                <span className="avatar-dot" aria-hidden>
                  {initials(threadTitle(t.id, contacts, groups))}
                </span>
                <div className="thread-row-body">
                  <div className="thread-row-top">
                    <span className="thread-name">{threadTitle(t.id, contacts, groups)}</span>
                    <span className="thread-time">{fmtTime(t.last_message_timestamp)}</span>
                  </div>
                  <div className="thread-row-meta">
                    {t.unread_count > 0 && <span className="badge">{t.unread_count}</span>}
                    {t.outbox_count > 0 && <span className="badge muted">{t.outbox_count} pending</span>}
                  </div>
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
                <span className="avatar-dot" aria-hidden>
                  {initials(threadTitle(h.thread_id, contacts, groups))}
                </span>
                <div className="thread-row-body">
                  <div className="thread-row-top">
                    <span className="thread-name">{threadTitle(h.thread_id, contacts, groups)}</span>
                    <span className="thread-time">{fmtTime(h.timestamp)}</span>
                  </div>
                  <div className="snippet">{h.snippet}</div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {panel === "contacts" && (
        <section className="thread-col">
          <header className="col-head">Contacts</header>
          <div className="pane-section">
            <h3 className="pane-section-title">Create new contact</h3>
            <div className="compose-strip stacked" style={{ border: 0, padding: 0 }}>
              <input
                placeholder="+15551234567"
                value={contactForm.phone}
                onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))}
              />
              <input
                placeholder="Display name (optional)"
                value={contactForm.name}
                onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && void addContact()}
              />
              <button type="button" className="send-btn" onClick={() => void addContact()}>
                Add contact
              </button>
            </div>
          </div>
          {contacts.length > 0 && (
            <div className="pane-section">
              <h3 className="pane-section-title">Manage contacts</h3>
              <div className="filter-strip" style={{ border: 0, padding: 0 }}>
                <input
                  placeholder="Filter contacts…"
                  value={contactFilter.q}
                  onChange={(e) => setContactFilter((f) => ({ ...f, q: e.target.value }))}
                />
                <label className="filter-check">
                  <input
                    type="checkbox"
                    checked={contactFilter.favorites}
                    onChange={(e) => setContactFilter((f) => ({ ...f, favorites: e.target.checked }))}
                  />
                  Favorites
                </label>
                <label className="filter-check">
                  <input
                    type="checkbox"
                    checked={contactFilter.hideMuted}
                    onChange={(e) => setContactFilter((f) => ({ ...f, hideMuted: e.target.checked }))}
                  />
                  Hide muted
                </label>
                <label className="filter-check">
                  <input
                    type="checkbox"
                    checked={contactFilter.autoOnly}
                    onChange={(e) => setContactFilter((f) => ({ ...f, autoOnly: e.target.checked }))}
                  />
                  Auto-reply
                </label>
                <span className="col-meta">
                  {filteredContacts.length}/{contacts.length}
                </span>
              </div>
            </div>
          )}
          <div className="thread-list">
            {contacts.length === 0 && (
              <p className="empty">No contacts yet — add one above.</p>
            )}
            {contacts.length > 0 && filteredContacts.length === 0 && (
              <p className="empty">No contacts match these filters.</p>
            )}
            {filteredContacts.map((c) => (
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
                <span className="avatar-dot" aria-hidden>
                  {initials(c.display_name || c.alias || c.contact_id)}
                </span>
                <div className="thread-row-body">
                  <div className="thread-row-top">
                    <span className="thread-name">
                      {c.display_name || c.alias || c.contact_id}
                    </span>
                    {c.auto_reply_enabled && <span className="badge danger">Auto</span>}
                  </div>
                  <div className="convo-sub">{c.contact_id}</div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {panel === "groups" && (
        <section className="thread-col">
          <header className="col-head">Groups</header>
          <div className="compose-strip stacked">
            <p className="hint tight">
              Creates a real Signal group via signal-cli. Members must be +E164 numbers.
            </p>
            <input
              placeholder="Group name"
              value={groupForm.name}
              onChange={(e) => setGroupForm((f) => ({ ...f, name: e.target.value }))}
            />
            <input
              placeholder="Members +1555…, +1444…"
              value={groupForm.members}
              onChange={(e) => setGroupForm((f) => ({ ...f, members: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && void createGroup()}
            />
            <button type="button" className="send-btn" onClick={() => void createGroup()}>
              Create group
            </button>
          </div>
          <div className="filter-strip">
            <input
              placeholder="Filter groups…"
              value={groupFilter.q}
              onChange={(e) => setGroupFilter((f) => ({ ...f, q: e.target.value }))}
            />
            <label className="filter-check">
              <input
                type="checkbox"
                checked={groupFilter.favorites}
                onChange={(e) => setGroupFilter((f) => ({ ...f, favorites: e.target.checked }))}
              />
              Favorites
            </label>
            <label className="filter-check">
              <input
                type="checkbox"
                checked={groupFilter.hideMuted}
                onChange={(e) => setGroupFilter((f) => ({ ...f, hideMuted: e.target.checked }))}
              />
              Hide muted
            </label>
            <label className="filter-check">
              <input
                type="checkbox"
                checked={groupFilter.autoOnly}
                onChange={(e) => setGroupFilter((f) => ({ ...f, autoOnly: e.target.checked }))}
              />
              Auto-reply
            </label>
            <span className="col-meta">
              {filteredGroups.length}/{groups.length}
            </span>
          </div>
          <div className="thread-list">
            {groups.length === 0 && (
              <p className="empty">No groups yet — create one above.</p>
            )}
            {groups.length > 0 && filteredGroups.length === 0 && (
              <p className="empty">No groups match these filters.</p>
            )}
            {filteredGroups.map((g) => (
              <button
                key={g.group_id}
                type="button"
                className="thread-row"
                onClick={() => {
                  setSelectedId(g.group_id.startsWith("group:") ? g.group_id : `group:${g.group_id}`);
                  setPanel("threads");
                }}
              >
                <span className="avatar-dot" aria-hidden>
                  {initials(g.display_name || g.group_id)}
                </span>
                <div className="thread-row-body">
                  <div className="thread-row-top">
                    <span className="thread-name">{g.display_name || g.group_id}</span>
                    {g.auto_reply_enabled && <span className="badge danger">Auto</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {panel === "products" && (
        <section className="thread-col wide">
          <header className="col-head">
            Catalog
            <span className="col-meta">
              {filteredProducts.length}/{products.length} products
            </span>
          </header>
          <div className="settings-body">
            <div className="filter-strip in-panel">
              <input
                placeholder="Filter catalog…"
                value={productFilter.q}
                onChange={(e) => setProductFilter((f) => ({ ...f, q: e.target.value }))}
              />
              <select
                aria-label="Stock filter"
                value={productFilter.stock}
                onChange={(e) =>
                  setProductFilter((f) => ({
                    ...f,
                    stock: e.target.value as "all" | "in" | "out",
                  }))
                }
              >
                <option value="all">All stock</option>
                <option value="in">In stock</option>
                <option value="out">Out of stock</option>
              </select>
              <select
                aria-label="Unit filter"
                value={productFilter.unit}
                onChange={(e) => setProductFilter((f) => ({ ...f, unit: e.target.value }))}
              >
                {productUnits.map((u) => (
                  <option key={u} value={u}>
                    {u === "all" ? "All units" : `Unit: ${u}`}
                  </option>
                ))}
              </select>
              <label className="filter-check">
                <input
                  type="checkbox"
                  checked={productFilter.hasImage}
                  onChange={(e) => setProductFilter((f) => ({ ...f, hasImage: e.target.checked }))}
                />
                Has image
              </label>
            </div>
            <div className="product-form">
              <div className="form-card">
                <h3 className="form-card-title">
                  {productForm.id ? "Edit product" : "New product"} — Basic details
                </h3>
                <input
                  placeholder="Product name"
                  value={productForm.name}
                  onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))}
                />
                <textarea
                  className="product-desc"
                  placeholder="Short description for operators and invoices (optional)"
                  rows={2}
                  value={productForm.description}
                  onChange={(e) => setProductForm((f) => ({ ...f, description: e.target.value }))}
                />
                <input
                  placeholder="Supplier / source (optional)"
                  value={productForm.supplier}
                  onChange={(e) => setProductForm((f) => ({ ...f, supplier: e.target.value }))}
                />
                <label
                  className={`dropzone ${imageDragOver ? "dragover" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setImageDragOver(true);
                  }}
                  onDragLeave={() => setImageDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setImageDragOver(false);
                    const file = e.dataTransfer.files?.[0] || null;
                    if (file && file.type.startsWith("image/")) applyProductImageFile(file);
                  }}
                >
                  <IconImage />
                  {productImagePreview ? (
                    <>
                      <strong>Image selected</strong>
                      <span>Drop a new file to replace, or remove below</span>
                    </>
                  ) : (
                    <>
                      <strong>Drop product image</strong>
                      <span>or click to browse · PNG, JPEG, WebP, GIF</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      applyProductImageFile(file);
                    }}
                  />
                </label>
                {productImagePreview && (
                  <div className="product-image-preview">
                    <img src={productImagePreview} alt="" />
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => {
                        setProductImageFile(null);
                        setProductImagePreview(null);
                        setClearProductImageFlag(true);
                      }}
                    >
                      Remove image
                    </button>
                  </div>
                )}
              </div>

              <div className="form-card">
                <h3 className="form-card-title">Units &amp; pricing</h3>
                <div className="form-grid-2">
                  <input
                    placeholder="Sell price / base unit (USD)"
                    value={productForm.price}
                    onChange={(e) => setProductForm((f) => ({ ...f, price: e.target.value }))}
                  />
                  <input
                    placeholder="Cost / base unit (USD)"
                    value={productForm.cost}
                    onChange={(e) => setProductForm((f) => ({ ...f, cost: e.target.value }))}
                  />
                </div>
                <div className="form-grid-2">
                  <select
                    aria-label="Base unit"
                    value={productForm.baseUnit}
                    onChange={(e) => setProductForm((f) => ({ ...f, baseUnit: e.target.value }))}
                  >
                    {UNIT_OPTIONS.map((u) => (
                      <option key={u} value={u}>
                        Base UOM: {u}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Stock unit"
                    value={productForm.stockUnit}
                    onChange={(e) => setProductForm((f) => ({ ...f, stockUnit: e.target.value }))}
                  >
                    <option value="">Stock UOM: same as base</option>
                    {UNIT_OPTIONS.map((u) => (
                      <option key={u} value={u}>
                        Stock UOM: {u}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Sales unit"
                    value={productForm.salesUnit}
                    onChange={(e) => setProductForm((f) => ({ ...f, salesUnit: e.target.value }))}
                  >
                    <option value="">Sales UOM: same as base</option>
                    {UNIT_OPTIONS.map((u) => (
                      <option key={u} value={u}>
                        Sales UOM: {u}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder="Stock amount (in stock UOM)"
                    value={productForm.stock}
                    onChange={(e) => setProductForm((f) => ({ ...f, stock: e.target.value }))}
                  />
                </div>

                <div className="pack-manager">
                  <div className="allowlist-head">
                    <span className="field-label">Sell packs (optional)</span>
                    <button
                      type="button"
                      className="action-btn"
                      onClick={() => setSellPacks((rows) => [...rows, newPackRow()])}
                    >
                      Add pack
                    </button>
                  </div>
                  {sellPacks.length === 0 ? (
                    <p className="hint tight">
                      e.g. Half oz @ 0.5 oz with optional custom pack price — no pipe syntax needed.
                    </p>
                  ) : (
                    sellPacks.map((row) => (
                      <div key={row.key} className="pack-row">
                        <input
                          placeholder="Label (e.g. Half oz)"
                          value={row.label}
                          onChange={(e) =>
                            setSellPacks((rows) =>
                              rows.map((r) =>
                                r.key === row.key ? { ...r, label: e.target.value } : r,
                              ),
                            )
                          }
                        />
                        <input
                          placeholder="Qty"
                          value={row.amount}
                          onChange={(e) =>
                            setSellPacks((rows) =>
                              rows.map((r) =>
                                r.key === row.key ? { ...r, amount: e.target.value } : r,
                              ),
                            )
                          }
                        />
                        <select
                          aria-label="Pack unit"
                          value={row.unit}
                          onChange={(e) =>
                            setSellPacks((rows) =>
                              rows.map((r) =>
                                r.key === row.key ? { ...r, unit: e.target.value } : r,
                              ),
                            )
                          }
                        >
                          {UNIT_OPTIONS.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                        <input
                          placeholder="Price $"
                          value={row.price}
                          onChange={(e) =>
                            setSellPacks((rows) =>
                              rows.map((r) =>
                                r.key === row.key ? { ...r, price: e.target.value } : r,
                              ),
                            )
                          }
                        />
                        <button
                          type="button"
                          className="ghost-btn"
                          aria-label="Remove pack"
                          onClick={() =>
                            setSellPacks((rows) => rows.filter((r) => r.key !== row.key))
                          }
                        >
                          ✕
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="form-card">
                <h3 className="form-card-title">Logistics &amp; SKU</h3>
                <div className="form-grid-2">
                  <input
                    placeholder="SKU (optional)"
                    value={productForm.sku}
                    onChange={(e) => setProductForm((f) => ({ ...f, sku: e.target.value }))}
                  />
                  <input
                    placeholder="Package weight (optional)"
                    value={productForm.weight}
                    onChange={(e) => setProductForm((f) => ({ ...f, weight: e.target.value }))}
                  />
                  <select
                    aria-label="Weight unit"
                    value={productForm.weightUnit}
                    onChange={(e) => setProductForm((f) => ({ ...f, weightUnit: e.target.value }))}
                    disabled={productForm.weight.trim() === "" || Number(productForm.weight) === 0}
                  >
                    <option value="g">Weight: g</option>
                    <option value="kg">Weight: kg</option>
                    <option value="oz">Weight: oz</option>
                    <option value="lb">Weight: lb</option>
                  </select>
                </div>
              </div>

              <div className="product-form-actions">
                <button type="button" className="send-btn" onClick={() => void saveProduct()}>
                  {productForm.id ? "Save product" : "Add product"}
                </button>
                {productForm.id && (
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => resetProductForm()}
                  >
                    Cancel edit
                  </button>
                )}
              </div>
            </div>
            <div className="thread-list">
              {products.length === 0 && <p className="hint">No products yet — add one above.</p>}
              {products.length > 0 && filteredProducts.length === 0 && (
                <p className="hint">No products match these filters.</p>
              )}
              {filteredProducts.map((p) => {
                return (
                  <div key={p.id} className="thread-row product-row">
                    <div className="thread-row-top">
                      <span className="thread-name">{p.name}</span>
                      <span className="thread-time">
                        {productPriceLabel(p)} · {productStockLabel(p)}
                      </span>
                    </div>
                    <div className="convo-sub">
                      {[
                        p.sku || p.id.slice(0, 8),
                        p.supplier ? `from ${p.supplier}` : null,
                        p.cost_cents
                          ? `cost ${money(p.cost_cents)}/${productBaseUnit(p)}`
                          : null,
                        productWeightLabel(p),
                        p.description ? p.description.slice(0, 40) : null,
                        (p.sell_options || []).length
                          ? `${p.sell_options.length} pack${p.sell_options.length === 1 ? "" : "s"}`
                          : null,
                        p.image_path ? "has image" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                    {p.quantity_in_stock <= 0 && (
                      <span className="badge danger">Out of stock</span>
                    )}
                    <div className="product-row-actions">
                      <button type="button" className="ghost-btn" onClick={() => void editProduct(p)}>
                        Edit
                      </button>
                      <button type="button" className="ghost-btn" onClick={() => void removeProduct(p.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
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
          <div className="filter-strip">
            <input
              placeholder="Filter customers…"
              value={customerFilter.q}
              onChange={(e) => setCustomerFilter((f) => ({ ...f, q: e.target.value }))}
            />
            <label className="filter-check">
              <input
                type="checkbox"
                checked={customerFilter.hasOrders}
                onChange={(e) => setCustomerFilter((f) => ({ ...f, hasOrders: e.target.checked }))}
              />
              Has orders
            </label>
            <span className="col-meta">
              {filteredCustomers.length}/{customers.length}
            </span>
          </div>
          <div className="thread-list">
            {customers.length === 0 && (
              <p className="hint">Open a DM and use “Link current chat”.</p>
            )}
            {customers.length > 0 && filteredCustomers.length === 0 && (
              <p className="empty">No customers match these filters.</p>
            )}
            {filteredCustomers.map((c) => {
              const orderCount = orders.filter(
                (o) => o.customer_id === c.id || o.thread_id === c.thread_id,
              ).length;
              return (
                <button
                  key={c.id}
                  type="button"
                  className={selectedId === c.thread_id ? "thread-row active" : "thread-row"}
                  onClick={() => {
                    setSelectedId(c.thread_id);
                    setPanel("threads");
                  }}
                >
                  <span className="avatar-dot" aria-hidden>
                    {initials(c.display_name || c.thread_id)}
                  </span>
                  <div className="thread-row-body">
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
                    <div className="thread-row-meta">
                      {orderCount > 0 && (
                        <span className="badge muted">{orderCount} order{orderCount === 1 ? "" : "s"}</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
            {customers.length === 0 && (
              <p className="hint">Open a DM and use “Link current chat”.</p>
            )}
          </div>
        </section>
      )}

      {panel === "orders" && (
        <section className="thread-col wide">
          <header className="col-head">
            Orders
            <span className="col-meta">
              {filteredOrders.length}/{orders.length} total
            </span>
          </header>
          <div className="settings-body wide-body">
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
                  onChange={(e) => setOrderFilter((f) => ({ ...f, thisThread: e.target.checked }))}
                />
                This chat only
              </label>
            </div>
            <div className="product-form">
              <p className="hint tight">
                Creates an order for the selected DM, decrements stock, then you can queue an
                invoice over Signal (outbox).
              </p>
              <div className="order-target">
                {selectedId && !selectedId.startsWith("group:") ? (
                  <>
                    Ordering for <strong>{threadTitle(selectedId, contacts, groups)}</strong>
                    <span className="convo-sub inline">{selectedId}</span>
                  </>
                ) : (
                  <span className="warn-text">Select a DM thread first to place an order.</span>
                )}
              </div>
              <select
                value={orderProductId}
                onChange={(e) => {
                  setOrderProductId(e.target.value);
                  setOrderSellOptionId("");
                }}
                disabled={products.length === 0}
              >
                {products.length === 0 && <option value="">No products — add in Catalog</option>}
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({productPriceLabel(p)}, {productStockLabel(p)})
                  </option>
                ))}
              </select>
              <select
                aria-label="Sell pack"
                value={orderSellOptionId}
                onChange={(e) => setOrderSellOptionId(e.target.value)}
                disabled={
                  !(products.find((p) => p.id === orderProductId)?.sell_options?.length)
                }
              >
                <option value="">Custom qty (sales UOM)</option>
                {(products.find((p) => p.id === orderProductId)?.sell_options || []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label} — {o.amount} {o.unit}
                    {o.price_cents != null ? ` @ ${money(o.price_cents)}` : ""}
                  </option>
                ))}
              </select>
              <input
                placeholder="Qty (sales UOM)"
                value={orderQty}
                onChange={(e) => setOrderQty(e.target.value)}
                disabled={!!orderSellOptionId}
              />
              <button
                type="button"
                className="send-btn"
                disabled={!selectedId || selectedId.startsWith("group:") || products.length === 0}
                onClick={() => void placeOrder()}
              >
                Place order on current chat
              </button>
            </div>
            <div className="thread-list">
              {orders.length === 0 && <p className="hint">No orders yet.</p>}
              {orders.length > 0 && filteredOrders.length === 0 && (
                <p className="hint">No orders match these filters.</p>
              )}
              {filteredOrders.map((o) => (
                  <div key={o.id} className="thread-row product-row">
                    <div className="thread-row-top">
                      <span className="thread-name">
                        {orderParty(o)}
                        <span className="order-id"> · {o.id.slice(0, 8)}</span>
                      </span>
                      <span className={`status-pill status-${orderStatusTone(o.status)}`}>
                        {o.status}
                      </span>
                    </div>
                    <div className="convo-sub">
                      {money(o.total_cents)} ·{" "}
                      {o.lines
                        .map((l) => {
                          const u = (l.unit || "ea").toLowerCase();
                          const q =
                            Math.abs(l.quantity - Math.round(l.quantity)) < 0.001
                              ? String(Math.round(l.quantity))
                              : l.quantity.toFixed(3);
                          const qty = u === "ea" ? q : `${q} ${u}`;
                          const pack = l.sell_option_label ? ` (${l.sell_option_label})` : "";
                          return `${l.name}${pack}×${qty}`;
                        })
                        .join(", ")}
                      {" · "}
                      {fmtTime(o.created_at)}
                    </div>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="action-btn primary"
                        onClick={() => void sendInvoice(o.id)}
                        title="Queue invoice text to this chat via outbox"
                      >
                        Send invoice
                      </button>
                      {o.status !== "cancelled" && o.status !== "paid" && (
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() => void setOrderLifecycle(o.id, "paid")}
                        >
                          Mark paid
                        </button>
                      )}
                      {o.status !== "cancelled" && o.status !== "fulfilled" && (
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() => void setOrderLifecycle(o.id, "fulfilled")}
                        >
                          Mark fulfilled
                        </button>
                      )}
                      {o.status !== "cancelled" && (
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() => void setOrderLifecycle(o.id, "cancelled")}
                        >
                          Cancel
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
            </div>
          </div>
        </section>
      )}

      {panel === "outbox" && (
        <section className="thread-col wide">
          <header className="col-head">
            Outbox
            <span className="col-meta">
              {outboxSummary
                ? `${outboxSummary.queued} queued · ${outboxSummary.sending} sending · ${outboxSummary.failed} failed`
                : "—"}
            </span>
          </header>
          <div className="filter-strip">
            <button type="button" className="ghost-btn" onClick={() => void refreshGlobalOutbox()}>
              Refresh
            </button>
            <span className="col-meta">{globalOutbox.length} open</span>
          </div>
          <div className="thread-list">
            {globalOutbox.length === 0 && (
              <p className="empty">Outbox clear — nothing queued or failed.</p>
            )}
            {globalOutbox.map((o) => (
              <div key={o.id} className="thread-row product-row">
                <div className="thread-row-top">
                  <span className="thread-name">{threadTitle(o.thread_id, contacts, groups)}</span>
                  <span
                    className={`status-pill status-${
                      o.state === "failed" ? "danger" : o.state === "sending" ? "warn" : "muted"
                    }`}
                  >
                    {o.state}
                  </span>
                </div>
                <div className="convo-sub">
                  {o.attachment_path ? "📎 " : ""}
                  {o.content.slice(0, 120) || (o.attachment_path ? "(attachment)" : "(empty)")}
                  {o.content.length > 120 ? "…" : ""}
                  {" · "}
                  {fmtTime(o.created_at)}
                  {o.attempt_count > 0 ? ` · tries ${o.attempt_count}` : ""}
                </div>
                {o.last_error && <div className="bubble-err">{o.last_error}</div>}
                <div className="row-actions">
                  {o.state === "failed" && (
                    <button type="button" className="action-btn primary" onClick={() => void onRetry(o.id).then(() => refreshGlobalOutbox())}>
                      Retry
                    </button>
                  )}
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => void onDeleteOutbox(o.id).then(() => refreshGlobalOutbox())}
                  >
                    Discard
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
        </section>
      )}

      {panel === "audit" && (
        <section className="thread-col wide">
          <header className="col-head">
            Auto-reply audit
            <span className="col-meta">
              {filteredAudit.length}/{audit.length}
            </span>
          </header>
          <div className="filter-strip">
            <input
              placeholder="Filter audit…"
              value={auditFilter.q}
              onChange={(e) => setAuditFilter((f) => ({ ...f, q: e.target.value }))}
            />
            <select
              aria-label="Audit outcome"
              value={auditFilter.outcome}
              onChange={(e) => setAuditFilter((f) => ({ ...f, outcome: e.target.value }))}
            >
              {auditOutcomes.map((o) => (
                <option key={o} value={o}>
                  {o === "all" ? "All outcomes" : o}
                </option>
              ))}
            </select>
          </div>
          <div className="audit-list">
            {audit.length === 0 && <p className="empty">No auto-reply activity yet.</p>}
            {audit.length > 0 && filteredAudit.length === 0 && (
              <p className="empty">No audit rows match these filters.</p>
            )}
            {filteredAudit.map((e) => (
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
          <div className="work-tabs" role="tablist" aria-label="Settings sections">
            {(
              [
                ["system", "System"],
                ["device", "Device link"],
                ["ivr", "IVR"],
                ["auto", "Auto-reply"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={settingsTab === id}
                className={settingsTab === id ? "work-tab active" : "work-tab"}
                onClick={() => setSettingsTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="settings-body wide-body">
            {settingsTab === "system" && (
              <div className="settings-card">
                <div className="settings-card-head">
                  <h3>System</h3>
                  <span className={`status-pill status-${diagnostics?.signal_cli_usable ? "ok" : "danger"}`}>
                    {diagnostics?.signal_cli_usable ? "signal-cli ok" : "signal-cli issue"}
                  </span>
                </div>
                <dl className="diag-grid">
                  <div>
                    <dt>Number</dt>
                    <dd>{diagnostics?.number || "—"}</dd>
                  </div>
                  <div>
                    <dt>Receive</dt>
                    <dd title={healthLabel(health)}>{healthLabel(health)}</dd>
                  </div>
                  <div>
                    <dt>AI</dt>
                    <dd>
                      {ai?.configured
                        ? ai.ollama_reachable
                          ? ai.ollama_model || "ollama"
                          : "unreachable"
                        : "not configured"}
                    </dd>
                  </div>
                </dl>
                {diagnostics?.signal_cli_last_error && (
                  <p className="hint tight warn-text">{diagnostics.signal_cli_last_error}</p>
                )}
              </div>
            )}

            {settingsTab === "device" && (
              <div className="settings-card">
                <div className="settings-card-head">
                  <h3>Device link</h3>
                  <span
                    className={`status-pill status-${
                      linkStatus?.state === "success"
                        ? "ok"
                        : linkStatus?.state === "error"
                          ? "danger"
                          : linkBusy || linkStatus?.state === "waiting"
                            ? "warn"
                            : "muted"
                    }`}
                  >
                    {linkBusy || linkStatus?.state === "waiting"
                      ? "WAITING"
                      : linkStatus?.state === "success"
                        ? "LINKED"
                        : linkStatus?.state === "error"
                          ? "FAILED"
                          : linkStatus?.state === "cancelled"
                            ? "CANCELLED"
                            : "IDLE"}
                  </span>
                </div>
                <ol className="setup-steps">
                  <li>Start linking below.</li>
                  <li>Scan the QR in Signal → Linked devices (or Copy the URI).</li>
                  <li>Wait for LINKED.</li>
                  <li>
                    If first link, set <code>SIGNALX_NUMBER</code> in <code>.signalx.env</code> and
                    restart.
                  </li>
                </ol>
                <p className="hint tight">
                  Uses <code>SIGNALX_SIGNALCLI_CONFIG</code>. Scripts under <code>scripts/</code> remain
                  a fallback.
                </p>
                <div className="row-actions">
                  <button
                    type="button"
                    className="action-btn primary"
                    disabled={linkBusy || !diagnostics?.signal_cli_usable}
                    onClick={() => void startDeviceLink()}
                  >
                    Start linking
                  </button>
                  <button
                    type="button"
                    className="ghost-btn"
                    disabled={!linkBusy}
                    onClick={() => void cancelDeviceLink()}
                  >
                    Cancel
                  </button>
                </div>
                {linkUri && (
                  <div className="device-link-panel">
                    <DeviceLinkQr uri={linkUri} />
                    <div className="device-link-uri">
                      <code className="device-link-uri-text" title={linkUri}>
                        {linkUri}
                      </code>
                      <button type="button" className="action-btn" onClick={() => void copyLinkUri()}>
                        {linkCopied ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                )}
                {linkStatus?.message && (
                  <p
                    className={`hint tight ${
                      linkStatus.state === "error" ? "warn-text" : ""
                    }`}
                  >
                    {linkStatus.message}
                  </p>
                )}
                {!diagnostics?.config_path && (
                  <p className="hint tight warn-text">
                    Set SIGNALX_SIGNALCLI_CONFIG in .signalx.env before linking.
                  </p>
                )}
              </div>
            )}

            {settingsTab === "auto" && (
              <div className="settings-card">
                <div className="settings-card-head">
                  <h3>Auto-reply (global)</h3>
                  <span className={`status-pill status-${autoSettings?.enabled ? "warn" : "muted"}`}>
                    {autoSettings?.enabled ? "ON" : "OFF"}
                  </span>
                </div>
                <p className="hint tight">
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
                    <div className="settings-grid">
                      <label className="field-stack">
                        <span className="field-label">Max per thread / window</span>
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
                      </label>
                      <label className="field-stack">
                        <span className="field-label">Max global / window</span>
                        <input
                          type="number"
                          min={1}
                          value={autoSettings.max_per_window}
                          onChange={(e) =>
                            void saveAutoSettings({ max_per_window: Number(e.target.value) || 1 })
                          }
                        />
                      </label>
                      <label className="field-stack">
                        <span className="field-label">Quiet hours start (0–23)</span>
                        <input
                          type="number"
                          min={0}
                          max={23}
                          placeholder="off"
                          value={autoSettings.quiet_hours_start ?? ""}
                          onChange={(e) =>
                            void saveAutoSettings({
                              quiet_hours_start: e.target.value === "" ? null : Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label className="field-stack">
                        <span className="field-label">Quiet hours end</span>
                        <input
                          type="number"
                          min={0}
                          max={23}
                          placeholder="off"
                          value={autoSettings.quiet_hours_end ?? ""}
                          onChange={(e) =>
                            void saveAutoSettings({
                              quiet_hours_end: e.target.value === "" ? null : Number(e.target.value),
                            })
                          }
                        />
                      </label>
                    </div>
                    <div className="allowlist-head">
                      <span className="field-label">
                        Allowlist ({autoSettings.allowlist.length})
                      </span>
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => void addToAllowlist("auto", selectedId)}
                      >
                        Add current chat
                      </button>
                    </div>
                    {autoSettings.allowlist.length === 0 ? (
                      <p className="hint tight">Empty — nobody can auto-send.</p>
                    ) : (
                      <ul className="allowlist-list">
                        {autoSettings.allowlist.map((tid) => (
                          <li key={tid}>
                            <div>
                              <div className="thread-name">{threadTitle(tid, contacts, groups)}</div>
                              <div className="convo-sub">{tid}</div>
                            </div>
                            <button
                              type="button"
                              className="ghost-btn"
                              onClick={() => void removeFromAllowlist("auto", tid)}
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            )}

            {settingsTab === "ivr" && (
              <div className="settings-card">
                <div className="settings-card-head">
                  <h3>Menu IVR (global)</h3>
                  <span className={`status-pill status-${ivrSettings?.enabled ? "ok" : "muted"}`}>
                    {ivrSettings?.enabled ? "ON" : "OFF"}
                  </span>
                </div>
                <p className="hint tight">
                  Text menus over Signal. Enable globally, then opt in per DM (or add to
                  allowlist below). Groups are never handled. Buyer “3” hands off to you.
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
                    <div className="allowlist-head">
                      <span className="field-label">
                        IVR allowlist ({ivrSettings.allowlist.length})
                      </span>
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => void addToAllowlist("ivr", selectedId)}
                      >
                        Add current chat
                      </button>
                    </div>
                    {ivrSettings.allowlist.length === 0 ? (
                      <p className="hint tight">
                        Empty — enable Menu IVR on a DM thread, or add a chat here.
                      </p>
                    ) : (
                      <ul className="allowlist-list">
                        {ivrSettings.allowlist.map((tid) => (
                          <li key={tid}>
                            <div>
                              <div className="thread-name">{threadTitle(tid, contacts, groups)}</div>
                              <div className="convo-sub">{tid}</div>
                            </div>
                            <button
                              type="button"
                              className="ghost-btn"
                              onClick={() => void removeFromAllowlist("ivr", tid)}
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {(panel === "audit" ||
        panel === "settings" ||
        panel === "products" ||
        panel === "orders" ||
        panel === "outbox") ? null : (
      <main className="convo">
        {!selectedId ? (
          <div className="convo-empty">
            <h1>SignalX</h1>
            <p>Select a thread, or jump to a quick action.</p>
            <div className="quick-actions">
              <button type="button" className="quick-action" onClick={() => setPanel("threads")}>
                <strong>Messages</strong>
                <span>Open the thread list and reply over Signal.</span>
              </button>
              <button type="button" className="quick-action" onClick={() => setPanel("products")}>
                <strong>Catalog</strong>
                <span>Manage products, packs, and stock.</span>
              </button>
              <button type="button" className="quick-action" onClick={() => setPanel("orders")}>
                <strong>Orders</strong>
                <span>Place orders and queue invoices via outbox.</span>
              </button>
              <button type="button" className="quick-action" onClick={() => setPanel("customers")}>
                <strong>Customers</strong>
                <span>Linked chats and order history.</span>
              </button>
            </div>
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
                {ivrHint && (
                  <span className="auto-thread-badge warn" title={ivrHint}>
                    {ivrHint}
                  </span>
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
                {!threadIvr?.enabled && ivrSettings?.enabled && !selectedId?.startsWith("group:") && (
                  <span className="convo-sub inline-hint">Enable Menu IVR to allowlist this chat</span>
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

            {status && (
              <div className="status-bar">
                <span>{status}</span>
                <button type="button" className="ghost-btn" onClick={() => setStatus(null)}>
                  Dismiss
                </button>
              </div>
            )}

            <div className="composer">
              {attachPreview && (
                <div className="attach-chip">
                  <img src={attachPreview} alt="" />
                  <span>{attachFile?.name || "Attachment"}</span>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => {
                      setAttachFile(null);
                      if (attachPreview) URL.revokeObjectURL(attachPreview);
                      setAttachPreview(null);
                    }}
                  >
                    Remove
                  </button>
                </div>
              )}
              <div className="composer-row">
                <label className="attach-btn" title="Attach image or file">
                  <IconImage />
                  <input
                    type="file"
                    accept="image/*,.pdf,.txt,.csv"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setAttachFile(file);
                      if (attachPreview) URL.revokeObjectURL(attachPreview);
                      setAttachPreview(file ? URL.createObjectURL(file) : null);
                      e.target.value = "";
                    }}
                  />
                </label>
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
                  disabled={sending || (!composer.trim() && !attachFile)}
                  onClick={() => void onSend()}
                >
                  {sending ? "…" : "Send"}
                </button>
              </div>
            </div>
          </>
        )}
      </main>
      )}

      {showProfileRail && selectedId && (
        <ProfileRail
          threadId={selectedId}
          title={title}
          initials={initials(title)}
          contact={profileContact}
          customer={profileCustomer}
          orders={orders}
          products={products}
          ai={ai}
          aiBusy={aiBusy}
          onStatus={setStatus}
          onSetComposer={setComposer}
          onDraft={(intent) => void onDraft(intent)}
          onSummarize={onSummarize}
          onLinkCustomer={() => void linkCustomerFromThread()}
          onOpenOrders={() => {
            setOrderFilter((f) => ({ ...f, thisThread: true, q: "" }));
            setPanel("orders");
          }}
          onSendInvoice={(id) => void sendInvoice(id)}
          onMarkPaid={(id) => void setOrderLifecycle(id, "paid")}
          onToggleFavorite={(next) => {
            void (async () => {
              const res = await api.setContactMeta(selectedId, { favorite: next });
              if (!res.success) setStatus(res.error);
              else await refreshMeta();
            })();
          }}
          onToggleMute={(next) => {
            void (async () => {
              const res = await api.setContactMeta(selectedId, { muted: next });
              if (!res.success) setStatus(res.error);
              else await refreshMeta();
            })();
          }}
          onSaveNotes={(notes) => {
            void (async () => {
              if (!profileCustomer) {
                setStatus("Link as customer before saving notes");
                return;
              }
              const res = await api.upsertCustomer({
                ...profileCustomer,
                notes,
              });
              if (!res.success) setStatus(res.error);
              else {
                setStatus("Notes saved");
                await refreshMeta();
              }
            })();
          }}
        />
      )}

      {status &&
        (panel === "audit" ||
          panel === "settings" ||
          panel === "products" ||
          panel === "orders" ||
          panel === "outbox" ||
          !selectedId) && (
          <div className="shell-status" role="status">
            <span>{status}</span>
            <button type="button" className="ghost-btn" onClick={() => setStatus(null)}>
              Dismiss
            </button>
          </div>
        )}
    </div>
  );
}
