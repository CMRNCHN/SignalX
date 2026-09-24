/** Display form for a phone number: drop the +1 country code and group the
 *  digits, so operators read a name-shaped token instead of an E.164 string.
 *  Anything that isn't a US number (or isn't a number at all) passes through. */
import type { ContactMeta, Customer, GroupMeta, Message } from "./api";

/** Canonical grams / ml / each factors — keep aligned with `src-tauri/src/uom.rs`. */
const UNIT_CANON: Record<string, number> = {
  ea: 1,
  g: 1,
  kg: 1000,
  oz: 28.349523125,
  lb: 453.59237,
  ml: 1,
  l: 1000,
};

function normUnit(raw: string): string {
  const u = raw.trim().toLowerCase();
  if (!u || u === "each" || u === "unit" || u === "units") return "ea";
  if (u === "liter" || u === "litre" || u === "liters" || u === "litres") return "l";
  if (u === "gram" || u === "grams") return "g";
  if (u === "ounce" || u === "ounces") return "oz";
  if (u === "pound" || u === "pounds" || u === "lbs") return "lb";
  return u;
}

/** Convert an amount measured in `baseUnit` into `toUnit`. */
export function convertFromBase(amountBase: number, toUnit: string, baseUnit: string): number {
  const to = normUnit(toUnit);
  const base = normUnit(baseUnit);
  if (to === base) return amountBase;
  const fromCanon = amountBase * (UNIT_CANON[base] ?? 1);
  const toFactor = UNIT_CANON[to] ?? 1;
  return fromCanon / toFactor;
}

export function formatQty(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n - Math.round(n)) < 0.001) return String(Math.round(n));
  return n.toFixed(3).replace(/\.?0+$/, "");
}

/** Stock amount in the product's stock UOM, from canonical milli. */
export function stockQtyFromMilli(
  milli: number,
  stockUnit: string,
  baseUnit: string,
): number {
  return convertFromBase(milli / 1000, stockUnit || baseUnit, baseUnit);
}

export function countsTowardRevenue(status: string): boolean {
  const s = status.toLowerCase();
  return s !== "draft" && s !== "cancelled" && s !== "canceled";
}

export function formatPhone(raw: string): string {
  const v = raw.replace(/^dm:/, "").trim();
  if (!v.startsWith("+")) return v;
  const digits = v.slice(1).replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (local.length !== 10) return v;
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}

/** signal-cli uses `group.` base64 ids; older UI code used `group:`. */
export function isGroupThread(id: string | null | undefined): boolean {
  if (!id) return false;
  return id.startsWith("group:") || id.startsWith("group.");
}

export function stripThreadPrefix(id: string): string {
  return id.replace(/^(dm:|group:|group\.)/, "");
}

export function threadTitle(
  id: string,
  contacts: ContactMeta[],
  groups: GroupMeta[],
  customers: Customer[] = [],
): string {
  if (isGroupThread(id)) {
    const key = stripThreadPrefix(id);
    const g = groups.find((x) => x.group_id === id || stripThreadPrefix(x.group_id) === key);
    const named = g?.display_name?.trim();
    if (named) return named;
    return "Unnamed group";
  }
  const raw = id.replace(/^dm:/, "");
  const cust = customers.find((c) => c.thread_id === id || c.thread_id === raw);
  if (cust?.display_name?.trim()) return cust.display_name.trim();
  const c = contacts.find(
    (x) =>
      x.contact_id === id ||
      x.contact_id === raw ||
      x.contact_id === `dm:${raw}` ||
      x.contact_id.replace(/^dm:/, "") === raw,
  );
  const named = (c?.display_name || c?.alias || "").trim();
  if (named) return named;
  return formatPhone(raw || id);
}

export function initials(label: string): string {
  const parts = label.replace(/^\+/, "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Stable per-identity avatar tint. Low saturation so it reads as a tinted
 *  grey rather than a colour accent, but distinct enough to tell rows apart. */
export function avatarTint(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return {
    background: `hsl(${hue} 16% 30%)`,
    color: `hsl(${hue} 38% 84%)`,
    boxShadow: `inset 0 0 0 1px hsl(${hue} 20% 42%)`,
  };
}

export function fmtTime(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function isOutgoing(m: Message): boolean {
  const d = String(m.direction).toLowerCase();
  return d === "outgoing" || d.includes("out");
}
