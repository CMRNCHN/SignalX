import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  api,
  errMsg,
  isDesktopUnavailable,
  onEvent,
  unwrap,
  type AiStatus,
  type AutoReplyAuditEntry,
  type AutoReplySettings,
  type CommerceAuditEvent,
  type ContactMeta,
  type Customer,
  type Diagnostics,
  type DeviceLinkStatus,
  type DeviceLinkUri,
  type GroupMeta,
  type IvrMenus,
  type IvrPreviewStep,
  type IvrSettings,
  type Message,
  type Order,
  type OutboxItem,
  type OutboxSummary,
  type Product,
  type ReceiveLoopState,
  type SalesSummary,
  type SearchResult,
  type SessionStatus,
  type ThreadAutoReplyStatus,
  type ThreadIvrStatus,
  type ThreadSummary,
} from "./api";
import {
  USE_FIXTURES,
  fxAudit,
  fxCommerceAudit,
  fxContacts,
  fxCustomers,
  fxGroups,
  fxMessages,
  fxOrders,
  fxOutbox,
  fxProductImages,
  fxProducts,
  fxSalesSummary,
  fxSearchHits,
  fxThreads,
} from "./devFixtures";
import { DeviceLinkQr } from "./DeviceLinkQr";
import { emptyMenus, IvrMenuComposer } from "./IvrMenuComposer";
import { ProfileRail } from "./ProfileRail";
import { CatalogScreen } from "./components/Catalog/CatalogScreen";
import { SearchScreen } from "./components/Search/SearchScreen";
import { PeopleScreen } from "./components/People/PeopleScreen";
import { buildDirectory } from "./components/People/people";
import { matchingMessages, matchingOrders, matchingPeople, matchingProducts, type SearchScope } from "./globalSearch";
import { OrdersScreen, EMPTY_ORDER_FILTER, type OrderFilterState } from "./components/Orders/OrdersScreen";
import { SalesScreen } from "./components/Sales/SalesScreen";
import { PanelResizer } from "./components/PanelResizer";
import { formatPhone, formatQty, isGroupThread, stockQtyFromMilli, threadTitle } from "./format";
import { canInvoke, isTauriRuntime } from "./runtime";
import { usePanelWidths, type PanelLayout } from "./usePanelWidths";
import {
  IconAudit,
  IconBolt,
  IconCatalog,
  IconCompose,
  IconContacts,
  IconImage,
  IconMessages,
  IconOrders,
  IconOutbox,
  IconSearch,
  IconX,
  IconExport,
  IconMenuList,
  IconReply,
  IconSettings,
  IconSparkle,
} from "./navIcons";

export type Panel =
  | "threads"
  | "search"
  | "people"
  | "catalog"
  | "contacts"
  | "groups"
  | "products"
  | "customers"
  | "orders"
  | "sales"
  | "outbox"
  | "audit"
  | "settings";
type SettingsTab = "account" | "ivr" | "auto" | "backup";

type SellPackRow = {
  key: string;
  id?: string;
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

type NavItem = { id: Panel; label: string; ico: ReactNode };

/** Grouped so related destinations read as a set rather than a flat list. */
const NAV_GROUPS: NavItem[][] = [
  [{ id: "threads", label: "Messages", ico: <IconMessages /> }],
  [{ id: "people", label: "People", ico: <IconContacts /> }],
  [
    { id: "catalog", label: "Catalog", ico: <IconCatalog /> },
    { id: "orders", label: "Orders", ico: <IconOrders /> },
    { id: "sales", label: "Sales", ico: <IconAudit /> },
  ],
  [
    { id: "outbox", label: "Outbox", ico: <IconOutbox /> },
    { id: "audit", label: "Auto-reply log", ico: <IconAudit /> },
  ],
  [{ id: "settings", label: "Settings", ico: <IconSettings /> }],
];


function initials(label: string): string {
  const parts = label.replace(/^\+/, "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Stable per-identity avatar tint. Low saturation so it reads as a tinted
 *  grey rather than a colour accent, but distinct enough to tell rows apart. */
function avatarTint(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return {
    background: `hsl(${hue} 16% 30%)`,
    color: `hsl(${hue} 38% 84%)`,
    boxShadow: `inset 0 0 0 1px hsl(${hue} 20% 42%)`,
  };
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

function isEnvelopeNoiseContent(content: string): boolean {
  const t = content.trim();
  if (!t.startsWith("{")) return false;
  if (t.includes('"receiptMessage"') || t.includes('"typingMessage"')) return true;
  return t.includes('"envelope"') && t.includes('"source"');
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
  if (!milli && p.quantity_in_stock != null) {
    return stockU === "ea"
      ? `${p.quantity_in_stock} left`
      : `${p.quantity_in_stock} ${stockU} left`;
  }
  const shown = formatQty(stockQtyFromMilli(milli, stockU, base));
  return stockU === "ea" ? `${shown} left` : `${shown} ${stockU} left`;
}

function lowStockThresholdLabel(milli: number): string {
  if (!milli) return "";
  const v = milli / 1000;
  return Math.abs(v - Math.round(v)) < 0.001 ? String(Math.round(v)) : v.toFixed(3);
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
  if (s === "draft") return "muted";
  return "muted";
}

function ivrInactiveReason(ivr: ThreadIvrStatus | null): string | null {
  if (!ivr || ivr.effective) return null;
  if (ivr.handed_off) return null;
  if (ivr.global_enabled === false) return "Buyer menu ready · turn it on in Settings";
  if (!ivr.enabled) return null;
  return "Buyer menu ready · waiting to activate";
}

function includesQ(hay: string, q: string): boolean {
  if (!q.trim()) return true;
  return hay.toLowerCase().includes(q.trim().toLowerCase());
}

export default function App() {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [panel, setPanel] = useState<Panel>("threads");
  const [accountNumber, setAccountNumber] = useState<string | null>(null);
  const [session, setSession] = useState<SessionStatus | null>(null);
  const [sessionPin, setSessionPin] = useState("");
  const [unlockId, setUnlockId] = useState<string | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [addNumber, setAddNumber] = useState("");
  const [addPin, setAddPin] = useState("");
  const [addLabel, setAddLabel] = useState("");
  const [rosterBusy, setRosterBusy] = useState(false);
  const [changePinCurrent, setChangePinCurrent] = useState("");
  const [changePinNew, setChangePinNew] = useState("");
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [health, setHealth] = useState<ReceiveLoopState | null>(null);
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [threadsReal, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messagesReal, setMessages] = useState<Message[]>([]);
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [globalOutboxReal, setGlobalOutbox] = useState<OutboxItem[]>([]);
  const [outboxSummary, setOutboxSummary] = useState<OutboxSummary | null>(null);
  const [composer, setComposer] = useState("");
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [attachPreview, setAttachPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [status, setStatusState] = useState<string | null>(null);
  const setStatus = (msg: string | null) => {
    if (msg && isDesktopUnavailable(msg)) return;
    setStatusState(msg);
  };
  const [searchQ, setSearchQ] = useState("");
  const [searchLiveQ, setSearchLiveQ] = useState("");
  const [searchScope, setSearchScope] = useState<SearchScope>("messages");
  const [peopleSearchQuery, setPeopleSearchQuery] = useState("");
  const [peopleSearchTick, setPeopleSearchTick] = useState(0);
  const [searchHitsReal, setSearchHits] = useState<SearchResult[]>([]);
  const [contactsReal, setContacts] = useState<ContactMeta[]>([]);
  const [groupsReal, setGroups] = useState<GroupMeta[]>([]);
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [autoSettings, setAutoSettings] = useState<AutoReplySettings | null>(null);
  const [ivrSettings, setIvrSettings] = useState<IvrSettings | null>(null);
  const [ivrMenusDraft, setIvrMenusDraft] = useState<IvrMenus | null>(null);
  const [ivrMenusError, setIvrMenusError] = useState<string | null>(null);
  const [ivrPreviewSteps, setIvrPreviewSteps] = useState<IvrPreviewStep[]>([]);
  const [ivrMenusBusy, setIvrMenusBusy] = useState(false);
  const [threadAuto, setThreadAuto] = useState<ThreadAutoReplyStatus | null>(null);
  const [threadIvr, setThreadIvr] = useState<ThreadIvrStatus | null>(null);
  const [productsReal, setProducts] = useState<Product[]>([]);
  const [customersReal, setCustomers] = useState<Customer[]>([]);
  const [catalogFormOpen, setCatalogFormOpen] = useState(false);
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
    lowStockThreshold: "",
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
  const [ordersReal, setOrders] = useState<Order[]>([]);
  const [orderProductId, setOrderProductId] = useState("");
  const [orderQty, setOrderQty] = useState("1");
  const [auditReal, setAudit] = useState<AutoReplyAuditEntry[]>([]);
  const [salesSummaryReal, setSalesSummary] = useState<SalesSummary | null>(null);
  const [commerceAuditReal, setCommerceAudit] = useState<CommerceAuditEvent[]>([]);
  const [salesRange, setSalesRange] = useState<"7" | "30" | "all">("30");
  const [salesStatus, setSalesStatus] = useState("all");
  const [peopleKey, setPeopleKey] = useState<string | null>(null);
  const [catalogProductId, setCatalogProductId] = useState<string | null>(null);
  const [catalogSearchQuery, setCatalogSearchQuery] = useState("");
  const [catalogSearchTick, setCatalogSearchTick] = useState(0);
  const [focusOrderId, setFocusOrderId] = useState<string | null>(null);
  const [newDmError, setNewDmError] = useState<string | null>(null);
  const [newDmOpen, setNewDmOpen] = useState(false);
  const [productImagesReal, setProductImages] = useState<Record<string, string>>({});

  // Dev-only design data. Real state always wins; fixtures fill in only while a
  // list is genuinely empty, and USE_FIXTURES is false in any release build.
  const threads = USE_FIXTURES && !threadsReal.length ? fxThreads : threadsReal;
  const messages = (() => {
    const live = selectedId
      ? messagesReal.filter(
          (m) =>
            m.thread_id === selectedId ||
            m.thread_id.replace(/^dm:/, "") === selectedId.replace(/^dm:/, ""),
        )
      : messagesReal;
    if (live.length) return live;
    if (USE_FIXTURES && selectedId) {
      return fxMessages.filter((m) => m.thread_id === selectedId);
    }
    return [];
  })();
  const globalOutbox =
    USE_FIXTURES && !globalOutboxReal.length ? fxOutbox : globalOutboxReal;
  const searchHits = searchHitsReal.length
    ? searchHitsReal
    : USE_FIXTURES
      ? fxSearchHits.filter((h) => {
          const q = searchLiveQ.trim().toLowerCase();
          if (!q) return false;
          return `${h.snippet} ${h.thread_id} ${h.sender}`.toLowerCase().includes(q);
        })
      : [];
  const contacts = USE_FIXTURES && !contactsReal.length ? fxContacts : contactsReal;
  const groups = USE_FIXTURES && !groupsReal.length ? fxGroups : groupsReal;
  const products = USE_FIXTURES && !productsReal.length ? fxProducts : productsReal;
  const customers = USE_FIXTURES && !customersReal.length ? fxCustomers : customersReal;
  const orders = USE_FIXTURES && !ordersReal.length ? fxOrders : ordersReal;
  const audit = USE_FIXTURES && !auditReal.length ? fxAudit : auditReal;
  const commerceAudit =
    USE_FIXTURES && !commerceAuditReal.length ? fxCommerceAudit : commerceAuditReal;
  // The sales API answers with a valid but zeroed summary when no account is
  // configured, so treat "no orders" as empty rather than only null.
  const salesSummary =
    USE_FIXTURES && !salesSummaryReal?.order_count ? fxSalesSummary : salesSummaryReal;
  // Fixture products have no `image_path`, so the loader below never fetches
  // for them. Merge rather than replace: a real uploaded photo always wins.
  const productImages = USE_FIXTURES
    ? { ...fxProductImages, ...productImagesReal }
    : productImagesReal;

  const [linkBusy, setLinkBusy] = useState(false);
  const [linkUri, setLinkUri] = useState<string | null>(null);
  const [linkStatus, setLinkStatus] = useState<DeviceLinkStatus | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("account");
  const [importMode, setImportMode] = useState<"replace" | "merge">("replace");
  const [backupBusy, setBackupBusy] = useState(false);
  const [restartRequired, setRestartRequired] = useState(false);
  const [threadFilter, setThreadFilter] = useState({
    kind: "all" as "all" | "dm" | "group",
    unread: false,
    pending: false,
  });
  const [orderFilter, setOrderFilter] = useState<OrderFilterState>(EMPTY_ORDER_FILTER);
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
    if (msgs.success) {
      setMessages(msgs.data.filter((m) => !isEnvelopeNoiseContent(m.content)));
      const c = await api.listContactMeta();
      if (c.success) setContacts(c.data);
    }
    if (box.success) setOutbox(box.data.filter((i) => i.state !== "sent"));
    const marked = await api.markThreadRead(threadId);
    if (marked.success) {
      setThreads((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, unread_count: 0 } : t)),
      );
      void refreshThreads();
    }
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

  const applySession = (s: SessionStatus) => {
    setSession(s);
    setAccountNumber(s.locked ? null : (s.number ?? null));
    if (s.locked) {
      setSelectedId(null);
      setThreads([]);
      setMessages([]);
      setProducts([]);
      setOrders([]);
      setCustomers([]);
      setIvrMenusDraft(null);
    }
    if (!unlockId && s.accounts[0]) setUnlockId(s.accounts[0].id);
  };

  const refreshSession = async () => {
    const res = await api.sessionStatus();
    if (res.success) applySession(res.data);
  };

  const bootstrap = async () => {
    const [diag, recv, aiStatus, sess] = await Promise.all([
      api.getDiagnostics(),
      api.getReceiveLoopState(),
      api.checkAiStatus(),
      api.sessionStatus(),
    ]);
    const d = unwrap(diag, null as unknown as Diagnostics | null);
    setDiagnostics(d);
    if (sess.success) applySession(sess.data);
    else setAccountNumber(d?.number ?? null);
    if (sess.success && sess.data.locked) {
      setStatus("Unlock an account to send and receive");
    }
    setHealth(unwrap(recv, null as unknown as ReceiveLoopState));
    setAi(unwrap(aiStatus, null as unknown as AiStatus));
    if (!(sess.success && sess.data.locked)) {
      await refreshThreads();
      await refreshMeta();
      await refreshGlobalOutbox();
    }
  };

  useEffect(() => {
    if (!isTauriRuntime()) return;
    if (!canInvoke()) {
      setAutoSettings({
        enabled: false,
        allowlist: [],
        quiet_hours_start: null,
        quiet_hours_end: null,
        max_per_thread_per_hour: 4,
        max_per_window: 20,
        window_secs: 3600,
      });
      setIvrSettings({
        enabled: false,
        allowlist: [],
        require_allowlist: false,
        hide_zero_stock: false,
      });
      return;
    }
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
            setStatus("Device linked — add the new number to the roster with a PIN");
            void refreshDiagnostics();
            void refreshSession();
          }
        }),
      );
      unsubs.push(
        await onEvent("account://switched", () => {
          setSelectedId(null);
          setAccountMenuOpen(false);
          void bootstrap();
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

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  const onSend = async () => {
    if (!selectedId || sending || restartRequired) return;
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

  useEffect(() => {
    const q = searchQ.trim();
    if (!q) {
      setSearchLiveQ("");
      setSearchHits([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      setSearchLiveQ(q);
      void api.searchMessages(q).then((res) => {
        if (cancelled || !res.success) return;
        setSearchHits(res.data);
      });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [searchQ]);

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
    if (isGroupThread(selectedId) && enabled) {
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
    const next: IvrSettings = {
      ...ivrSettings,
      hide_zero_stock: ivrSettings.hide_zero_stock ?? false,
      ...patch,
    };
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
    if (!threadId || isGroupThread(threadId)) {
      setStatus("Select a DM thread first");
      return;
    }
    if (kind === "ivr") {
      if (!ivrSettings) return;
      if (ivrSettings.allowlist.includes(threadId)) {
        setStatus("This chat is already approved for the buyer menu");
        return;
      }
      await saveIvrSettings({ allowlist: [...ivrSettings.allowlist, threadId] });
      setStatus(`Buyer menu approved for ${threadTitle(threadId, contacts, groups, customers)}`);
      return;
    }
    if (!autoSettings) return;
    if (autoSettings.allowlist.includes(threadId)) {
      setStatus("Already on auto-reply allowlist");
      return;
    }
    await saveAutoSettings({ allowlist: [...autoSettings.allowlist, threadId] });
    setStatus(`Added to auto-reply allowlist: ${threadTitle(threadId, contacts, groups, customers)}`);
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
    return threadTitle(o.thread_id, contacts, groups, customers);
  };

  const toggleThreadIvr = async (enabled: boolean) => {
    if (!selectedId) return;
    if (isGroupThread(selectedId)) {
      setStatus("Buyer menus only work in 1:1 chats, not groups");
      return;
    }
    const res = await api.setThreadIvr(selectedId, enabled);
    if (!res.success) {
      setStatus(res.error);
      return;
    }
    setThreadIvr(res.data);
    setStatus(enabled ? "Buyer menu on for this chat" : "Buyer menu off for this chat");
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
    lowStockThreshold: "",
  });

  const resetProductForm = () => {
    setProductForm(emptyProductForm());
    setSellPacks([]);
    setProductImageFile(null);
    setProductImagePreview(null);
    setClearProductImageFlag(false);
    setCatalogFormOpen(false);
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
      id: o.id,
      label: o.label,
      amount: String(o.amount),
      unit: o.unit || p.base_unit || "ea",
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
        id: row.id || "",
        label,
        amount,
        unit: row.unit || productForm.baseUnit || "ea",
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
    const thrRaw = productForm.lowStockThreshold.trim();
    let low_stock_threshold_milli = 0;
    if (thrRaw !== "") {
      const thrUnits = Number(thrRaw);
      if (!Number.isFinite(thrUnits) || thrUnits < 0) {
        setStatus("Low-stock threshold must be a number ≥ 0 (in base units)");
        return;
      }
      low_stock_threshold_milli = Math.round(thrUnits * 1000);
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
      low_stock_threshold_milli,
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
      if (cleared.success) {
        product = cleared.data;
        setProductImages((prev) => {
          const next = { ...prev };
          delete next[product.id];
          return next;
        });
      } else setStatus(cleared.error);
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
    const base = (p.base_unit || p.unit || "ea").trim();
    const stockAmt =
      p.quantity_base_milli > 0
        ? formatQty(stockQtyFromMilli(p.quantity_base_milli, stockU, base))
        : String(p.quantity_in_stock ?? 0);
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
      lowStockThreshold:
        (p.low_stock_threshold_milli ?? 0) > 0
          ? lowStockThresholdLabel(p.low_stock_threshold_milli)
          : "",
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
    setCatalogFormOpen(true);
  };

  const openNewDm = async () => {
    const phone = normalizePhoneInput(newDmPhone);
    if (!phone) {
      setNewDmError("Enter a phone as +E164 (e.g. +15551234567)");
      setStatus("Enter a phone as +E164 (e.g. +15551234567)");
      return;
    }
    setNewDmError(null);
    const tid = `dm:${phone}`;
    const res = await api.setContactMeta(tid, {});
    if (!res.success) {
      setStatus(res.error);
      return;
    }
    setMessages([]);
    setOutbox([]);
    setSelectedId(tid);
    setPanel("threads");
    setNewDmPhone("");
    setNewDmOpen(false);
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
    setPeopleKey(res.data.thread_id);
    setStatus(`Group created: ${name}`);
    await refreshMeta();
    await refreshThreads();
  };

  const removeProduct = async (id: string) => {
    const sku = products.find((p) => p.id === id)?.sku?.trim();
    const open = orders.filter(
      (o) =>
        ["draft", "confirmed", "invoiced"].includes(o.status) &&
        o.lines.some((l) => l.product_id === id),
    );
    const warn = open.length
      ? `\n\nThis SKU is on ${open.length} open order${open.length === 1 ? "" : "s"}${sku ? ` (${sku})` : ""}.`
      : "";
    if (!window.confirm(`Delete this product?${warn}`)) return;
    const res = await api.deleteProduct(id);
    if (!res.success) {
      setStatus(res.error);
      return;
    }
    setProductImages((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    await refreshMeta();
  };

  const linkCustomerFromThread = async () => {
    if (!selectedId || isGroupThread(selectedId)) {
      setStatus("Select a DM thread first");
      return;
    }
    const res = await api.ensureCustomerForThread(
      selectedId,
      threadTitle(selectedId, contacts, groups, customers),
    );
    if (!res.success) {
      setStatus(res.error);
      return;
    }
    setStatus(`Customer linked: ${res.data.display_name || res.data.thread_id}`);
    await refreshMeta();
  };


  const placeOrder = async (asDraft = false) => {
    if (!selectedId || isGroupThread(selectedId)) {
      setStatus(asDraft ? "Select a DM thread to create a quote" : "Select a DM thread to place an order");
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
    const res = await api.createOrder(
      selectedId,
      [
        {
          productId: pid,
          quantity: qty,
          unit,
          sellOptionId: sellOpt?.id,
        },
      ],
      asDraft,
    );
    if (!res.success) {
      setStatus(res.error);
      return;
    }
    setStatus(
      asDraft
        ? `Quote ${res.data.id.slice(0, 8)} drafted — $${(res.data.total_cents / 100).toFixed(2)}`
        : `Order ${res.data.id.slice(0, 8)} created — $${(res.data.total_cents / 100).toFixed(2)}`,
    );
    await refreshMeta();
    setPanel("orders");
  };

  const sendQuote = async (id: string) => {
    const res = await api.sendOrderQuote(id);
    if (!res.success) setStatus(res.error);
    else setStatus("Quote queued to Signal outbox");
    if (selectedId) await refreshMessages(selectedId);
    await refreshMeta();
  };

  const confirmDraftOrder = async (id: string) => {
    const res = await api.confirmOrder(id);
    if (!res.success) setStatus(res.error);
    else setStatus(`Order ${id.slice(0, 8)} confirmed`);
    await refreshMeta();
  };

  const duplicateAsDraft = async (id: string) => {
    const res = await api.duplicateOrderAsDraft(id);
    if (!res.success) {
      setStatus(res.error);
      return null;
    }
    setStatus(`Draft ${res.data.id.slice(0, 8)} from ${id.slice(0, 8)}`);
    await refreshMeta();
    setFocusOrderId(res.data.id);
    setPanel("orders");
    return res.data;
  };

  const editDraftFirstLineQty = async (o: Order) => {
    const line = o.lines[0];
    if (!line) {
      setStatus("Draft has no lines");
      return;
    }
    const raw = window.prompt(
      `New qty for ${line.name} (${line.unit || "ea"})`,
      String(line.quantity),
    );
    if (raw == null) return;
    const qty = Number(raw);
    if (!Number.isFinite(qty) || qty <= 0) {
      setStatus("Qty must be a number > 0");
      return;
    }
    const res = await api.updateDraftOrderLines(o.id, [
      {
        productId: line.product_id,
        quantity: qty,
        unit: line.unit || "",
      },
    ]);
    if (!res.success) setStatus(res.error);
    else setStatus(`Draft ${o.id.slice(0, 8)} lines updated`);
    await refreshMeta();
  };

  const adjustStock = async (p: Product, delta: number) => {
    const reason =
      window.prompt(
        `Adjust ${p.name} by ${delta > 0 ? "+" : ""}${delta} (${(p.stock_unit || p.base_unit || p.unit || "ea").trim()}) — reason (optional)`,
        "",
      ) ?? undefined;
    if (reason === undefined) return; // cancelled
    const res = await api.adjustProductStock(p.id, delta, reason.trim() || undefined);
    if (!res.success) setStatus(res.error);
    else setStatus(`Stock updated: ${p.name} → ${productStockLabel(res.data)}`);
    await refreshMeta();
  };

  const exportProductsCsv = async () => {
    const res = await api.exportProductsCsv();
    if (!res.success) {
      setStatus(res.error);
      return;
    }
    await api.openPath(res.data.path);
    setStatus(`Products CSV exported (${res.data.bytes} bytes)`);
  };

  const importProductsCsvFile = async (file: File | null) => {
    if (!file) return;
    const csv = await file.text();
    const dry = await api.importProductsCsv(csv, true);
    if (!dry.success) {
      setStatus(dry.error);
      return;
    }
    const preview = dry.data;
    const errHint =
      preview.errors.length > 0
        ? `\nErrors (sample): ${preview.errors.slice(0, 3).join("; ")}`
        : "";
    const ok = window.confirm(
      `CSV dry-run: ${preview.creates} creates, ${preview.upserts} upserts` +
        (preview.sample.length ? `\nSample: ${preview.sample.slice(0, 3).join(", ")}` : "") +
        errHint +
        "\n\nApply import?",
    );
    if (!ok) {
      setStatus(
        `Dry-run only: ${preview.creates} creates, ${preview.upserts} upserts` +
          (preview.errors.length ? ` · ${preview.errors.length} row errors` : ""),
      );
      return;
    }
    const apply = await api.importProductsCsv(csv, false);
    if (!apply.success) {
      setStatus(apply.error);
      return;
    }
    setStatus(
      `Imported: ${apply.data.creates} creates, ${apply.data.upserts} upserts` +
        (apply.data.errors.length ? ` · ${apply.data.errors.length} row errors` : ""),
    );
    await refreshMeta();
  };

  const loadIvrMenusEditor = async () => {
    if (!canInvoke()) {
      setIvrMenusDraft((cur) => cur ?? emptyMenus());
      setIvrMenusError(null);
      return;
    }
    const res = await api.getIvrMenus();
    if (!res.success) {
      if (!isDesktopUnavailable(res.error)) setIvrMenusError(res.error);
      return;
    }
    setIvrMenusDraft(res.data);
    setIvrMenusError(null);
  };

  const saveIvrMenusDraft = async () => {
    if (!ivrMenusDraft) {
      setStatus("Load menus first");
      return;
    }
    setIvrMenusBusy(true);
    setIvrMenusError(null);
    try {
      const res = await api.setIvrMenus(ivrMenusDraft);
      if (!res.success) {
        setIvrMenusError(res.error);
        return;
      }
      setIvrMenusDraft(res.data);
      setStatus("Buyer menu saved");
    } finally {
      setIvrMenusBusy(false);
    }
  };

  const resetIvrMenusDemo = async () => {
    if (!window.confirm("Replace your menu with the built-in starter demo?")) return;
    setIvrMenusBusy(true);
    const res = await api.resetIvrMenus();
    setIvrMenusBusy(false);
    if (!res.success) {
      setIvrMenusError(res.error);
      return;
    }
    setIvrMenusDraft(res.data);
    setIvrMenusError(null);
    setStatus("Starter demo menu loaded — save if you want to keep it");
  };

  const previewIvrPath = async (inputs: string[]) => {
    if (inputs.length === 0) {
      setIvrPreviewSteps([]);
      return;
    }
    const res = await api.previewIvrPath(inputs);
    if (!res.success) {
      if (!isDesktopUnavailable(res.error)) {
        setIvrMenusError(res.error);
      }
      return;
    }
    setIvrPreviewSteps(res.data);
    setIvrMenusError(null);
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

  const onExportDataBundle = async () => {
    setBackupBusy(true);
    const res = await api.exportDataBundle();
    setBackupBusy(false);
    if (!res.success) {
      setStatus(res.error);
      return;
    }
    await api.openPath(res.data.path);
    setStatus(
      `Data bundle exported (${res.data.counts.files} files, ${res.data.counts.attachments} attachments)`,
    );
  };

  const onImportDataBundleFile = async (file: File | null) => {
    if (!file) return;
    if (restartRequired) {
      setStatus("Restart SignalX before importing again");
      return;
    }
    const ok = window.confirm(
      `Import data bundle (${importMode})?\n\n` +
        "This does NOT move Signal registration — Device link and .signalx.env are still required on a new machine.\n\n" +
        (importMode === "replace"
          ? "Replace will overwrite catalog, orders, IVR, threads, and related stores for this account (current files are snapshotted under exports/pre-import-*)."
          : "Merge will union messages/outbox by id and upsert commerce; restart is still required."),
    );
    if (!ok) return;
    setBackupBusy(true);
    try {
      const { b64 } = await fileToBase64(file);
      const res = await api.importDataBundle({ bytesBase64: b64, mode: importMode });
      if (!res.success) {
        setStatus(res.error);
        return;
      }
      setRestartRequired(true);
      setStatus(
        `Import OK (${res.data.files_written} files). Restart SignalX to apply — writes are locked until then.`,
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBackupBusy(false);
    }
  };

  const quitForRestart = async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().close();
    } catch {
      setStatus("Close the SignalX window, then reopen to finish import.");
    }
  };

  useEffect(() => {
    if (panel === "outbox") void refreshGlobalOutbox();
  }, [panel]);

  useEffect(() => {
    if (panel === "settings" && settingsTab === "ivr" && !ivrMenusDraft) {
      void loadIvrMenusEditor();
    }
  }, [panel, settingsTab]);

  const tone = healthTone(health);
  const title = selectedId ? threadTitle(selectedId, contacts, groups, customers) : "SignalX";
  // Product thumbnails arrive as base64 over the API, one call each, so fetch
  // them lazily for the catalog grid and keep what we've already resolved.
  useEffect(() => {
    if (panel !== "catalog" && panel !== "products") return;
    const missing = products.filter((p) => p.image_path && !productImagesReal[p.id]);
    if (missing.length === 0) return;
    let cancelled = false;
    void (async () => {
      const resolved: Record<string, string> = {};
      for (const p of missing) {
        const img = await api.getProductImage(p.id);
        if (img.success) {
          resolved[p.id] = `data:${img.data.mime};base64,${img.data.bytes_base64}`;
        }
      }
      if (!cancelled && Object.keys(resolved).length > 0) {
        setProductImages((prev) => ({ ...prev, ...resolved }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, products]);

  const showProfileRail = panel === "threads" && !!selectedId;
  // Only panels that render their own list column have a list seam; the wide
  // panels span both tracks and so expose just the rail edge.
  const panelLayout: PanelLayout = {
    listKey:
      panel === "people" || panel === "catalog" || panel === "products"
        ? "listPeople"
        : panel === "threads"
          ? "list"
          : null,
    aside: showProfileRail,
  };
  const { shellRef, styleVars, beginDrag, resetColumn, nudge } = usePanelWidths(panelLayout);
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
      if (threadFilter.kind === "dm" && isGroupThread(t.id)) return false;
      if (threadFilter.kind === "group" && !isGroupThread(t.id)) return false;
      if (threadFilter.unread && t.unread_count <= 0) return false;
      if (threadFilter.pending && t.outbox_count <= 0) return false;
      if (!searchQ.trim()) return true;
      const label = threadTitle(t.id, contacts, groups, customers);
      return includesQ(`${label} ${t.id} ${t.last_preview ?? ""}`, searchQ);
    });
  }, [threads, threadFilter, searchQ, contacts, groups, customers]);

  const directory = useMemo(
    () => buildDirectory(contacts, groups, customers, threads, orders),
    [contacts, groups, customers, threads, orders],
  );

  const messageCorpus = useMemo(() => {
    const map = new Map(messagesReal.map((m) => [m.id, m]));
    if (USE_FIXTURES) {
      for (const m of fxMessages) {
        if (!map.has(m.id)) map.set(m.id, m);
      }
    }
    return [...map.values()];
  }, [messagesReal]);

  const filteredOrders = useMemo(() => {
    let rows: Order[];

    // Use smart matching if search query exists, otherwise use simple haystack
    if (orderFilter.q.trim()) {
      const partyOfLocal = (id: string) => threadTitle(id, contacts, groups, customers);
      rows = matchingOrders(orders, orderFilter.q, directory, messageCorpus, partyOfLocal);
    } else {
      rows = orders;
    }

    // Apply thisThread filter
    if (orderFilter.thisThread && selectedId) {
      rows = rows.filter((o) => o.thread_id === selectedId);
    }

    return rows;
  }, [orders, orderFilter.q, orderFilter.thisThread, selectedId, directory, messageCorpus, contacts, groups, customers, threadTitle]);

  const partyOf = (id: string) => threadTitle(id, contacts, groups, customers);

  const openSearchScope = (scope: SearchScope) => {
    const q = searchQ;
    setSearchScope(scope);
    if (scope === "messages") {
      setPanel("threads");
      return;
    }
    if (scope === "people") {
      setPeopleSearchQuery(q);
      setPeopleSearchTick((n) => n + 1);
      setPanel("people");
      return;
    }
    if (scope === "catalog") {
      setCatalogSearchQuery(q);
      setCatalogSearchTick((n) => n + 1);
      setPanel("catalog");
      return;
    }
    setOrderFilter((f) => ({ ...f, q, thisThread: false }));
    setPanel("orders");
  };

  const searchPeopleHits = useMemo(
    () => matchingPeople(directory, searchLiveQ, messageCorpus, orders),
    [directory, searchLiveQ, messageCorpus, orders],
  );
  const searchOrderHits = useMemo(
    () => matchingOrders(orders, searchLiveQ, directory, messageCorpus, partyOf),
    [orders, searchLiveQ, directory, messageCorpus, contacts, groups, customers],
  );
  const searchProductHits = useMemo(
    () => matchingProducts(products, searchLiveQ, directory, orders, messageCorpus),
    [products, searchLiveQ, directory, orders, messageCorpus],
  );
  const searchMessageHits = useMemo(
    () => matchingMessages(searchLiveQ, directory, messageCorpus, searchHits, partyOf),
    [searchLiveQ, directory, messageCorpus, searchHits, contacts, groups, customers],
  );

  const filteredAudit = useMemo(() => {
    return audit.filter((e) => {
      if (auditFilter.outcome !== "all" && e.outcome !== auditFilter.outcome) return false;
      return includesQ(
        `${e.thread_id} ${threadTitle(e.thread_id, contacts, groups, customers)} ${e.outcome} ${e.draft} ${e.reason || ""}`,
        auditFilter.q,
      );
    });
  }, [audit, auditFilter, contacts, groups, customers]);

  const auditOutcomes = useMemo(() => {
    const set = new Set(audit.map((e) => e.outcome).filter(Boolean));
    return ["all", ...Array.from(set).sort()];
  }, [audit]);

  const setupNeeded = useMemo(
    () => needsDeviceSetup(diagnostics, health, linkStatus),
    [diagnostics, health, linkStatus],
  );

  const openDeviceLinkSetup = () => {
    setPanel("settings");
    setSettingsTab("account");
  };

  const onUnlock = async () => {
    const id = unlockId || session?.accounts[0]?.id;
    if (!id) {
      setStatus("No roster account to unlock");
      return;
    }
    setRosterBusy(true);
    const res = await api.unlockAccount(id, sessionPin);
    setRosterBusy(false);
    if (!res.success) {
      setStatus(res.error);
      return;
    }
    setSessionPin("");
    applySession(res.data);
    setStatus("Unlocked");
    await bootstrap();
  };

  const onLock = async () => {
    setAccountMenuOpen(false);
    const res = await api.lockSession();
    if (!res.success) {
      setStatus(res.error);
      return;
    }
    applySession(res.data);
    setStatus("Session locked");
  };

  const onAddAccount = async (number: string, pin: string, label: string) => {
    const normalized = normalizePhoneInput(number) || number.trim();
    setRosterBusy(true);
    const res = await api.addAccount(normalized, pin, label);
    setRosterBusy(false);
    if (!res.success) {
      setStatus(res.error);
      return;
    }
    applySession(res.data);
    setAddNumber("");
    setAddPin("");
    setAddLabel("");
    setStatus("Account added to roster — unlock it to switch");
  };

  if (!isTauriRuntime()) {
    return (
      <div className="shell desktop-gate">
        <main className="desktop-gate-panel">
          <p className="brand-mark">SignalX</p>
          <h1>Open the desktop app</h1>
          <p>
            This browser view is layout-only. Messaging, Signal linking, and your catalog run in the
            local SignalX window.
          </p>
          <pre className="desktop-gate-cmd">./run-dev.sh</pre>
          <p className="hint tight">
            Or double-click <code>SignalX-Dev.command</code>. Needs Rust 1.88+ (see{" "}
            <code>rust-toolchain.toml</code>) and Node. Production build:{" "}
            <code>npm run desktop:build</code>
          </p>
        </main>
      </div>
    );
  }

  return (
    <div
      ref={shellRef}
      style={styleVars}
      className={[
        "shell",
        showProfileRail ? "shell-with-profile" : "",
        panel === "people" || panel === "catalog" || panel === "products" ? "shell-people" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <PanelResizer
        column="rail"
        seam="rail"
        label="Resize sidebar"
        onBegin={beginDrag}
        onReset={resetColumn}
        onNudge={nudge}
      />
      {panelLayout.listKey && (
        <PanelResizer
          column={panelLayout.listKey}
          seam="list"
          label="Resize list column"
          onBegin={beginDrag}
          onReset={resetColumn}
          onNudge={nudge}
        />
      )}
      {panelLayout.aside && (
        <PanelResizer
          column="aside"
          seam="aside"
          label="Resize detail column"
          onBegin={beginDrag}
          onReset={resetColumn}
          onNudge={nudge}
        />
      )}
      {restartRequired && (
        <div className="restart-banner" role="alert">
          <span>Imported data is on disk — quit and reopen SignalX to load it.</span>
          <button type="button" className="action-btn primary" onClick={() => void quitForRestart()}>
            Quit now
          </button>
        </div>
      )}
      {session?.locked && (
        <div className="lock-overlay" role="dialog" aria-modal="true" aria-labelledby="lock-title">
          <div className="lock-card">
            <p className="brand-mark">SignalX</p>
            <h1 id="lock-title">Unlock account</h1>
            <p className="hint tight">One live session. Locked numbers do not send or receive.</p>
            <div className="lock-accounts">
              {(session.accounts.length ? session.accounts : []).map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={unlockId === a.id ? "lock-account active" : "lock-account"}
                  onClick={() => setUnlockId(a.id)}
                >
                  <span className="lock-account-label">{a.label || a.e164 || `…${a.last4}`}</span>
                  <span className="lock-account-meta">
                    ••••{a.last4}
                    {a.has_pin ? " · PIN" : ""}
                  </span>
                </button>
              ))}
            </div>
            <label className="field-label" htmlFor="session-pin">
              PIN
            </label>
            <input
              id="session-pin"
              type="password"
              autoComplete="off"
              placeholder="4–8 digits"
              value={sessionPin}
              onChange={(e) => setSessionPin(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void onUnlock()}
            />
            <button
              type="button"
              className="action-btn primary"
              disabled={rosterBusy || !unlockId}
              onClick={() => void onUnlock()}
            >
              {rosterBusy ? "Unlocking…" : "Unlock"}
            </button>
            {session.linked_unseen.length > 0 && (
              <p className="hint tight">
                Linked but not in roster: {session.linked_unseen.join(", ")}. Add them in Settings
                after unlock, or below.
              </p>
            )}
          </div>
        </div>
      )}
      <aside className="rail">
        <div className="brand">
          <span className="brand-mark">SignalX</span>
          <span className={`health health-${tone}`} title={healthLabel(health)} />
        </div>

        <label className="field-label">Account</label>
        <div className="account-switch">
          <button
            type="button"
            className="account-label account-label-btn"
            title={accountNumber ?? undefined}
            aria-expanded={accountMenuOpen}
            onClick={() => setAccountMenuOpen((o) => !o)}
          >
            <span className="account-label-text">
              {session?.locked
                ? "Locked"
                : accountNumber ?? "Not configured"}
            </span>
            <span className="account-chevron" aria-hidden>
              ▾
            </span>
          </button>
          {accountMenuOpen && (
            <div className="account-menu" role="menu">
              <button
                type="button"
                className="danger"
                role="menuitem"
                onClick={() => {
                  setAccountMenuOpen(false);
                  void onLock();
                }}
              >
                Lock session
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAccountMenuOpen(false);
                  void onLock();
                }}
              >
                Switch account…
              </button>
            </div>
          )}
        </div>

        {setupNeeded && (
          <div className="setup-banner">
            <p>Link this Mac to start receiving Signal messages.</p>
            <button type="button" className="action-btn primary" onClick={openDeviceLinkSetup}>
              Open device link
            </button>
          </div>
        )}

        <div className="rail-status" aria-label="System status">
          <span
            className={`rail-chip ${ai?.configured && ai.ollama_reachable ? "ok" : "warn"}`}
            title={
              ai?.configured
                ? ai.ollama_reachable
                  ? ai.ollama_model || "ollama"
                  : "unreachable"
                : "not configured"
            }
          >
            AI
          </span>
          {autoSettings?.enabled && (
            <span className="rail-chip danger" title="Auto-reply on">
              Auto
            </span>
          )}
          {ivrSettings?.enabled && (
            <span className="rail-chip ok" title="Buyer menu on">
              IVR
            </span>
          )}
        </div>

        <form
          className={panel === "search" ? "rail-search active" : "rail-search"}
          onSubmit={(e) => {
            e.preventDefault();
            if (!searchQ.trim()) return;
            setPanel("search");
            void onSearch();
          }}
        >
          <IconSearch className="rail-search-ico" />
          <input
            ref={searchInputRef}
            value={searchQ}
            onChange={(e) => {
              const v = e.target.value;
              setSearchQ(v);
              if (v.trim()) setPanel("search");
            }}
            placeholder="Search"
            aria-label="Search Messages, People, Catalog, and Orders"
          />
          {searchQ && (
            <button
              type="button"
              className="icon-btn tiny"
              onClick={() => setSearchQ("")}
              aria-label="Clear search"
            >
              <IconX />
            </button>
          )}
        </form>

        <nav className="nav">
          {NAV_GROUPS.map((group, gi) => (
            <div className="nav-group" key={gi}>
              {group.map(({ id, label, ico }) => (
                <button
                  key={id}
                  type="button"
                  className={panel === id ? "nav-btn active" : "nav-btn"}
                  onClick={() => {
                    setPanel(id);
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
            </div>
          ))}
        </nav>

        <div className="rail-foot">
          {status && (
            <div className="rail-status" role="status">
              <span>{status}</span>
              <button type="button" className="ghost-btn" onClick={() => setStatus(null)}>
                Dismiss
              </button>
            </div>
          )}
          <button
            type="button"
            className="ghost-btn"
            onClick={() => void api.exportAccount("json").then((r) => setStatus(errMsg(r) || "Chat export complete"))}
          >
            Export chat
          </button>
        </div>
      </aside>

      {panel === "threads" && (
        <section className="thread-col">
          <header className="col-head">
            Messages
            <button
              type="button"
              className={newDmOpen ? "icon-btn active" : "icon-btn"}
              aria-label="New message"
              aria-pressed={newDmOpen}
              title="New message"
              onClick={() => setNewDmOpen((v) => !v)}
            >
              <IconCompose />
            </button>
          </header>
          {newDmOpen && (
            <div className="compose-strip">
              <input
                autoFocus
                placeholder="+15551234567"
                value={newDmPhone}
                onChange={(e) => {
                  setNewDmPhone(e.target.value);
                  setNewDmError(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && void openNewDm()}
                aria-invalid={!!newDmError}
              />
              <button type="button" className="action-btn primary" onClick={() => void openNewDm()}>
                Start
              </button>
              {newDmError && <span className="warn-text">{newDmError}</span>}
            </div>
          )}
          <div className="filter-strip">
            <div className="chip-row">
              {(["all", "dm", "group"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={threadFilter.kind === k ? "chip active" : "chip"}
                  onClick={() => setThreadFilter((f) => ({ ...f, kind: k }))}
                >
                  {k === "all" ? "All" : k === "dm" ? "Direct" : "Groups"}
                </button>
              ))}
              <span className="chip-sep" aria-hidden />
              <button
                type="button"
                className={threadFilter.unread ? "chip active" : "chip"}
                aria-pressed={threadFilter.unread}
                onClick={() => setThreadFilter((f) => ({ ...f, unread: !f.unread }))}
              >
                Unread
              </button>
              <button
                type="button"
                className={threadFilter.pending ? "chip active" : "chip"}
                aria-pressed={threadFilter.pending}
                onClick={() => setThreadFilter((f) => ({ ...f, pending: !f.pending }))}
              >
                Pending
              </button>
              <span className="chip-count">
                {filteredThreads.length}/{threads.length}
              </span>
            </div>
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
                className={selectedId === t.id ? "thread-row active p-3 gap-3" : "thread-row p-3 gap-3"}
                onClick={() => {
                  setSelectedId(t.id);
                  setPanel("threads");
                }}
              >
                <span className="avatar-dot" style={avatarTint(t.id)} aria-hidden>
                  {initials(threadTitle(t.id, contacts, groups, customers))}
                </span>
                <div className="thread-row-body">
                  <div className="thread-row-top">
                    <span className="thread-name">{threadTitle(t.id, contacts, groups, customers)}</span>
                    <span className="thread-time">{fmtTime(t.last_message_timestamp)}</span>
                  </div>
                  <div className="thread-row-meta">
                    {t.last_preview ? (
                      <span className="snippet">{t.last_preview}</span>
                    ) : (
                      <span className="snippet muted">No messages yet</span>
                    )}
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
        <SearchScreen
          query={searchLiveQ}
          scope={searchScope}
          onTabClick={openSearchScope}
          people={searchPeopleHits}
          products={searchProductHits}
          orders={searchOrderHits}
          messages={searchMessageHits}
          counts={{
            messages: searchMessageHits.length,
            people: searchPeopleHits.length,
            catalog: searchProductHits.length,
            orders: searchOrderHits.length,
          }}
          money={money}
          fmtTime={fmtTime}
          initials={initials}
          avatarTint={avatarTint}
          productPriceLabel={productPriceLabel}
          onOpenMessage={(threadId) => {
            setSelectedId(threadId);
            setPanel("threads");
          }}
          onOpenPerson={(key) => {
            setPeopleKey(key);
            setPanel("people");
          }}
          onOpenProduct={(id) => {
            const p = products.find((x) => x.id === id);
            setCatalogProductId(id);
            setCatalogSearchQuery(p?.name ?? searchQ);
            setCatalogSearchTick((n) => n + 1);
            setPanel("catalog");
          }}
          onOpenOrder={(id) => {
            const o = orders.find((x) => x.id === id);
            if (o) setSelectedId(o.thread_id);
            setFocusOrderId(id);
            setOrderFilter({ ...EMPTY_ORDER_FILTER });
            setPanel("orders");
          }}
        />
      )}

      {panel === "people" && (
        <PeopleScreen
          contacts={contacts}
          groups={groups}
          customers={customers}
          threads={threads}
          orders={orders}
          selectedKey={peopleKey}
          onSelectKey={setPeopleKey}
          onOpenChat={(threadId) => {
            setSelectedId(threadId);
            setPanel("threads");
          }}
          onNavigate={(target) => {
            if (target === "orders" && peopleKey) {
              const person = contacts.find((c) => c.contact_id === peopleKey);
              const group = groups.find((g) => g.group_id === peopleKey);
              setSelectedId(person?.contact_id ?? group?.group_id ?? peopleKey);
              setOrderFilter((f) => ({ ...f, thisThread: true }));
            }
            setPanel(target);
          }}
          onRefresh={() => void refreshMeta()}
          setStatus={setStatus}
          money={money}
          fmtTime={fmtTime}
          initials={initials}
          avatarTint={avatarTint}
          contactForm={contactForm}
          setContactForm={setContactForm}
          addContact={addContact}
          groupForm={groupForm}
          setGroupForm={setGroupForm}
          createGroup={createGroup}
          searchQuery={peopleSearchQuery}
          searchQueryTick={peopleSearchTick}
        />
      )}

      {(panel === "catalog" || panel === "products") && (
        <CatalogScreen
          products={products}
          selectedId={catalogProductId}
          onSelectId={setCatalogProductId}
          catalogSearchQuery={catalogSearchQuery}
          catalogSearchTick={catalogSearchTick}
          people={directory}
          orders={orders}
          messages={messageCorpus}
          productImages={productImages}
          productPriceLabel={productPriceLabel}
          productStockLabel={productStockLabel}
          productWeightLabel={productWeightLabel}
          initials={initials}
          formOpen={catalogFormOpen}
          onNew={() => {
            resetProductForm();
            setCatalogFormOpen(true);
          }}
          onEdit={(p) => void editProduct(p)}
          onDelete={(id) => {
            if (catalogProductId === id) setCatalogProductId(null);
            void removeProduct(id);
          }}
          onAdjustStock={(p, d) => void adjustStock(p, d)}
          onExportCsv={() => void exportProductsCsv()}
          onImportCsv={(file) => void importProductsCsvFile(file)}
          form={
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
                        if (productForm.id) {
                          setProductImages((prev) => {
                            const next = { ...prev };
                            delete next[productForm.id];
                            return next;
                          });
                        }
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
                  <input
                    placeholder="Low-stock alert (base units, blank = off)"
                    value={productForm.lowStockThreshold}
                    onChange={(e) =>
                      setProductForm((f) => ({ ...f, lowStockThreshold: e.target.value }))
                    }
                  />
                </div>

                <div className="pack-manager">
                  <div className="allowlist-head">
                    <span className="field-label">Sell packs (optional)</span>
                    <button
                      type="button"
                      className="action-btn"
                      onClick={() =>
                        setSellPacks((rows) => [
                          ...rows,
                          { ...newPackRow(), unit: productForm.baseUnit || "ea" },
                        ])
                      }
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
                <button type="button" className="action-btn primary" onClick={() => void saveProduct()}>
                  {productForm.id ? "Save product" : "Add product"}
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => resetProductForm()}
                >
                  {productForm.id ? "Cancel edit" : "Cancel"}
                </button>
              </div>
            </div>
          }
        />
      )}

      {panel === "orders" && (
        <OrdersScreen
          orders={orders}
          filteredOrders={filteredOrders}
          orderFilter={orderFilter}
          setOrderFilter={setOrderFilter}
          products={products}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          setPanel={setPanel}
          orderProductId={orderProductId}
          setOrderProductId={setOrderProductId}
          orderSellOptionId={orderSellOptionId}
          setOrderSellOptionId={setOrderSellOptionId}
          orderQty={orderQty}
          setOrderQty={setOrderQty}
          placeOrder={placeOrder}
          sendQuote={sendQuote}
          sendInvoice={sendInvoice}
          confirmDraftOrder={confirmDraftOrder}
          editDraftFirstLineQty={editDraftFirstLineQty}
          setOrderLifecycle={setOrderLifecycle}
          duplicateAsDraft={duplicateAsDraft}
          focusOrderId={focusOrderId}
          onConsumedFocus={() => setFocusOrderId(null)}
          orderParty={orderParty}
          threadTitle={threadTitle}
          contacts={contacts}
          groups={groups}
          customers={customers}
          money={money}
          fmtTime={fmtTime}
          orderStatusTone={orderStatusTone}
          productPriceLabel={productPriceLabel}
          productStockLabel={productStockLabel}
          formatPhone={formatPhone}
          initials={initials}
          avatarTint={avatarTint}
        />
      )}

      {panel === "sales" && (
        <SalesScreen
          salesSummary={salesSummary}
          commerceAudit={commerceAudit}
          salesRange={salesRange}
          setSalesRange={setSalesRange}
          salesStatus={salesStatus}
          setSalesStatus={setSalesStatus}
          setSalesSummary={setSalesSummary}
          setCommerceAudit={setCommerceAudit}
          contacts={contacts}
          groups={groups}
          customers={customers}
          setStatus={setStatus}
          setPanel={setPanel}
          setSelectedId={setSelectedId}
          setFocusOrderId={setFocusOrderId}
          threadTitle={threadTitle}
          money={money}
          fmtTime={fmtTime}
          orderStatusTone={orderStatusTone}
        />
      )}

      {panel === "outbox" && (
        <section className="thread-col wide">
          <header className="col-head">
            Outbox
            <span className="col-meta">
              {(() => {
                const queued = globalOutbox.filter((o) => o.state === "queued").length;
                const sending = globalOutbox.filter((o) => o.state === "sending").length;
                const failed = globalOutbox.filter((o) => o.state === "failed").length;
                if (queued + sending + failed === 0 && outboxSummary) {
                  return `${outboxSummary.queued} queued · ${outboxSummary.sending} sending · ${outboxSummary.failed} failed`;
                }
                return `${queued} queued · ${sending} sending · ${failed} failed`;
              })()}
            </span>
          </header>
          <div className="filter-strip">
            <button type="button" className="ghost-btn" onClick={() => void refreshGlobalOutbox()}>
              Refresh
            </button>
            <span className="col-meta">{globalOutbox.length} open</span>
          </div>
          <div className="outbox-table">
            {globalOutbox.length === 0 && (
              <p className="empty">Outbox clear — nothing queued or failed.</p>
            )}
            {globalOutbox.length > 0 && (
              <div className="outbox-head" aria-hidden>
                <span>To</span>
                <span>Preview</span>
                <span>Status</span>
                <span>Age</span>
                <span />
              </div>
            )}
            {globalOutbox.map((o) => (
              <div key={o.id} className={`outbox-row state-${o.state}`}>
                <div className="outbox-to">
                  <strong>{threadTitle(o.thread_id, contacts, groups, customers)}</strong>
                  {o.attachment_path ? <span className="convo-sub">Attachment</span> : null}
                </div>
                <div className="outbox-preview">
                  {o.content.slice(0, 120) || (o.attachment_path ? "(attachment)" : "(empty)")}
                  {o.content.length > 120 ? "…" : ""}
                  {o.last_error && <div className="bubble-err">{o.last_error}</div>}
                </div>
                <span
                  className={`status-pill status-${
                    o.state === "failed" ? "danger" : o.state === "sending" ? "warn" : "muted"
                  }`}
                >
                  {o.state}
                </span>
                <span className="outbox-age">
                  {fmtTime(o.created_at)}
                  {o.attempt_count > 0 ? ` · ${o.attempt_count}` : ""}
                </span>
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
                    Open
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
                    <span className={`outcome outcome-${e.outcome.toLowerCase().replace(/\s+/g, "_")}`}>{e.outcome}</span>
                    <span className="thread-time">{fmtTime(e.created_at)}</span>
                  </div>
                  <div className="audit-thread">{threadTitle(e.thread_id, contacts, groups, customers)}</div>
                <div className="snippet">{e.draft}</div>
                {e.reason && <div className="reason">{e.reason}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {panel === "settings" && (
        <section className="thread-col wide">
          <header className="col-head">
            <div>
              <div>Settings</div>
              <div className="col-head-sub">
                {settingsTab === "account" && "Link Signal and check that messages are flowing"}
                {settingsTab === "ivr" && "Let buyers text a number — you write the menu"}
                {settingsTab === "auto" && "Optional AI replies — only for chats you allow"}
                {settingsTab === "backup" && "Copy your catalog, orders, and chats to a file"}
              </div>
            </div>
          </header>
          <div className="work-tabs" role="tablist" aria-label="Settings sections">
            {(
              [
                ["account", "Account"],
                ["ivr", "Buyer menu"],
                ["auto", "Auto-reply"],
                ["backup", "Backup"],
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
            {settingsTab === "account" && (
              <>
                <div className="settings-card">
                  <div className="settings-card-head">
                    <h3>Status</h3>
                    <span
                      className={`status-pill status-${
                        setupNeeded
                          ? "warn"
                          : diagnostics?.signal_cli_usable
                            ? "ok"
                            : "danger"
                      }`}
                    >
                      {setupNeeded
                        ? "Needs link"
                        : !canInvoke() || !diagnostics
                          ? "Preview"
                          : diagnostics.signal_cli_usable
                            ? "Ready"
                            : "signal-cli issue"}
                    </span>
                  </div>
                  <dl className="diag-grid diag-grid-4">
                    <div>
                      <dt>Account</dt>
                      <dd title={diagnostics?.number || undefined}>
                        {diagnostics?.number || "Not set"}
                      </dd>
                    </div>
                    <div>
                      <dt>Receive</dt>
                      <dd title={healthLabel(health)}>{healthLabel(health)}</dd>
                    </div>
                    <div>
                      <dt>signal-cli</dt>
                      <dd>
                        {diagnostics?.signal_cli_usable
                          ? diagnostics.signal_cli_version || "ok"
                          : "broken"}
                      </dd>
                    </div>
                    <div>
                      <dt>AI</dt>
                      <dd>
                        {ai?.configured
                          ? ai.ollama_reachable
                            ? ai.ollama_model || "ollama"
                            : "unreachable"
                          : "off"}
                      </dd>
                    </div>
                  </dl>
                  {diagnostics?.signal_cli_last_error && (
                    <p className="hint tight warn-text">{diagnostics.signal_cli_last_error}</p>
                  )}
                  <details className="settings-details">
                    <summary>Paths &amp; diagnostics</summary>
                    <dl className="diag-list">
                      <div>
                        <dt>Config</dt>
                        <dd>{diagnostics?.config_path || "—"}</dd>
                      </div>
                      <div>
                        <dt>Env file</dt>
                        <dd>{diagnostics?.env_path || "—"}</dd>
                      </div>
                      <div>
                        <dt>signal-cli bin</dt>
                        <dd>{diagnostics?.signal_cli_path || "—"}</dd>
                      </div>
                      <div>
                        <dt>App data</dt>
                        <dd>{diagnostics?.app_data_dir || "—"}</dd>
                      </div>
                    </dl>
                  </details>
                </div>

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
                  <p className="hint tight">
                    Link this Mac to your Signal phone. After it says Linked, add the number to the
                    roster with a PIN — do not relaunch to switch identities.
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
                      Set <code>SIGNALX_SIGNALCLI_CONFIG</code> in <code>.signalx.env</code> before
                      linking.
                    </p>
                  )}
                </div>

                <div className="settings-card">
                  <div className="settings-card-head">
                    <h3>Roster</h3>
                  </div>
                  <p className="hint tight">
                    Each number is a separate shop (catalog, orders, IVR). Only one session is live.
                    Switching stops receive and the outbox for the previous number.
                  </p>
                  <ul className="roster-list">
                    {(session?.accounts ?? []).map((a) => (
                      <li key={a.id} className={a.is_active ? "roster-row active" : "roster-row"}>
                        <div>
                          <strong>{a.label || a.e164}</strong>
                          <span className="hint tight">
                            {" "}
                            ••••{a.last4}
                            {a.has_pin ? " · PIN" : " · no PIN"}
                            {a.is_active ? " · live" : ""}
                          </span>
                        </div>
                        {a.is_active && (
                          <form
                            className="roster-pin-form"
                            onSubmit={(e) => {
                              e.preventDefault();
                              void (async () => {
                                const res = await api.setAccountPin(
                                  a.id,
                                  changePinCurrent,
                                  changePinNew,
                                );
                                if (!res.success) {
                                  setStatus(res.error);
                                  return;
                                }
                                applySession(res.data);
                                setChangePinCurrent("");
                                setChangePinNew("");
                                setStatus("PIN updated");
                              })();
                            }}
                          >
                            <input
                              type="password"
                              placeholder="Current PIN (blank if none)"
                              value={changePinCurrent}
                              onChange={(e) => setChangePinCurrent(e.target.value)}
                            />
                            <input
                              type="password"
                              placeholder="New PIN"
                              value={changePinNew}
                              onChange={(e) => setChangePinNew(e.target.value)}
                              required
                            />
                            <button type="submit" className="ghost-btn">
                              Set PIN
                            </button>
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                  {(session?.linked_unseen ?? []).length > 0 && (
                    <p className="hint tight">
                      Linked in signal-cli but not in roster:{" "}
                      {session?.linked_unseen.join(", ")}. Add below.
                    </p>
                  )}
                  <form
                    className="roster-add"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void onAddAccount(addNumber, addPin, addLabel);
                    }}
                  >
                    <input
                      placeholder="+15551234567"
                      value={addNumber}
                      onChange={(e) => setAddNumber(e.target.value)}
                      required
                    />
                    <input
                      placeholder="Label (optional)"
                      value={addLabel}
                      onChange={(e) => setAddLabel(e.target.value)}
                    />
                    <input
                      type="password"
                      placeholder="PIN (4+ chars)"
                      value={addPin}
                      onChange={(e) => setAddPin(e.target.value)}
                      required
                    />
                    <button type="submit" className="action-btn primary" disabled={rosterBusy}>
                      Add to roster
                    </button>
                  </form>
                </div>
              </>
            )}

            {settingsTab === "backup" && (
              <>
              <div className="settings-card">
                <div className="settings-card-head">
                  <h3>Backup &amp; migrate</h3>
                </div>
                <p className="hint tight">
                  Bundles cover your catalog, customers, orders, buyer menu, chats, and outbox —
                  not your Signal login. Re-link Signal on a new computer.
                </p>
                <div className="backup-actions">
                  <button
                    type="button"
                    className="action-btn primary"
                    disabled={backupBusy || restartRequired}
                    onClick={() => void onExportDataBundle()}
                  >
                    {backupBusy ? "Working…" : "Export data bundle"}
                  </button>
                  <button
                    type="button"
                    className="ghost-btn"
                    disabled={backupBusy}
                    onClick={() =>
                      void api.exportAccount("json").then((r) => {
                        if (r.success) setStatus("Chat (messages) exported");
                        else setStatus(r.error);
                      })
                    }
                  >
                    Export chat only
                  </button>
                </div>
                <div className="backup-import">
                  <div className="profile-section-title">Import</div>
                  <div className="profile-toggles">
                    <label className="toggle compact">
                      <input
                        type="radio"
                        name="import-mode"
                        checked={importMode === "replace"}
                        disabled={restartRequired}
                        onChange={() => setImportMode("replace")}
                      />
                      Replace
                    </label>
                    <label className="toggle compact">
                      <input
                        type="radio"
                        name="import-mode"
                        checked={importMode === "merge"}
                        disabled={restartRequired}
                        onChange={() => setImportMode("merge")}
                      />
                      Merge
                    </label>
                  </div>
                  <label className="field-stack">
                    <span className="field-label">Choose .zip bundle</span>
                    <input
                      type="file"
                      accept=".zip,application/zip"
                      disabled={backupBusy || restartRequired}
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        e.target.value = "";
                        void onImportDataBundleFile(f);
                      }}
                    />
                  </label>
                </div>
                {restartRequired && (
                  <div className="restart-gate">
                    <p>
                      Restart SignalX to apply imported data. Writes stay locked until you quit and
                      reopen.
                    </p>
                    <button type="button" className="action-btn primary" onClick={() => void quitForRestart()}>
                      Quit now
                    </button>
                  </div>
                )}
              </div>
              <div className="settings-card">
                <div className="settings-card-head">
                  <h3>What’s in a bundle</h3>
                </div>
                <p className="hint tight">
                  Catalog, people records, orders, buyer menu, chats, and outbox. Signal login stays
                  on the device — re-link after you move.
                </p>
              </div>
              </>
            )}

            {settingsTab === "auto" && (
              <>
              <div className="settings-card">
                <div className="settings-card-head">
                  <h3>Auto-reply</h3>
                  <span className={`status-pill status-${autoSettings?.enabled ? "warn" : "muted"}`}>
                    {autoSettings?.enabled ? "ON" : "OFF"}
                  </span>
                </div>
                <p className="hint tight">
                  Optional AI drafts that can send on their own. Keep this off unless you trust it —
                  and only for chats you approve. Groups stay off unless you turn them on one by one.
                </p>
                {autoSettings && (
                  <>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={autoSettings.enabled}
                        onChange={(e) => void saveAutoSettings({ enabled: e.target.checked })}
                      />
                      Turn on auto-reply for this account
                    </label>
                    <div className="settings-section-label">Safety limits</div>
                    <div className="settings-grid">
                      <label className="field-stack">
                        <span className="field-label">Max replies per chat / hour</span>
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
                        <span className="field-label">Quiet start (0–23)</span>
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
                        <span className="field-label">Quiet end</span>
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
                        Allowed chats ({autoSettings.allowlist.length})
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
                              <div className="thread-name">{threadTitle(tid, contacts, groups, customers)}</div>
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
              <div className="settings-card">
                <div className="settings-card-head">
                  <h3>Recent log</h3>
                  <button type="button" className="ghost-btn" onClick={() => setPanel("audit")}>
                    Open log
                  </button>
                </div>
                {audit.length === 0 ? (
                  <p className="hint tight">No auto-reply activity yet.</p>
                ) : (
                  <ul className="settings-log">
                    {audit.slice(0, 5).map((e) => (
                      <li key={e.id}>
                        <span className={`outcome outcome-${e.outcome.toLowerCase().replace(/\s+/g, "_")}`}>
                          {e.outcome}
                        </span>
                        <span>
                          {threadTitle(e.thread_id, contacts, groups, customers)}
                          {e.reason ? ` — ${e.reason}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
            )}

            {settingsTab === "ivr" && (
              <>
                <div className="settings-card">
                  <div className="settings-card-head">
                    <h3>Buyer text menu</h3>
                    <span className={`status-pill status-${ivrSettings?.enabled ? "ok" : "muted"}`}>
                      {ivrSettings?.enabled ? "ON" : "OFF"}
                    </span>
                  </div>
                  <p className="hint tight">
                    When it’s on, buyers can text a number (1 for products, 2 to order, and so on)
                    and SignalX answers for you. Turn it on here, then turn it on for each chat you
                    want. Group chats are never automated.
                  </p>
                  {ivrSettings && (
                    <>
                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={ivrSettings.enabled}
                          onChange={(e) => void saveIvrSettings({ enabled: e.target.checked })}
                        />
                        Turn on buyer menus for this account
                      </label>
                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={ivrSettings.require_allowlist}
                          onChange={(e) =>
                            void saveIvrSettings({ require_allowlist: e.target.checked })
                          }
                        />
                        Only chats I approve (recommended)
                      </label>
                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={!!ivrSettings.hide_zero_stock}
                          onChange={(e) =>
                            void saveIvrSettings({ hide_zero_stock: e.target.checked })
                          }
                        />
                        Don’t show products that are out of stock
                      </label>
                      <div className="allowlist-head">
                        <span className="field-label">
                          Approved chats ({ivrSettings.allowlist.length})
                        </span>
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() => void addToAllowlist("ivr", selectedId)}
                        >
                          Add this chat
                        </button>
                      </div>
                      {ivrSettings.allowlist.length === 0 ? (
                        <p className="hint tight">
                          None yet — open a 1:1 chat and turn on the buyer menu there, or add it
                          here.
                        </p>
                      ) : (
                        <ul className="allowlist-list">
                          {ivrSettings.allowlist.map((tid) => (
                            <li key={tid}>
                              <div>
                                <div className="thread-name">{threadTitle(tid, contacts, groups, customers)}</div>
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

                <div className="settings-card">
                  <div className="settings-card-head">
                    <h3>Build the menu</h3>
                  </div>
                  <p className="hint tight">
                    Switch between a visual map of the conversation and a plain text script. Edit a
                    screen, test it on the phone pad, then save.
                  </p>
                  <IvrMenuComposer
                    menus={ivrMenusDraft}
                    busy={ivrMenusBusy}
                    error={ivrMenusError}
                    previewSteps={ivrPreviewSteps}
                    onChange={setIvrMenusDraft}
                    onSave={() => void saveIvrMenusDraft()}
                    onReload={() => void loadIvrMenusEditor()}
                    onResetDemo={() => void resetIvrMenusDemo()}
                    onPreview={(inputs) => void previewIvrPath(inputs)}
                  />
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {(panel === "audit" ||
        panel === "people" ||
        panel === "settings" ||
        panel === "products" ||
        panel === "catalog" ||
        panel === "orders" ||
        panel === "sales" ||
        panel === "search" ||
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
              <button type="button" className="quick-action" onClick={() => setPanel("catalog")}>
                <strong>Catalog</strong>
                <span>Manage products, packs, and stock.</span>
              </button>
              <button type="button" className="quick-action" onClick={() => setPanel("orders")}>
                <strong>Orders</strong>
                <span>Place orders and queue invoices via outbox.</span>
              </button>
              <button type="button" className="quick-action" onClick={() => setPanel("people")}>
                <strong>People</strong>
                <span>Who they are — chats, orders, and notes.</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            <header className="convo-head">
              <div className="convo-head-id">
                <h2>{title}</h2>
                <div className="convo-sub">
                  {isGroupThread(selectedId) ? "Group" : formatPhone(selectedId)}
                </div>
              </div>
              <div className="convo-actions">
                {threadAuto?.effective && (
                  <span className="auto-thread-badge">Auto-reply ON</span>
                )}
                {threadIvr?.effective && (
                  <span className="auto-thread-badge">Buyer menu ON</span>
                )}
                {threadIvr?.handed_off && (
                  <span className="auto-thread-badge warn">Waiting on you</span>
                )}
                {ivrHint && (
                  <span className="auto-thread-badge warn" title={ivrHint}>
                    {ivrHint}
                  </span>
                )}
                <button
                  type="button"
                  className={threadIvr?.enabled ? "act-btn active" : "act-btn"}
                  aria-pressed={!!threadIvr?.enabled}
                  disabled={isGroupThread(selectedId)}
                  title="Buyer menu"
                  onClick={() => void toggleThreadIvr(!threadIvr?.enabled)}
                >
                  <IconMenuList />
                  <span>Buyer menu</span>
                </button>
                {threadIvr?.handed_off && (
                  <button type="button" className="ghost-btn" onClick={() => void resumeIvrBot()}>
                    Resume menu
                  </button>
                )}
                {!threadIvr?.enabled && ivrSettings?.enabled && !isGroupThread(selectedId) && (
                  <span className="convo-sub inline-hint">Turn on to let this chat use the menu</span>
                )}
                <button
                  type="button"
                  className={threadAuto?.opted_in ? "act-btn active" : "act-btn"}
                  aria-pressed={!!threadAuto?.opted_in}
                  title="Opt this chat in to auto-reply"
                  onClick={() => void toggleThreadAuto(!threadAuto?.opted_in)}
                >
                  <IconBolt />
                  <span>Auto-reply</span>
                </button>
                <span className="act-sep" aria-hidden />
                <details className="act-more">
                  <summary className="act-btn">More</summary>
                  <div className="act-more-pop">
                <button
                  type="button"
                  className="act-btn"
                  disabled={aiBusy || !ai?.configured}
                  title={
                    ai?.configured
                      ? "Summarize this conversation"
                      : "AI not configured — enable Ollama in Settings."
                  }
                  onClick={() => void onSummarize()}
                >
                  <IconSparkle />
                  <span>Summarize</span>
                </button>
                <button
                  type="button"
                  className="act-btn"
                  disabled={aiBusy || !ai?.configured}
                  title={
                    ai?.configured
                      ? "Draft a reply"
                      : "AI not configured — enable Ollama in Settings."
                  }
                  onClick={() => void onDraft()}
                >
                  <IconReply />
                  <span>Draft</span>
                </button>
                <button
                  type="button"
                  className="act-btn"
                  title="Export this thread"
                  onClick={() => void onExportThread()}
                >
                  <IconExport />
                  <span>Export</span>
                </button>
                  </div>
                </details>
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
                    <span>
                      {isOutgoing(m)
                        ? "You"
                        : isGroupThread(selectedId)
                          ? threadTitle(m.sender, contacts, groups, customers)
                          : threadTitle(selectedId || m.sender, contacts, groups, customers)}
                    </span>
                    <span>{fmtTime(m.timestamp)}</span>
                  </div>
                  <div className="bubble-body">{m.content}</div>
                </div>
              ))}
              {(outbox.length
                ? outbox
                : USE_FIXTURES && selectedId
                  ? fxOutbox.filter((o) => o.thread_id === selectedId && o.state !== "sent")
                  : []
              ).map((o) => (
                <div key={o.id} className={`bubble out pending state-${o.state}`}>
                  <div className="bubble-meta">
                    <span>{o.state}</span>
                    <span>{fmtTime(o.created_at)}</span>
                  </div>
                  <div className="bubble-body">{o.content}</div>
                  {o.attachment_path && (
                    <div className="attach-chip">
                      <span>{o.attachment_path.split("/").pop() || "Attachment"}</span>
                    </div>
                  )}
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
                  disabled={sending || restartRequired || (!composer.trim() && !attachFile)}
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

      {showProfileRail &&
        (selectedId ? (
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
            onSendQuote={(id) => void sendQuote(id)}
            onMarkPaid={(id) => void setOrderLifecycle(id, "paid")}
            onToggleFavorite={(next) => {
              void (async () => {
                const res = isGroupThread(selectedId)
                  ? await api.setGroupMeta(selectedId, { favorite: next })
                  : await api.setContactMeta(selectedId, { favorite: next });
                if (!res.success) setStatus(res.error);
                else await refreshMeta();
              })();
            }}
            onToggleMute={(next) => {
              void (async () => {
                const res = isGroupThread(selectedId)
                  ? await api.setGroupMeta(selectedId, { muted: next })
                  : await api.setContactMeta(selectedId, { muted: next });
                if (!res.success) setStatus(res.error);
                else await refreshMeta();
              })();
            }}
            groupNotes={
              isGroupThread(selectedId)
                ? groups.find(
                    (g) =>
                      g.group_id === selectedId ||
                      g.group_id.replace(/^group[:.]/, "") ===
                        selectedId.replace(/^group[:.]/, ""),
                  )?.notes ?? ""
                : ""
            }
            onSaveNotes={(notes) => {
              void (async () => {
                if (isGroupThread(selectedId)) {
                  const res = await api.setGroupMeta(selectedId, { notes });
                  if (!res.success) setStatus(res.error);
                  else {
                    setStatus("Notes saved");
                    await refreshMeta();
                  }
                  return;
                }
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
        ) : (
          <aside className="profile-rail profile-rail-empty">
            <div className="profile-rail-empty-inner">
              <p className="profile-section-title">Context</p>
              <p className="hint tight">Select a conversation to see standing, notes, and actions.</p>
            </div>
          </aside>
        ))}
    </div>
  );
}
