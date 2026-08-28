import type { ContactMeta, Customer, Order, Product } from "./api";

export type SegmentTone = "ok" | "warn" | "accent" | "muted";

export type CustomerSegment = {
  label: string;
  tone: SegmentTone;
};

export function deriveCustomerSegments(
  contact: ContactMeta | null,
  customer: Customer | null,
  orders: Order[],
  products: Product[],
  lifetimeCents: number,
): CustomerSegment[] {
  const tags: CustomerSegment[] = [];

  if (contact?.favorite) {
    tags.push({ label: "Favorite", tone: "warn" });
  }
  if (lifetimeCents >= 3000) {
    tags.push({ label: "VIP", tone: "ok" });
  }

  const counts = new Map<string, number>();
  for (const o of orders) {
    for (const line of o.lines) {
      const name = line.name || products.find((p) => p.id === line.product_id)?.name;
      if (!name) continue;
      counts.set(name, (counts.get(name) || 0) + line.quantity);
    }
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top) {
    const words = top[0].split(/\s+/);
    const short = words.length > 2 ? words.slice(-2).join(" ") : top[0];
    tags.push({ label: `${short} buyer`, tone: "accent" });
  }

  if (customer?.notes) {
    const note = customer.notes.toLowerCase();
    if (note.includes("saturday") && !tags.some((t) => t.label.includes("Saturday"))) {
      tags.push({ label: "Saturday pickup", tone: "muted" });
    }
  }

  return tags;
}
