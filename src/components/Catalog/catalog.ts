import type { Product } from "../../api";

export type CatalogStatus = "active" | "draft" | "discontinued";
export type StockStatus = "in-stock" | "low" | "out-of-stock";

export const CATALOG_STATUSES: { id: CatalogStatus; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "draft", label: "Draft" },
  { id: "discontinued", label: "Discontinued" },
];

export const STOCK_STATUSES: { id: StockStatus; label: string }[] = [
  { id: "in-stock", label: "In Stock" },
  { id: "low", label: "Low Stock" },
  { id: "out-of-stock", label: "Out of Stock" },
];

export function isOutOfStock(p: Product): boolean {
  const milli = p.quantity_base_milli ?? 0;
  return milli <= 0 && (p.quantity_in_stock ?? 0) <= 0;
}

export function isLowStock(p: Product): boolean {
  const thr = p.low_stock_threshold_milli ?? 0;
  return thr > 0 && (p.quantity_base_milli ?? 0) <= thr;
}

/** No lifecycle field on Product yet — zero stock reads as discontinued. */
export function catalogStatus(p: Product): CatalogStatus {
  return isOutOfStock(p) ? "discontinued" : "active";
}

export function stockStatus(p: Product): StockStatus {
  if (isOutOfStock(p)) return "out-of-stock";
  if (isLowStock(p) && (p.quantity_base_milli ?? 0) > 0) return "low";
  return "in-stock";
}

export function catalogCategory(p: Product): string {
  const s = (p.supplier || "").trim();
  return s || "Uncategorized";
}

export function productHaystack(p: Product): string {
  return `${p.name} ${p.sku} ${p.description} ${p.supplier} ${p.id}`;
}
