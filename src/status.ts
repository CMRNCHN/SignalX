export type StatusTone = "ok" | "warn" | "danger" | "muted";

export function orderStatusTone(status: string): StatusTone {
  const s = status.toLowerCase();
  if (s === "paid" || s === "fulfilled" || s === "completed" || s === "confirmed") return "ok";
  if (s === "cancelled" || s === "canceled" || s === "failed") return "danger";
  if (s === "draft" || s === "invoiced" || s === "sent" || s === "pending") return "warn";
  return "muted";
}

const STATUS_ICONS: Record<StatusTone, string> = {
  ok: "✓",
  warn: "⚠",
  danger: "✗",
  muted: "·",
};

export function orderStatusLabel(status: string): string {
  const tone = orderStatusTone(status);
  const icon = STATUS_ICONS[tone];
  const label = status.replace(/_/g, " ");
  return `${icon} ${label}`;
}

export function threadReplyTone(thread: {
  unread_count: number;
  message_count: number;
  outbox_count: number;
}): StatusTone | null {
  if (thread.unread_count > 0) return "warn";
  if (thread.outbox_count > 0) return "warn";
  if (thread.message_count > 0) return "ok";
  return null;
}

export function threadReplyLabel(thread: {
  unread_count: number;
  message_count: number;
  outbox_count: number;
}): string | null {
  if (thread.unread_count > 0) return "⚠ Awaiting reply";
  if (thread.outbox_count > 0) return "⚠ Needs send";
  if (thread.message_count > 0) return "✓ Replied";
  return null;
}

export function isPrimaryAction(kind: string): boolean {
  return kind === "send_invoice" || kind === "send_quote" || kind === "mark_paid";
}
