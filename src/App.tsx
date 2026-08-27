import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  api,
  errMsg,
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
import { DeviceLinkQr } from "./DeviceLinkQr";
import { IvrMenuComposer } from "./IvrMenuComposer";
import { ProfileRail } from "./ProfileRail";
import { isTauriRuntime } from "./runtime";
import {
  IconCatalog,
  IconContacts,
  IconImage,
  IconMessages,
  IconOrders,
  IconSettings,
} from "./navIcons";
import { bindProductToMenu, screensBoundToProduct } from "./IvrMenuComposer";

type Panel = "inbox" | "people" | "catalog" | "orders" | "settings";
type SettingsTab = "account" | "device" | "delivery" | "auto" | "activity" | "backup";
type PeopleChip = "all" | "people" | "groups" | "customers";
type InboxChip = "all" | "unread" | "needs_send" | "dms" | "groups";
type PeopleSel =
  | { kind: "person"; id: string }
  | { kind: "group"; id: string }
  | { kind: "customer"; id: string };

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
  { id: "inbox", label: "Inbox", ico: <IconMessages /> },
  { id: "people", label: "People", ico: <IconContacts /> },
  { id: "catalog", label: "Catalog", ico: <IconCatalog /> },
  { id: "orders", label: "Orders", ico: <IconOrders /> },
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

function isLowStock(p: Product): boolean {
  const thr = p.low_stock_threshold_milli ?? 0;
  return thr > 0 && (p.quantity_base_milli ?? 0) <= thr;
}

function lowStockThresholdLabel(milli: number): string {
  if (!milli) return "";
  const v = milli / 1000;
  return Math.abs(v - Math.round(v)) < 0.001 ? String(Math.round(v)) : v.toFixed(3);
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
  if (ivr.global_enabled === false) return "Buyer menu ready · turn it on in Catalog";
  if (!ivr.enabled) return null;
  return "Buyer menu ready · waiting to activate";
}

function includesQ(hay: string, q: string): boolean {
  if (!q.trim()) return true;
  return hay.toLowerCase().includes(q.trim().toLowerCase());
}

export default function App() {
  const [panel, setPanel] = useState<Panel>("inbox");
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
  const [ivrMenusDraft, setIvrMenusDraft] = useState<IvrMenus | null>(null);
  const [ivrMenusError, setIvrMenusError] = useState<string | null>(null);
  const [ivrPreviewSteps, setIvrPreviewSteps] = useState<IvrPreviewStep[]>([]);
  const [ivrMenusBusy, setIvrMenusBusy] = useState(false);
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
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderProductId, setOrderProductId] = useState("");
  const [orderQty, setOrderQty] = useState("1");
  const [audit, setAudit] = useState<AutoReplyAuditEntry[]>([]);
  const [salesSummary, setSalesSummary] = useState<SalesSummary | null>(null);
  const [commerceAudit, setCommerceAudit] = useState<CommerceAuditEvent[]>([]);
  const [salesRange, setSalesRange] = useState<"7" | "30" | "all">("30");
  const [salesBusy, setSalesBusy] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkUri, setLinkUri] = useState<string | null>(null);
  const [linkStatus, setLinkStatus] = useState<DeviceLinkStatus | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("account");
  const [peopleChip, setPeopleChip] = useState<PeopleChip>("all");
  const [inboxChip, setInboxChip] = useState<InboxChip>("all");
  const [peopleSel, setPeopleSel] = useState<PeopleSel | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [menuBuilderOpen, setMenuBuilderOpen] = useState(false);
  const [csvMenuOpen, setCsvMenuOpen] = useState(false);
  const [importMode, setImportMode] = useState<"replace" | "merge">("replace");
  const [backupBusy, setBackupBusy] = useState(false);
  const [restartRequired, setRestartRequired] = useState(false);
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
    stock: "all" as "all" | "in" | "out" | "low",
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
    } else if (!d?.number) {
      setStatus("Not configured — set SIGNALX_NUMBER and SIGNALX_SIGNALCLI_CONFIG in .signalx.env");
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
    if (!threadId || threadId.startsWith("group:")) {
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
      setStatus(`Buyer menu approved for ${threadTitle(threadId, contacts, groups)}`);
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
    setSelectedProductId(product.id);
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
      lowStockThreshold:
        (p.low_stock_threshold_milli ?? 0) > 0
          ? lowStockThresholdLabel(p.low_stock_threshold_milli)
          : "",
    });
    setSellPacks(packsFromProduct(p));
    setSelectedProductId(p.id);
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
    setPanel("inbox");
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
    setPanel("inbox");
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

  const placeOrder = async (asDraft = false) => {
    if (!selectedId || selectedId.startsWith("group:")) {
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
      return;
    }
    setStatus(`Draft ${res.data.id.slice(0, 8)} from ${id.slice(0, 8)}`);
    await refreshMeta();
    setPanel("orders");
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
    const res = await api.getIvrMenus();
    if (!res.success) {
      setIvrMenusError(res.error);
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
        setStatus(res.error);
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
      setStatus(res.error);
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
      setIvrMenusError(res.error);
      setStatus(res.error);
      return;
    }
    setIvrPreviewSteps(res.data);
    setIvrMenusError(null);
  };

  const refreshSales = async () => {
    setSalesBusy(true);
    const now = Date.now();
    let sinceMs: number | null = null;
    if (salesRange === "7") sinceMs = now - 7 * 24 * 60 * 60 * 1000;
    else if (salesRange === "30") sinceMs = now - 30 * 24 * 60 * 60 * 1000;
    const [sum, auditRes] = await Promise.all([
      api.salesSummary({
        sinceMs,
        untilMs: null,
        status: orderFilter.status === "all" ? null : orderFilter.status,
      }),
      api.listCommerceAudit(80),
    ]);
    setSalesBusy(false);
    if (sum.success) setSalesSummary(sum.data);
    else setStatus(sum.error);
    if (auditRes.success) setCommerceAudit(auditRes.data);
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
    if (panel === "settings" && settingsTab === "delivery") void refreshGlobalOutbox();
  }, [panel, settingsTab]);

  useEffect(() => {
    if (panel === "orders") void refreshSales();
  }, [panel, salesRange, orderFilter.status]);

  useEffect(() => {
    if ((menuBuilderOpen || panel === "catalog") && !ivrMenusDraft) {
      void loadIvrMenusEditor();
    }
  }, [panel, menuBuilderOpen]);

  useEffect(() => {
    if (panel === "settings" && (settingsTab === "activity" || settingsTab === "delivery")) {
      if (settingsTab === "activity") {
        void api.listCommerceAudit(80).then((r) => {
          if (r.success) setCommerceAudit(r.data);
        });
        void api.listAutoReplyAudit(80).then((r) => {
          if (r.success) setAudit(r.data);
        });
      }
    }
  }, [panel, settingsTab]);

  const tone = healthTone(health);
  const title = selectedId ? threadTitle(selectedId, contacts, groups) : "SignalX";
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
      if (inboxChip === "dms" && t.id.startsWith("group:")) return false;
      if (inboxChip === "groups" && !t.id.startsWith("group:")) return false;
      if (inboxChip === "unread" && t.unread_count <= 0) return false;
      if (inboxChip === "needs_send" && t.outbox_count <= 0) return false;
      const label = threadTitle(t.id, contacts, groups);
      const preview = t.last_preview || "";
      return includesQ(`${label} ${t.id} ${preview}`, threadFilter.q);
    });
  }, [threads, threadFilter.q, inboxChip, contacts, groups]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const milli = p.quantity_base_milli ?? 0;
      const inStock = milli > 0 || p.quantity_in_stock > 0;
      if (productFilter.stock === "in" && !inStock) return false;
      if (productFilter.stock === "out" && inStock) return false;
      if (productFilter.stock === "low" && !isLowStock(p)) return false;
      if (productFilter.unit !== "all" && productUnit(p) !== productFilter.unit) return false;
      if (productFilter.hasImage && !p.image_path) return false;
      return includesQ(
        `${p.name} ${p.sku} ${p.description} ${p.unit}`,
        productFilter.q,
      );
    });
  }, [products, productFilter]);

  const peopleRows = useMemo(() => {
    const q = peopleChip === "all" ? customerFilter.q || contactFilter.q || groupFilter.q : 
      peopleChip === "people" ? contactFilter.q :
      peopleChip === "groups" ? groupFilter.q : customerFilter.q;
    type Row =
      | { key: string; kind: "person"; id: string; name: string; meta: string }
      | { key: string; kind: "group"; id: string; name: string; meta: string }
      | { key: string; kind: "customer"; id: string; name: string; meta: string };
    const rows: Row[] = [];
    if (peopleChip === "all" || peopleChip === "people") {
      for (const c of contacts) {
        const name = c.display_name || c.alias || c.contact_id;
        if (!includesQ(`${name} ${c.contact_id}`, q)) continue;
        rows.push({
          key: `person:${c.contact_id}`,
          kind: "person",
          id: c.contact_id,
          name,
          meta: c.contact_id.replace(/^dm:/, ""),
        });
      }
    }
    if (peopleChip === "all" || peopleChip === "groups") {
      for (const g of groups) {
        const name = g.display_name || g.group_id;
        if (!includesQ(`${name} ${g.group_id}`, q)) continue;
        rows.push({
          key: `group:${g.group_id}`,
          kind: "group",
          id: g.group_id,
          name,
          meta: "Group",
        });
      }
    }
    if (peopleChip === "all" || peopleChip === "customers") {
      for (const c of customers) {
        if (peopleChip === "all" && contacts.some((ct) => {
          const tid = ct.contact_id.startsWith("dm:") ? ct.contact_id : `dm:${ct.contact_id}`;
          return tid === c.thread_id;
        })) continue;
        if (!includesQ(`${c.display_name} ${c.thread_id} ${c.notes}`, q)) continue;
        const n = orders.filter((o) => o.customer_id === c.id || o.thread_id === c.thread_id).length;
        rows.push({
          key: `customer:${c.id}`,
          kind: "customer",
          id: c.id,
          name: c.display_name || c.thread_id,
          meta: n ? `${n} order${n === 1 ? "" : "s"}` : c.thread_id,
        });
      }
    }
    return rows;
  }, [contacts, groups, customers, orders, peopleChip, contactFilter.q, groupFilter.q, customerFilter.q]);

  const filteredOrders = useMemo(() => {
    const now = Date.now();
    const since =
      salesRange === "7"
        ? now - 7 * 24 * 60 * 60 * 1000
        : salesRange === "30"
          ? now - 30 * 24 * 60 * 60 * 1000
          : 0;
    return [...orders]
      .sort((a, b) => b.created_at - a.created_at)
      .filter((o) => {
        if (since && o.created_at < since) return false;
        if (orderFilter.status !== "all" && o.status !== orderFilter.status) return false;
        if (orderFilter.thisThread && selectedId && o.thread_id !== selectedId) return false;
        const party = threadTitle(o.thread_id, contacts, groups);
        const lines = o.lines.map((l) => l.name).join(" ");
        return includesQ(`${party} ${o.id} ${o.status} ${lines} ${o.thread_id}`, orderFilter.q);
      });
  }, [orders, orderFilter, selectedId, contacts, groups, salesRange]);

  const filteredAudit = audit;

  const orderStatuses = useMemo(() => {
    const set = new Set(orders.map((o) => o.status).filter(Boolean));
    return ["all", ...Array.from(set).sort()];
  }, [orders]);

  const setupNeeded = useMemo(
    () => needsDeviceSetup(diagnostics, health, linkStatus),
    [diagnostics, health, linkStatus],
  );

  const openDeviceLinkSetup = () => {
    setPanel("settings");
    setSettingsTab("device");
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
    if (res.success) applySession(res.data);
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
    <div className={panel === "settings" && !menuBuilderOpen ? "shell shell-three" : "shell shell-with-profile"}>
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
            <input
              type="password"
              autoComplete="off"
              placeholder="PIN"
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
            onClick={() => setAccountMenuOpen((o) => !o)}
          >
            {session?.locked
              ? "Locked"
              : accountNumber ?? "Not configured"}
          </button>
          {accountMenuOpen && (
            <div className="account-menu">
              <button type="button" onClick={() => void onLock()}>
                Lock
              </button>
              <button
                type="button"
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
          <button type="button" className="ghost-btn" onClick={openDeviceLinkSetup}>
            Link device
          </button>
        )}

        <div className={`ai-pill ${ai?.configured && ai.ollama_reachable ? "ok" : "warn"}`}>
          {ai?.configured
            ? ai.ollama_reachable
              ? `AI · ${ai.ollama_model || "ollama"}`
              : "AI · unreachable"
            : "AI · not configured"}
        </div>

        <div className="rail-chips">
          {autoSettings?.enabled && <span className="rail-chip">Auto ON</span>}
          {ivrSettings?.enabled && <span className="rail-chip">Menu ON</span>}
        </div>

        <nav className="nav">
          {NAV_ITEMS.map(({ id, label, ico }) => (
            <button
              key={id}
              type="button"
              className={panel === id ? "nav-btn active" : "nav-btn"}
              onClick={() => {
                setPanel(id);
                if (id === "settings" && setupNeeded) setSettingsTab("account");
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
              {id === "inbox" &&
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
            onClick={() => void api.exportAccount("json").then((r) => setStatus(errMsg(r) || "Chat export complete"))}
          >
            Export chat
          </button>
        </div>
      </aside>

      {menuBuilderOpen ? (
        <IvrMenuComposer
          layout="page"
          menus={ivrMenusDraft}
          busy={ivrMenusBusy}
          error={ivrMenusError}
          previewSteps={ivrPreviewSteps}
          products={products}
          onChange={setIvrMenusDraft}
          onSave={() => void saveIvrMenusDraft()}
          onReload={() => void loadIvrMenusEditor()}
          onResetDemo={() => void resetIvrMenusDemo()}
          onPreview={(inputs) => void previewIvrPath(inputs)}
          onClose={() => setMenuBuilderOpen(false)}
          listHeader={
            ivrSettings ? (
              <div className="settings-card" style={{ marginBottom: 10 }}>
                <div className="settings-card-head">
                  <h3>Buyer menu</h3>
                  <span className={`status-pill status-${ivrSettings.enabled ? "ok" : "muted"}`}>
                    {ivrSettings.enabled ? "ON" : "OFF"}
                  </span>
                </div>
                <label className="toggle compact">
                  <input
                    type="checkbox"
                    checked={ivrSettings.enabled}
                    onChange={(e) => void saveIvrSettings({ enabled: e.target.checked })}
                  />
                  Master
                </label>
                <label className="toggle compact">
                  <input
                    type="checkbox"
                    checked={ivrSettings.require_allowlist}
                    onChange={(e) => void saveIvrSettings({ require_allowlist: e.target.checked })}
                  />
                  Allowlist only
                </label>
                <label className="toggle compact">
                  <input
                    type="checkbox"
                    checked={!!ivrSettings.hide_zero_stock}
                    onChange={(e) => void saveIvrSettings({ hide_zero_stock: e.target.checked })}
                  />
                  Hide zero stock
                </label>
              </div>
            ) : null
          }
        />
      ) : panel === "inbox" ? (
        <>
          <section className="thread-col">
            <header className="col-head">Inbox</header>
            <div className="search-box">
              <input
                placeholder="Search threads and messages…"
                value={threadFilter.q || searchQ}
                onChange={(e) => {
                  setThreadFilter((f) => ({ ...f, q: e.target.value }));
                  setSearchQ(e.target.value);
                }}
                onKeyDown={(e) => e.key === "Enter" && void onSearch()}
              />
              <button type="button" onClick={() => void onSearch()}>
                Search
              </button>
            </div>
            <div className="filter-chips" role="tablist" aria-label="Inbox filters">
              {(
                [
                  ["all", "All"],
                  ["unread", "Unread"],
                  ["needs_send", "Needs send"],
                  ["dms", "DMs"],
                  ["groups", "Groups"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={inboxChip === id ? "filter-chip active" : "filter-chip"}
                  onClick={() => setInboxChip(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="compose-strip">
              <input
                placeholder="New chat — +15551234567"
                value={newDmPhone}
                onChange={(e) => setNewDmPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void openNewDm()}
              />
              <button type="button" className="send-btn" onClick={() => void openNewDm()}>
                Open
              </button>
            </div>
            {searchHits.length > 0 && (
              <div className="thread-list" style={{ maxHeight: 160 }}>
                {searchHits.map((h) => (
                  <button
                    key={h.message_id}
                    type="button"
                    className="thread-row"
                    onClick={() => {
                      setSelectedId(h.thread_id);
                      setSearchHits([]);
                    }}
                  >
                    <div className="thread-row-body">
                      <div className="thread-row-top">
                        <span className="thread-name">{threadTitle(h.thread_id, contacts, groups)}</span>
                        <span className="thread-time">{fmtTime(h.timestamp)}</span>
                      </div>
                      <div className="thread-preview">{h.snippet}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
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
                  onClick={() => setSelectedId(t.id)}
                >
                  <span className="avatar-dot" aria-hidden>
                    {initials(threadTitle(t.id, contacts, groups))}
                  </span>
                  <div className="thread-row-body">
                    <div className="thread-row-top">
                      <span className="thread-name">{threadTitle(t.id, contacts, groups)}</span>
                      <span className="thread-time">{fmtTime(t.last_message_timestamp)}</span>
                    </div>
                    <div className="thread-preview">{t.last_preview || "No messages yet"}</div>
                    <div className="thread-row-meta">
                      {t.unread_count > 0 && <span className="badge">{t.unread_count}</span>}
                      {t.outbox_count > 0 && <span className="badge muted">{t.outbox_count} pending</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <main className="convo">
            {!selectedId ? (
              <div className="convo-empty">
                <h1>Inbox</h1>
                <p>Select a thread to read and reply. The profile column stays open.</p>
              </div>
            ) : (
              <>
                <header className="convo-head">
                  <div>
                    <h2>{title}</h2>
                    <div className="convo-sub wrap">{selectedId}</div>
                  </div>
                  <div className="convo-actions">
                    <label className="toggle compact">
                      <input
                        type="checkbox"
                        checked={!!threadIvr?.enabled}
                        disabled={!!selectedId?.startsWith("group:")}
                        onChange={(e) => void toggleThreadIvr(e.target.checked)}
                      />
                      Buyer menu
                    </label>
                    <label className="toggle compact">
                      <input
                        type="checkbox"
                        checked={!!threadAuto?.opted_in}
                        onChange={(e) => void toggleThreadAuto(e.target.checked)}
                      />
                      Auto-reply
                    </label>
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
                    <div key={m.id} className={isOutgoing(m) ? "bubble out" : "bubble in"}>
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

          <ProfileRail
            threadId={selectedId}
            title={title}
            initials={initials(title)}
            contact={profileContact}
            customer={profileCustomer}
            orders={orders}
            products={products}
            participants={threads.find((t) => t.id === selectedId)?.participants}
            ai={ai}
            aiBusy={aiBusy}
            ivrEnabled={!!threadIvr?.enabled}
            ivrEffective={!!threadIvr?.effective}
            ivrHandedOff={!!threadIvr?.handed_off}
            ivrHint={ivrHint}
            onStatus={setStatus}
            onSetComposer={setComposer}
            onDraft={(intent) => void onDraft(intent)}
            onSummarize={onSummarize}
            onLinkCustomer={() => void linkCustomerFromThread()}
            onOpenOrders={() => {
              setOrderFilter((f) => ({ ...f, thisThread: true, q: "" }));
              setPanel("orders");
            }}
            onOpenPeople={() => {
              if (profileCustomer) setPeopleSel({ kind: "customer", id: profileCustomer.id });
              else if (selectedId) setPeopleSel({ kind: "person", id: selectedId });
              setPanel("people");
            }}
            onSendInvoice={(id) => void sendInvoice(id)}
            onSendQuote={(id) => void sendQuote(id)}
            onMarkPaid={(id) => void setOrderLifecycle(id, "paid")}
            onResumeMenu={() => void resumeIvrBot()}
            onPlaceOrder={() => {
              setPanel("orders");
              setSelectedOrderId(null);
            }}
            onToggleFavorite={(next) => {
              if (!selectedId) return;
              void (async () => {
                const res = await api.setContactMeta(selectedId, { favorite: next });
                if (!res.success) setStatus(res.error);
                else await refreshMeta();
              })();
            }}
            onToggleMute={(next) => {
              if (!selectedId) return;
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
                const res = await api.upsertCustomer({ ...profileCustomer, notes });
                if (!res.success) setStatus(res.error);
                else {
                  setStatus("Notes saved");
                  await refreshMeta();
                }
              })();
            }}
          />
        </>
      ) : panel === "people" ? (
        <>
          <section className="thread-col">
            <header className="col-head">People</header>
            <div className="search-box">
              <input
                placeholder="Search directory…"
                value={contactFilter.q}
                onChange={(e) => {
                  const q = e.target.value;
                  setContactFilter((f) => ({ ...f, q }));
                  setGroupFilter((f) => ({ ...f, q }));
                  setCustomerFilter((f) => ({ ...f, q }));
                }}
              />
            </div>
            <div className="filter-chips">
              {(
                [
                  ["all", "All"],
                  ["people", "People"],
                  ["groups", "Groups"],
                  ["customers", "Customers"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={peopleChip === id ? "filter-chip active" : "filter-chip"}
                  onClick={() => setPeopleChip(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="thread-list">
              {peopleRows.length === 0 && <p className="empty">No people yet — create a contact or group.</p>}
              {peopleRows.map((row) => (
                <button
                  key={row.key}
                  type="button"
                  className={
                    peopleSel && peopleSel.kind === row.kind && peopleSel.id === row.id
                      ? "thread-row active"
                      : "thread-row"
                  }
                  onClick={() => setPeopleSel({ kind: row.kind, id: row.id })}
                >
                  <span className="avatar-dot">{initials(row.name)}</span>
                  <div className="thread-row-body">
                    <div className="thread-row-top">
                      <span className="thread-name">{row.name}</span>
                    </div>
                    <div className="convo-sub">{row.meta}</div>
                  </div>
                </button>
              ))}
            </div>
          </section>
          <main className="convo work-pane">
            {!peopleSel ? (
              <div className="hero-block">
                <h2>New record</h2>
                <div className="form-card">
                  <h3 className="form-card-title">Create contact</h3>
                  <input
                    placeholder="Phone +15551234567"
                    value={contactForm.phone}
                    onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                  <input
                    placeholder="Display name"
                    value={contactForm.name}
                    onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))}
                  />
                  <button type="button" className="send-btn" onClick={() => void addContact()}>
                    Save contact
                  </button>
                </div>
                <div className="form-card">
                  <h3 className="form-card-title">Create group</h3>
                  <input
                    placeholder="Group name"
                    value={groupForm.name}
                    onChange={(e) => setGroupForm((f) => ({ ...f, name: e.target.value }))}
                  />
                  <input
                    placeholder="Members +1555…, +1444…"
                    value={groupForm.members}
                    onChange={(e) => setGroupForm((f) => ({ ...f, members: e.target.value }))}
                  />
                  <button type="button" className="send-btn" onClick={() => void createGroup()}>
                    Create group
                  </button>
                </div>
              </div>
            ) : (
              (() => {
                const person =
                  peopleSel.kind === "person"
                    ? contacts.find((c) => c.contact_id === peopleSel.id)
                    : null;
                const group =
                  peopleSel.kind === "group"
                    ? groups.find((g) => g.group_id === peopleSel.id)
                    : null;
                const customer =
                  peopleSel.kind === "customer"
                    ? customers.find((c) => c.id === peopleSel.id)
                    : person
                      ? customers.find((c) => {
                          const tid = person.contact_id.startsWith("dm:")
                            ? person.contact_id
                            : `dm:${person.contact_id}`;
                          return c.thread_id === tid;
                        })
                      : null;
                const threadId = group
                  ? group.group_id.startsWith("group:")
                    ? group.group_id
                    : `group:${group.group_id}`
                  : customer?.thread_id ||
                    (person
                      ? person.contact_id.startsWith("dm:")
                        ? person.contact_id
                        : `dm:${person.contact_id}`
                      : "");
                const name =
                  person?.display_name ||
                  person?.alias ||
                  group?.display_name ||
                  customer?.display_name ||
                  threadId;
                const relatedOrders = orders.filter(
                  (o) => o.thread_id === threadId || (customer && o.customer_id === customer.id),
                );
                return (
                  <div className="hero-block">
                    <h2 className="wrap">{name}</h2>
                    <div className="convo-sub wrap">{threadId}</div>
                    {customer && (
                      <label className="field-stack">
                        <span className="field-label">Notes</span>
                        <textarea
                          className="product-desc"
                          rows={4}
                          defaultValue={customer.notes}
                          key={customer.id}
                          onBlur={(e) => {
                            void api.upsertCustomer({ ...customer, notes: e.target.value }).then((r) => {
                              if (!r.success) setStatus(r.error);
                              else void refreshMeta();
                            });
                          }}
                        />
                      </label>
                    )}
                    {person && (
                      <div className="profile-toggles">
                        <label className="toggle compact">
                          <input
                            type="checkbox"
                            checked={person.favorite}
                            onChange={(e) => {
                              void api.setContactMeta(threadId, { favorite: e.target.checked }).then(() => refreshMeta());
                            }}
                          />
                          Favorite
                        </label>
                        <label className="toggle compact">
                          <input
                            type="checkbox"
                            checked={person.muted}
                            onChange={(e) => {
                              void api.setContactMeta(threadId, { muted: e.target.checked }).then(() => refreshMeta());
                            }}
                          />
                          Muted
                        </label>
                      </div>
                    )}
                    <p className="hint tight">
                      {relatedOrders.length} related order{relatedOrders.length === 1 ? "" : "s"}
                    </p>
                  </div>
                );
              })()
            )}
          </main>
          <aside className="profile-rail">
            {peopleSel ? (
              (() => {
                const group =
                  peopleSel.kind === "group"
                    ? groups.find((g) => g.group_id === peopleSel.id)
                    : null;
                const person =
                  peopleSel.kind === "person"
                    ? contacts.find((c) => c.contact_id === peopleSel.id)
                    : null;
                const customer =
                  peopleSel.kind === "customer"
                    ? customers.find((c) => c.id === peopleSel.id)
                    : null;
                const threadId = group
                  ? group.group_id.startsWith("group:")
                    ? group.group_id
                    : `group:${group.group_id}`
                  : customer?.thread_id ||
                    (person
                      ? person.contact_id.startsWith("dm:")
                        ? person.contact_id
                        : `dm:${person.contact_id}`
                      : "");
                const related = orders.filter((o) => o.thread_id === threadId).slice(0, 8);
                return (
                  <>
                    <div className="profile-section">
                      <div className="profile-section-title">Actions</div>
                      <button
                        type="button"
                        className="action-btn primary"
                        onClick={() => {
                          setSelectedId(threadId);
                          setPanel("inbox");
                        }}
                      >
                        Open chat
                      </button>
                      {!threadId.startsWith("group:") && (
                        <button
                          type="button"
                          className="action-btn"
                          onClick={() => {
                            setSelectedId(threadId);
                            setSelectedOrderId(null);
                            setPanel("orders");
                          }}
                        >
                          Place order
                        </button>
                      )}
                      {customer && (
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() => void removeCustomer(customer.id).then(() => setPeopleSel(null))}
                        >
                          Unlink customer
                        </button>
                      )}
                      {!threadId.startsWith("group:") && (
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() => void addToAllowlist("ivr", threadId)}
                        >
                          Allow buyer menu
                        </button>
                      )}
                    </div>
                    <div className="profile-section">
                      <div className="profile-section-title">Threads</div>
                      <button
                        type="button"
                        className="thread-row"
                        onClick={() => {
                          setSelectedId(threadId);
                          setPanel("inbox");
                        }}
                      >
                        <div className="thread-row-body">
                          <span className="thread-name wrap">{threadTitle(threadId, contacts, groups)}</span>
                          <div className="convo-sub wrap">{threadId}</div>
                        </div>
                      </button>
                    </div>
                    <div className="profile-section">
                      <div className="profile-section-title">Orders</div>
                      {related.length === 0 && <p className="hint tight">No orders.</p>}
                      {related.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          className="thread-row"
                          onClick={() => {
                            setSelectedOrderId(o.id);
                            setPanel("orders");
                          }}
                        >
                          <div className="thread-row-body">
                            <div className="thread-row-top">
                              <span className="thread-name">{o.id.slice(0, 8)}</span>
                              <span className={`status-pill status-${orderStatusTone(o.status)}`}>{o.status}</span>
                            </div>
                            <div className="convo-sub">{money(o.total_cents)}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                );
              })()
            ) : (
              <div className="profile-empty">
                <strong>Related</strong>
                <p>Select a person or group to see threads and orders.</p>
              </div>
            )}
          </aside>
        </>
      ) : panel === "catalog" ? (
        <>
          <section className="thread-col">
            <header className="col-head">
              Catalog
              <div className="menu-overflow">
                <button type="button" className="ghost-btn" onClick={() => setCsvMenuOpen((o) => !o)}>
                  ⋯
                </button>
                {csvMenuOpen && (
                  <div className="menu-overflow-panel">
                    <button
                      type="button"
                      onClick={() => {
                        setCsvMenuOpen(false);
                        void exportProductsCsv();
                      }}
                    >
                      Export CSV
                    </button>
                    <label>
                      Import CSV
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        hidden
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          setCsvMenuOpen(false);
                          void importProductsCsvFile(file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setCsvMenuOpen(false);
                        setMenuBuilderOpen(true);
                        void loadIvrMenusEditor();
                      }}
                    >
                      Open menu builder
                    </button>
                  </div>
                )}
              </div>
            </header>
            <div className="search-box">
              <input
                placeholder="Filter catalog…"
                value={productFilter.q}
                onChange={(e) => setProductFilter((f) => ({ ...f, q: e.target.value }))}
              />
            </div>
            <button
              type="button"
              className="ghost-btn"
              style={{ margin: "8px 12px" }}
              onClick={() => {
                resetProductForm();
                setSelectedProductId(null);
              }}
            >
              New product
            </button>
            <div className="thread-list">
              {filteredProducts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={selectedProductId === p.id ? "thread-row active" : "thread-row"}
                  onClick={() => void editProduct(p)}
                >
                  {p.image_path ? (
                    <span className="avatar-dot">{initials(p.name)}</span>
                  ) : (
                    <span className="avatar-dot">{initials(p.name)}</span>
                  )}
                  <div className="thread-row-body">
                    <div className="thread-row-top">
                      <span className="thread-name">{p.name}</span>
                    </div>
                    <div className="convo-sub">
                      {productPriceLabel(p)} · {productStockLabel(p)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
          <main className="convo work-pane">
            {!selectedProductId ? (
              <div className="hero-block">
                <h2>New product</h2>
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

              </div>
            ) : (
              (() => {
                const p = products.find((x) => x.id === selectedProductId);
                if (!p) return <p className="empty">Product not found.</p>;
                return (
                  <div className="hero-block">
                    <h2 className="wrap">{p.name}</h2>
                    {productImagePreview && (
                      <div className="product-hero">
                        <img src={productImagePreview} alt="" />
                      </div>
                    )}
                    <p className="wrap">{p.description || "No description"}</p>
                    <p className="convo-sub wrap">
                      SKU {p.sku || "—"} · {productPriceLabel(p)} · {productStockLabel(p)}
                    </p>
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

                  </div>
                );
              })()
            )}
          </main>
          <aside className="profile-rail">
            <div className="profile-section">
              <div className="allowlist-head">
                <div className="profile-section-title">Buyer menu</div>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => {
                    setMenuBuilderOpen(true);
                    void loadIvrMenusEditor();
                  }}
                >
                  Open builder
                </button>
              </div>
              {selectedProductId ? (
                <>
                  {screensBoundToProduct(ivrMenusDraft, selectedProductId).length === 0 && (
                    <p className="hint tight">No screens bind this product yet.</p>
                  )}
                  {screensBoundToProduct(ivrMenusDraft, selectedProductId).map((b) => (
                    <div key={`${b.nodeId}-${b.digit}`} className="convo-sub wrap">
                      {b.nodeId} · {b.digit}
                      {b.action ? ` · ${b.action}` : ""}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="action-btn primary"
                    disabled={!ivrMenusDraft || !selectedProductId}
                    onClick={() => {
                      const p = products.find((x) => x.id === selectedProductId);
                      if (!p || !ivrMenusDraft) return;
                      setIvrMenusDraft(bindProductToMenu(ivrMenusDraft, p));
                      setStatus(`Bound ${p.name} to the menu — save in the builder`);
                      setMenuBuilderOpen(true);
                    }}
                  >
                    Add to menu
                  </button>
                  <label className="toggle compact">
                    <input
                      type="checkbox"
                      checked={!!ivrSettings?.hide_zero_stock}
                      onChange={(e) => void saveIvrSettings({ hide_zero_stock: e.target.checked })}
                    />
                    Hide if zero stock
                  </label>
                  <div className="row-actions">
                    <button type="button" className="ghost-btn" onClick={() => {
                      const p = products.find((x) => x.id === selectedProductId);
                      if (p) void adjustStock(p, 1);
                    }}>
                      +1 stock
                    </button>
                    <button type="button" className="ghost-btn" onClick={() => {
                      const p = products.find((x) => x.id === selectedProductId);
                      if (p) void adjustStock(p, -1);
                    }}>
                      −1 stock
                    </button>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => {
                        if (selectedProductId) void removeProduct(selectedProductId).then(() => setSelectedProductId(null));
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </>
              ) : (
                <p className="hint tight">Select a product to bind it to a menu choice.</p>
              )}
            </div>
          </aside>
        </>
      ) : panel === "orders" ? (
        <>
          <section className="thread-col">
            <header className="col-head">Orders</header>
            <div className="search-box">
              <input
                placeholder="Search orders…"
                value={orderFilter.q}
                onChange={(e) => setOrderFilter((f) => ({ ...f, q: e.target.value }))}
              />
            </div>
            <div className="filter-chips">
              {["all", ...orderStatuses.filter((s) => s !== "all")].slice(0, 8).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={orderFilter.status === s ? "filter-chip active" : "filter-chip"}
                  onClick={() => setOrderFilter((f) => ({ ...f, status: s }))}
                >
                  {s === "all" ? "All" : s}
                </button>
              ))}
            </div>
            <div className="filter-chips">
              {(
                [
                  ["7", "7d"],
                  ["30", "30d"],
                  ["all", "All time"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={salesRange === id ? "filter-chip active" : "filter-chip"}
                  onClick={() => setSalesRange(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="thread-list">
              {filteredOrders.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={selectedOrderId === o.id ? "thread-row active" : "thread-row"}
                  onClick={() => setSelectedOrderId(o.id)}
                >
                  <div className="thread-row-body">
                    <div className="thread-row-top">
                      <span className="thread-name">{orderParty(o)}</span>
                      <span className={`status-pill status-${orderStatusTone(o.status)}`}>{o.status}</span>
                    </div>
                    <div className="convo-sub">
                      {money(o.total_cents)} · {fmtTime(o.created_at)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
          <main className="convo work-pane">
            {(() => {
              const o = orders.find((x) => x.id === selectedOrderId);
              if (!o) {
                return (
                  <div className="hero-block">
                    <h2>Create quote</h2>
                    {!selectedId || selectedId.startsWith("group:") ? (
                      <p className="warn-text">Select a DM thread first (Inbox or People).</p>
                    ) : (
                      <p className="hint tight">
                        Quote for <strong>{threadTitle(selectedId, contacts, groups)}</strong>
                      </p>
                    )}
                    <select
                      value={orderProductId}
                      onChange={(e) => {
                        setOrderProductId(e.target.value);
                        setOrderSellOptionId("");
                      }}
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({productPriceLabel(p)})
                        </option>
                      ))}
                    </select>
                    <input
                      placeholder="Qty"
                      value={orderQty}
                      onChange={(e) => setOrderQty(e.target.value)}
                    />
                    <div className="row-actions">
                      <button type="button" className="send-btn" onClick={() => void placeOrder(true)}>
                        Create quote
                      </button>
                      <button type="button" className="action-btn" onClick={() => void placeOrder(false)}>
                        Place order
                      </button>
                    </div>
                  </div>
                );
              }
              return (
                <div className="hero-block">
                  <h2 className="wrap">
                    {orderParty(o)} · {o.id.slice(0, 8)}
                  </h2>
                  <span className={`status-pill status-${orderStatusTone(o.status)}`}>{o.status}</span>
                  <p>{money(o.total_cents)}</p>
                  <ul>
                    {o.lines.map((l, i) => (
                      <li key={`${l.product_id}-${i}`}>
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() => {
                            setSelectedProductId(l.product_id);
                            const p = products.find((x) => x.id === l.product_id);
                            if (p) void editProduct(p);
                            setPanel("catalog");
                          }}
                        >
                          {l.name} × {l.quantity} {l.unit} — {money(l.line_total_cents ?? l.unit_price_cents)}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="row-actions">
                    {o.status === "draft" ? (
                      <>
                        <button type="button" className="action-btn primary" onClick={() => void sendQuote(o.id)}>
                          Send quote
                        </button>
                        <button type="button" className="ghost-btn" onClick={() => void confirmDraftOrder(o.id)}>
                          Confirm
                        </button>
                        <button type="button" className="ghost-btn" onClick={() => void editDraftFirstLineQty(o)}>
                          Edit lines
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="action-btn primary" onClick={() => void sendInvoice(o.id)}>
                          Send invoice
                        </button>
                        {o.status !== "paid" && o.status !== "cancelled" && (
                          <button type="button" className="ghost-btn" onClick={() => void setOrderLifecycle(o.id, "paid")}>
                            Mark paid
                          </button>
                        )}
                      </>
                    )}
                    <button type="button" className="ghost-btn" onClick={() => void duplicateAsDraft(o.id)}>
                      Duplicate
                    </button>
                    {o.status !== "cancelled" && (
                      <button type="button" className="ghost-btn" onClick={() => void setOrderLifecycle(o.id, "cancelled")}>
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}
          </main>
          <aside className="profile-rail">
            {selectedOrderId ? (
              (() => {
                const o = orders.find((x) => x.id === selectedOrderId);
                if (!o) return null;
                const others = orders.filter((x) => x.thread_id === o.thread_id && x.id !== o.id).slice(0, 6);
                return (
                  <>
                    <div className="profile-section">
                      <div className="profile-section-title">Customer</div>
                      <button
                        type="button"
                        className="thread-row"
                        onClick={() => {
                          setSelectedId(o.thread_id);
                          setPanel("inbox");
                        }}
                      >
                        <div className="thread-row-body">
                          <span className="thread-name wrap">{orderParty(o)}</span>
                          <div className="convo-sub wrap">{o.thread_id}</div>
                        </div>
                      </button>
                    </div>
                    <div className="profile-section">
                      <div className="profile-section-title">Other orders</div>
                      {others.length === 0 && <p className="hint tight">No other orders.</p>}
                      {others.map((x) => (
                        <button
                          key={x.id}
                          type="button"
                          className="thread-row"
                          onClick={() => setSelectedOrderId(x.id)}
                        >
                          <div className="thread-row-body">
                            <span className="thread-name">{x.id.slice(0, 8)}</span>
                            <div className="convo-sub">
                              {x.status} · {money(x.total_cents)}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                );
              })()
            ) : (
              <div className="profile-section">
                <div className="profile-section-title">Totals</div>
                {salesSummary ? (
                  <>
                    <dl className="profile-stats">
                      <div>
                        <dt>Orders</dt>
                        <dd>{salesSummary.order_count}</dd>
                      </div>
                      <div>
                        <dt>Revenue</dt>
                        <dd>{money(salesSummary.revenue_cents)}</dd>
                      </div>
                    </dl>
                    <div className="sales-by-status">
                      {salesSummary.by_status.map((row) => (
                        <span key={row.status} className="badge muted">
                          {row.status}: {row.count} · {money(row.total_cents)}
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="hint tight">{salesBusy ? "Loading…" : "No sales summary yet."}</p>
                )}
                <details className="collapsible-card">
                  <summary>Commerce audit</summary>
                  {commerceAudit.slice(0, 12).map((e) => (
                    <div key={e.id} className="convo-sub wrap">
                      {e.kind} · {e.summary}
                    </div>
                  ))}
                </details>
              </div>
            )}
          </aside>
        </>
      ) : (
        <>
          <section className="thread-col">
            <header className="col-head">Settings</header>
            <nav className="settings-nav">
              {(
                [
                  ["account", "Account"],
                  ["device", "Device link"],
                  ["delivery", "Delivery"],
                  ["auto", "Auto-reply"],
                  ["activity", "Activity"],
                  ["backup", "Backup"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={settingsTab === id ? "nav-btn active" : "nav-btn"}
                  onClick={() => setSettingsTab(id)}
                >
                  <span className="nav-btn-label">{label}</span>
                </button>
              ))}
            </nav>
          </section>
          <main className="convo work-pane">
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
                        : diagnostics?.signal_cli_usable
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
              {settingsTab === "device" && (                <div className="settings-card">
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
              )}
              {settingsTab === "delivery" && (
                <div className="settings-card">
                  <div className="settings-card-head">
                    <h3>Outbox</h3>
                    <span className="col-meta">
                      {outboxSummary
                        ? `${outboxSummary.queued} queued · ${outboxSummary.sending} sending · ${outboxSummary.failed} failed`
                        : "—"}
                    </span>
                  </div>
                  <button type="button" className="ghost-btn" onClick={() => void refreshGlobalOutbox()}>
                    Refresh
                  </button>
                  {globalOutbox.length === 0 && <p className="hint tight">Outbox clear.</p>}
                  {globalOutbox.map((o) => (
                    <div key={o.id} className="thread-row">
                      <div className="thread-row-top">
                        <span className="thread-name wrap">{threadTitle(o.thread_id, contacts, groups)}</span>
                        <span className={`status-pill status-${o.state === "failed" ? "danger" : "muted"}`}>
                          {o.state}
                        </span>
                      </div>
                      <div className="convo-sub wrap">{o.content || "(attachment)"}</div>
                      {o.last_error && <div className="bubble-err wrap">{o.last_error}</div>}
                      <div className="row-actions">
                        {o.state === "failed" && (
                          <button type="button" className="action-btn" onClick={() => void onRetry(o.id).then(() => refreshGlobalOutbox())}>
                            Retry
                          </button>
                        )}
                        <button type="button" className="ghost-btn" onClick={() => void onDeleteOutbox(o.id).then(() => refreshGlobalOutbox())}>
                          Discard
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {settingsTab === "auto" &&               <div className="settings-card">
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
              </div>}
              {settingsTab === "activity" && (
                <>
                  <div className="settings-card">
                    <h3>Auto-reply log</h3>
                    {filteredAudit.length === 0 && <p className="hint tight">No auto-reply activity yet.</p>}
                    {filteredAudit.map((e) => (
                      <div key={e.id} className="audit-row">
                        <div className="audit-top">
                          <span className={`outcome outcome-${e.outcome}`}>{e.outcome}</span>
                          <span className="thread-time">{fmtTime(e.created_at)}</span>
                        </div>
                        <div className="audit-thread wrap">{e.thread_id}</div>
                        <div className="snippet wrap">{e.draft}</div>
                      </div>
                    ))}
                  </div>
                  <div className="settings-card">
                    <h3>Commerce audit</h3>
                    {commerceAudit.length === 0 && <p className="hint tight">No commerce events yet.</p>}
                    {commerceAudit.map((e) => (
                      <div key={e.id} className="thread-row">
                        <div className="thread-row-top">
                          <span className="thread-name">{e.kind}</span>
                          <span className="thread-time">{fmtTime(e.created_at)}</span>
                        </div>
                        <div className="convo-sub wrap">{e.summary}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {settingsTab === "backup" &&               <div className="settings-card">
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
              </div>}
            </div>
          </main>
        </>
      )}

      {status && panel !== "inbox" && (
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
