/** Typed wrappers around SignalX Tauri commands. */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export interface Message {
  id: string;
  thread_id: string;
  timestamp: number;
  sender: string;
  recipient?: string | null;
  content: string;
  direction: "Incoming" | "Outgoing" | string;
  raw_json?: unknown;
}

export interface ThreadSummary {
  id: string;
  participants: string[];
  last_message_timestamp: number;
  unread_count: number;
  message_count: number;
  outbox_count: number;
}

export interface OutboxItem {
  id: string;
  account_id: string;
  thread_id: string;
  recipient: string;
  content: string;
  created_at: number;
  last_attempt_at?: number | null;
  attempt_count: number;
  state: string;
  last_error?: string | null;
  attachment_path?: string | null;
}

export interface OutboxSummary {
  queued: number;
  sending: number;
  failed: number;
}

export interface ReceiveLoopState {
  last_receive_ok_at?: number | null;
  last_receive_error?: string | null;
  consecutive_failures: number;
  backoff_ms: number;
  cooldown_until?: number | null;
}

export interface AiStatus {
  configured: boolean;
  ollama_url: string;
  ollama_model?: string | null;
  ollama_reachable: boolean;
  ollama_last_error?: string | null;
}

export interface ThreadActionSuggestion {
  label: string;
  kind: string;
  payload: string;
}

export interface Diagnostics {
  env_path?: string | null;
  app_data_dir: string;
  signal_cli_path: string;
  signal_cli_version?: string | null;
  signal_cli_usable: boolean;
  signal_cli_last_error?: string | null;
  config_path?: string | null;
  number?: string | null;
  active_account?: string | null;
  ollama_configured: boolean;
  ollama_url: string;
  ollama_model?: string | null;
  ollama_reachable: boolean;
  ollama_last_error?: string | null;
}

export interface DeviceLinkStart {
  started: boolean;
  device_name: string;
  config_path: string;
}

export interface DeviceLinkStatus {
  state: "success" | "error" | "cancelled" | string;
  message?: string | null;
}

export interface DeviceLinkUri {
  uri: string;
}

export interface ContactMeta {
  contact_id: string;
  display_name?: string | null;
  alias?: string | null;
  categories: string[];
  favorite: boolean;
  muted: boolean;
  auto_reply_enabled?: boolean;
  updated_at: number;
}

export interface GroupMeta {
  group_id: string;
  display_name?: string | null;
  categories: string[];
  favorite: boolean;
  muted: boolean;
  auto_reply_enabled?: boolean;
  updated_at: number;
}

export interface SearchResult {
  thread_id: string;
  message_id: string;
  timestamp: number;
  sender: string;
  snippet: string;
}

export interface PendingReply {
  message_id: string;
  thread_id: string;
  draft: string;
  intent: string;
  created_at: number;
}

export interface AutoReplySettings {
  enabled: boolean;
  allowlist: string[];
  quiet_hours_start?: number | null;
  quiet_hours_end?: number | null;
  max_per_thread_per_hour: number;
  max_per_window: number;
  window_secs: number;
}

export interface AutoReplyAuditEntry {
  id: string;
  account_id: string;
  thread_id: string;
  message_id: string;
  draft: string;
  created_at: number;
  outcome: string;
  reason?: string | null;
}

export interface ThreadAutoReplyStatus {
  thread_id: string;
  opted_in: boolean;
  on_allowlist: boolean;
  global_enabled: boolean;
  effective: boolean;
}

export interface IvrSettings {
  enabled: boolean;
  allowlist: string[];
  require_allowlist: boolean;
}

export interface ThreadIvrStatus {
  thread_id: string;
  enabled: boolean;
  handed_off: boolean;
  node_id?: string | null;
  effective: boolean;
  global_enabled?: boolean;
}

export interface SellOption {
  id: string;
  label: string;
  amount: number;
  unit: string;
  price_cents?: number | null;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  sku: string;
  /** Sell price per base_unit (¢) */
  price_cents: number;
  /** Cost per base_unit (¢) */
  cost_cents: number;
  supplier: string;
  base_unit: string;
  stock_unit: string;
  sales_unit: string;
  quantity_base_milli: number;
  quantity_in_stock: number;
  stock_qty?: number | null;
  unit: string;
  weight: number;
  weight_unit: string;
  image_path: string;
  sell_options: SellOption[];
  updated_at: number;
}

export interface Customer {
  id: string;
  thread_id: string;
  display_name: string;
  notes: string;
  updated_at: number;
}

export interface OrderLine {
  product_id: string;
  name: string;
  quantity: number;
  unit_price_cents: number;
  unit: string;
  quantity_base_milli?: number;
  line_total_cents?: number;
  sell_option_label?: string;
}

export interface Order {
  id: string;
  customer_id: string;
  thread_id: string;
  status: string;
  lines: OrderLine[];
  total_cents: number;
  created_at: number;
  updated_at: number;
}

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<ApiResult<T>> {
  try {
    const raw = await invoke<ApiResult<T>>(cmd, args);
    return raw;
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export const api = {
  getThreads: () => call<ThreadSummary[]>("cmd_get_threads"),
  getThreadMessages: (threadId: string) =>
    call<Message[]>("cmd_get_thread_messages", { threadId }),
  getReceiveLoopState: () => call<ReceiveLoopState>("cmd_get_receive_loop_state"),
  getDiagnostics: () => call<Diagnostics>("cmd_get_diagnostics"),
  checkAiStatus: () => call<AiStatus>("cmd_check_ai_status"),
  listOutbox: (threadId?: string) =>
    call<OutboxItem[]>("cmd_list_outbox", { threadId: threadId ?? null }),
  getOutboxSummary: () => call<OutboxSummary>("cmd_get_outbox_state_summary"),
  queueMessage: (threadId: string, content: string, recipient = "") =>
    call<OutboxItem>("cmd_queue_outgoing_message", {
      threadId,
      recipient,
      content,
    }),
  queueMessageWithAttachment: (
    threadId: string,
    content: string,
    attachmentB64: string,
    attachmentExt: string,
    recipient = "",
  ) =>
    call<OutboxItem>("cmd_queue_outgoing_with_attachment", {
      threadId,
      recipient,
      content,
      attachmentB64,
      attachmentExt,
    }),
  retryOutbox: (id: string) => call<OutboxItem>("cmd_retry_outbox_item", { id }),
  deleteOutbox: (id: string) => call<boolean>("cmd_delete_outbox_item", { id }),
  markThreadRead: (threadId: string) =>
    call<boolean>("cmd_mark_thread_read", { threadId }),
  searchMessages: (query: string, limit = 40) =>
    call<SearchResult[]>("cmd_search_messages", {
      query,
      limit,
      threadId: null,
      sender: null,
      afterTs: null,
      beforeTs: null,
    }),
  listContactMeta: () => call<ContactMeta[]>("cmd_list_contact_meta"),
  setContactMeta: (
    contactId: string,
    patch: {
      display_name?: string | null;
      alias?: string | null;
      favorite?: boolean;
      muted?: boolean;
    },
  ) =>
    call<ContactMeta>("cmd_set_contact_meta", {
      contactId,
      patch,
    }),
  deleteContactMeta: (contactId: string) =>
    call<boolean>("cmd_delete_contact_meta", { contactId }),
  listGroupMeta: () => call<GroupMeta[]>("cmd_list_group_meta"),
  setGroupMeta: (groupId: string, patch: { display_name?: string | null }) =>
    call<GroupMeta>("cmd_set_group_meta", { groupId, patch }),
  createSignalGroup: (name: string, members: string[]) =>
    call<{
      thread_id: string;
      group_id: string;
      display_name?: string | null;
      members: string[];
    }>("cmd_create_signal_group", { name, members }),
  searchContacts: (query: string) =>
    call<unknown>("cmd_search_contacts", { query, filters: null }),
  searchGroups: (query: string) =>
    call<unknown>("cmd_search_groups", { query, filters: null }),
  summarizeThread: (threadId: string, lastN?: number) =>
    call<string>("cmd_summarize_thread", { threadId, lastN: lastN ?? null }),
  draftReply: (threadId: string, intent: string, constraints?: string) =>
    call<string>("cmd_draft_reply", {
      threadId,
      intent,
      constraints: constraints ?? null,
      lastN: null,
    }),
  suggestThreadActions: (threadId: string, lastN?: number) =>
    call<ThreadActionSuggestion[]>("cmd_suggest_thread_actions", {
      threadId,
      lastN: lastN ?? null,
    }),
  getPendingReplies: (threadId: string) =>
    call<PendingReply[]>("cmd_get_pending_replies", { threadId }),
  exportThread: (threadId: string, format = "json") =>
    call<unknown>("cmd_export_thread", {
      threadId,
      format,
      fromTs: null,
      toTs: null,
    }),
  exportAccount: (format = "json") =>
    call<unknown>("cmd_export_account", { format, fromTs: null, toTs: null }),
  openPath: (path: string) => call<boolean>("cmd_open_path", { path }),
  getAutoReplySettings: () => call<AutoReplySettings>("cmd_get_auto_reply_settings"),
  setAutoReplySettings: (settings: AutoReplySettings) =>
    call<AutoReplySettings>("cmd_set_auto_reply_settings", { settings }),
  listAutoReplyAudit: (limit = 100) =>
    call<AutoReplyAuditEntry[]>("cmd_list_auto_reply_audit", { limit }),
  setThreadAutoReply: (threadId: string, enabled: boolean) =>
    call<unknown>("cmd_set_thread_auto_reply", { threadId, enabled }),
  getThreadAutoReply: (threadId: string) =>
    call<ThreadAutoReplyStatus>("cmd_get_thread_auto_reply", { threadId }),
  getIvrSettings: () => call<IvrSettings>("cmd_get_ivr_settings"),
  setIvrSettings: (settings: IvrSettings) =>
    call<IvrSettings>("cmd_set_ivr_settings", { settings }),
  getThreadIvr: (threadId: string) =>
    call<ThreadIvrStatus>("cmd_get_thread_ivr", { threadId }),
  setThreadIvr: (threadId: string, enabled: boolean) =>
    call<ThreadIvrStatus>("cmd_set_thread_ivr", { threadId, enabled }),
  clearThreadHandoff: (threadId: string) =>
    call<ThreadIvrStatus>("cmd_clear_thread_handoff", { threadId }),
  listProducts: () => call<Product[]>("cmd_list_products"),
  upsertProduct: (product: Product) =>
    call<Product>("cmd_upsert_product", { product }),
  deleteProduct: (id: string) => call<{ deleted: boolean }>("cmd_delete_product", { id }),
  setProductImage: (id: string, bytesBase64: string, ext: string) =>
    call<Product>("cmd_set_product_image", { id, bytesBase64, ext }),
  clearProductImage: (id: string) => call<Product>("cmd_clear_product_image", { id }),
  getProductImage: (id: string) =>
    call<{ bytes_base64: string; mime: string }>("cmd_get_product_image", { id }),
  listCustomers: () => call<Customer[]>("cmd_list_customers"),
  upsertCustomer: (customer: Customer) =>
    call<Customer>("cmd_upsert_customer", { customer }),
  deleteCustomer: (id: string) =>
    call<{ deleted: boolean }>("cmd_delete_customer", { id }),
  ensureCustomerForThread: (threadId: string, displayName?: string) =>
    call<Customer>("cmd_ensure_customer_for_thread", {
      threadId,
      displayName: displayName ?? null,
    }),
  listOrders: (threadId?: string) =>
    call<Order[]>("cmd_list_orders", { threadId: threadId ?? null }),
  createOrder: (
    threadId: string,
    lines: {
      productId: string;
      quantity: number;
      unit?: string;
      sellOptionId?: string;
    }[],
  ) =>
    call<Order>("cmd_create_order", {
      threadId,
      lines: lines.map((l) => ({
        product_id: l.productId,
        quantity: l.quantity,
        unit: l.unit ?? "",
        sell_option_id: l.sellOptionId ?? "",
      })),
    }),
  setOrderStatus: (id: string, status: string) =>
    call<Order>("cmd_set_order_status", { id, status }),
  sendOrderInvoice: (id: string) => call<Order>("cmd_send_order_invoice", { id }),
  startDeviceLink: () => call<DeviceLinkStart>("cmd_start_device_link"),
  cancelDeviceLink: () => call<{ cancelled: boolean }>("cmd_cancel_device_link"),
};

export async function onEvent<T>(
  event: string,
  handler: (payload: T) => void,
): Promise<UnlistenFn> {
  return listen<T>(event, (e) => handler(e.payload));
}

export function unwrap<T>(res: ApiResult<T>, fallback: T): T {
  return res.success ? res.data : fallback;
}

export function errMsg(res: ApiResult<unknown>): string | null {
  return res.success ? null : res.error;
}
