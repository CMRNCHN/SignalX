import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Message, Order, Product } from "../../api";
import {
  IconCheckCheck,
  IconChevronDown,
  IconFilter,
  IconPlus,
  IconSort,
  IconTag,
  IconX,
} from "../../navIcons";
import type { Person } from "../People/people";
import { matchingProducts } from "../../globalSearch";
import { useEscapeLayer } from "../../overlayEscape";
import {
  CATALOG_STATUSES,
  STOCK_STATUSES,
  catalogCategory,
  catalogStatus,
  productHaystack,
  stockStatus,
  type CatalogStatus,
  type StockStatus,
} from "./catalog";

type Props = {
  products: Product[];
  selectedId: string | null;
  onSelectId: (id: string | null) => void;
  catalogSearchQuery?: string;
  catalogSearchTick?: number;
  people?: Person[];
  orders?: Order[];
  messages?: Message[];
  productImages: Record<string, string>;
  productPriceLabel: (p: Product) => string;
  productStockLabel: (p: Product) => string;
  productWeightLabel: (p: Product) => string | null;
  initials: (label: string) => string;
  formOpen: boolean;
  form: ReactNode;
  onNew: () => void;
  onEdit: (p: Product) => void;
  onDelete: (id: string) => void;
  onAdjustStock: (p: Product, delta: number) => void;
  onExportCsv: () => void;
  onImportCsv: (file: File | null) => void;
  topNotice?: ReactNode;
};

export function CatalogScreen({
  products,
  selectedId,
  onSelectId,
  catalogSearchQuery = "",
  catalogSearchTick = 0,
  people = [],
  orders = [],
  messages = [],
  productImages,
  productPriceLabel,
  productStockLabel,
  productWeightLabel,
  initials,
  formOpen,
  form,
  onNew,
  onEdit,
  onDelete,
  onAdjustStock,
  onExportCsv,
  onImportCsv,
  topNotice,
}: Props) {
  const [q, setQ] = useState(catalogSearchQuery);
  const [statuses, setStatuses] = useState<CatalogStatus[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [stocks, setStocks] = useState<StockStatus[]>([]);
  const [sortAsc, setSortAsc] = useState(true);
  const [menu, setMenu] = useState<null | "status" | "category" | "stock" | "more">(null);
  useEscapeLayer(!!menu, () => setMenu(null));

  useEffect(() => {
    setQ(catalogSearchQuery);
  }, [catalogSearchQuery, catalogSearchTick]);

  const allCategories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) set.add(catalogCategory(p));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [products]);

  const visible = useMemo(() => {
    let rows: Product[];

    // If search came from sidebar (catalogSearchTick > 0), use smart matching
    if (catalogSearchTick > 0 && catalogSearchQuery.trim()) {
      rows = matchingProducts(products, catalogSearchQuery, people, orders, messages);
    } else {
      // Local search input: use haystack
      const needle = q.trim().toLowerCase();
      rows = products.filter((p) => {
        if (!needle) return true;
        return productHaystack(p).toLowerCase().includes(needle);
      });
    }

    // Apply local filters
    rows = rows.filter((p) => {
      if (statuses.length && !statuses.includes(catalogStatus(p))) return false;
      if (categories.length && !categories.includes(catalogCategory(p))) return false;
      if (stocks.length && !stocks.includes(stockStatus(p))) return false;
      return true;
    });

    return rows.sort((a, b) =>
      sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name),
    );
  }, [products, q, statuses, categories, stocks, sortAsc, catalogSearchQuery, catalogSearchTick, people, orders, messages]);

  const selected = products.find((p) => p.id === selectedId) ?? null;

  const filtersActive = Boolean(q.trim() || statuses.length || categories.length || stocks.length);

  const toggle = <T,>(list: T[], set: (v: T[]) => void, item: T) =>
    set(list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  const clearFilters = () => {
    setQ("");
    setStatuses([]);
    setCategories([]);
    setStocks([]);
    setSortAsc(true);
  };

  const counts = useMemo(() => {
    let active = 0;
    let draft = 0;
    let discontinued = 0;
    let low = 0;
    for (const p of products) {
      const st = catalogStatus(p);
      if (st === "active") active += 1;
      else if (st === "draft") draft += 1;
      else discontinued += 1;
      if (stockStatus(p) === "low") low += 1;
    }
    return { active, draft, discontinued, low };
  }, [products]);

  return (
    <>
      {menu && <div className="menu-scrim" onClick={() => setMenu(null)} />}

      <section className="thread-col catalog-col">
        <header className="catalog-toolbar">
          <div className="catalog-search">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search catalog…"
              aria-label="Search catalog"
            />
            {q && (
              <button type="button" className="icon-btn tiny" onClick={() => setQ("")} aria-label="Clear search">
                <IconX />
              </button>
            )}
          </div>

          <div className="catalog-tools">
            <button
              type="button"
              className="tool-btn add"
              aria-label="New product"
              title="New product"
              onClick={onNew}
            >
              <IconPlus />
              <span className="tool-label">Add</span>
            </button>

            <div className="menu-anchor">
              <button
                type="button"
                className={statuses.length ? "tool-btn active" : "tool-btn"}
                aria-label="Filter by status"
                title="Status"
                onClick={() => setMenu(menu === "status" ? null : "status")}
              >
                <IconCheckCheck />
                <span className="tool-label">Status</span>
                <IconChevronDown className="caret" />
                {statuses.length > 0 && <span className="tool-dot" />}
              </button>
              {menu === "status" && (
                <div className="menu-pop">
                  <span className="menu-label">Status</span>
                  {CATALOG_STATUSES.map((st) => (
                    <button key={st.id} type="button" onClick={() => toggle(statuses, setStatuses, st.id)}>
                      <span className={statuses.includes(st.id) ? "tick on" : "tick"} />
                      {st.label}
                    </button>
                  ))}
                  {statuses.length > 0 && (
                    <button type="button" className="menu-reset" onClick={() => setStatuses([])}>
                      Reset
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="menu-anchor">
              <button
                type="button"
                className={categories.length ? "tool-btn active" : "tool-btn"}
                aria-label="Filter by category"
                title="Category"
                onClick={() => setMenu(menu === "category" ? null : "category")}
              >
                <IconTag />
                <span className="tool-label">Category</span>
                <IconChevronDown className="caret" />
                {categories.length > 0 && <span className="tool-dot" />}
              </button>
              {menu === "category" && (
                <div className="menu-pop">
                  <span className="menu-label">Supplier</span>
                  {allCategories.length === 0 && <span className="menu-label">None yet</span>}
                  {allCategories.map((c) => (
                    <button key={c} type="button" onClick={() => toggle(categories, setCategories, c)}>
                      <span className={categories.includes(c) ? "tick on" : "tick"} />
                      {c}
                    </button>
                  ))}
                  {categories.length > 0 && (
                    <button type="button" className="menu-reset" onClick={() => setCategories([])}>
                      Reset
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="menu-anchor">
              <button
                type="button"
                className={stocks.length ? "tool-btn active" : "tool-btn"}
                aria-label="Filter by stock"
                title="Stock"
                onClick={() => setMenu(menu === "stock" ? null : "stock")}
              >
                <IconFilter />
                <span className="tool-label">Stock</span>
                <IconChevronDown className="caret" />
                {stocks.length > 0 && <span className="tool-dot" />}
              </button>
              {menu === "stock" && (
                <div className="menu-pop">
                  <span className="menu-label">Stock</span>
                  {STOCK_STATUSES.map((st) => (
                    <button key={st.id} type="button" onClick={() => toggle(stocks, setStocks, st.id)}>
                      <span className={stocks.includes(st.id) ? "tick on" : "tick"} />
                      {st.label}
                    </button>
                  ))}
                  {stocks.length > 0 && (
                    <button type="button" className="menu-reset" onClick={() => setStocks([])}>
                      Reset
                    </button>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              className={sortAsc ? "tool-btn" : "tool-btn active"}
              aria-label={sortAsc ? "Sorted A to Z" : "Sorted Z to A"}
              title={sortAsc ? "Sorted A–Z" : "Sorted Z–A"}
              onClick={() => setSortAsc((v) => !v)}
            >
              <IconSort />
            </button>

            {filtersActive && (
              <button type="button" className="tool-btn" onClick={clearFilters}>
                Clear filters
              </button>
            )}

            <div className="menu-anchor">
              <button
                type="button"
                className="tool-btn"
                aria-label="More actions"
                title="More"
                onClick={() => setMenu(menu === "more" ? null : "more")}
              >
                <span className="tool-label">More</span>
              </button>
              {menu === "more" && (
                <div className="menu-pop right">
                  <button
                    type="button"
                    onClick={() => {
                      onExportCsv();
                      setMenu(null);
                    }}
                  >
                    Export CSV
                  </button>
                  <label className="menu-file">
                    Import CSV
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      hidden
                      onChange={(e) => {
                        onImportCsv(e.target.files?.[0] || null);
                        e.target.value = "";
                        setMenu(null);
                      }}
                    />
                  </label>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="catalog-list">
          {products.length === 0 ? (
            <div className="empty-state">
              <h3>Your catalog is empty</h3>
              <p>Add your first product to get started.</p>
              <button type="button" className="action-btn primary" onClick={onNew}>
                New product
              </button>
            </div>
          ) : visible.length === 0 ? (
            <div className="empty-state">
              <h3>No products match these filters</h3>
              <p>Try adjusting your search or filters.</p>
              {filtersActive && (
                <button type="button" className="ghost-btn" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            visible.map((p) => {
              const st = catalogStatus(p);
              const stock = stockStatus(p);
              return (
                <button
                  key={p.id}
                  type="button"
                  className={selectedId === p.id ? "catalog-card active" : "catalog-card"}
                  onClick={() => onSelectId(p.id)}
                >
                  <div className="catalog-card-head">
                    <span className="person-avatar" aria-hidden>
                      {productImages[p.id] ? (
                        <img src={productImages[p.id]} alt="" />
                      ) : (
                        initials(p.name)
                      )}
                    </span>
                    <div className="person-id">
                      <div className="person-name-row">
                        <span className="person-name">{p.name}</span>
                        <span className="person-type">{st}</span>
                      </div>
                      <div className="person-sub">
                        {[p.sku, catalogCategory(p)].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  </div>
                  <div className="person-preview">
                    <span>
                      {productPriceLabel(p)} · {productStockLabel(p)}
                      {stock === "low" ? " · low" : ""}
                      {stock === "out-of-stock" ? " · out" : ""}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </section>

      <section className="convo catalog-detail">
        {topNotice}
        {formOpen ? (
          <div className="catalog-detail-body catalog-form-wrap">{form}</div>
        ) : !selected ? (
          <div className="catalog-detail-empty">
            <h2>
              {products.length} product{products.length === 1 ? "" : "s"}
            </h2>
            <p>Select a product to see stock, packs, and edit it.</p>
            <dl className="people-rollup">
              <div>
                <dt>Active</dt>
                <dd>{counts.active}</dd>
              </div>
              <div>
                <dt>Draft</dt>
                <dd>{counts.draft}</dd>
              </div>
              <div>
                <dt>Discontinued</dt>
                <dd>{counts.discontinued}</dd>
              </div>
              <div>
                <dt>Low stock</dt>
                <dd>{counts.low}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <div className="catalog-detail-body">
            <header className="people-detail-head">
              <span className="person-avatar lg" aria-hidden>
                {productImages[selected.id] ? (
                  <img src={productImages[selected.id]} alt="" />
                ) : (
                  initials(selected.name)
                )}
              </span>
              <div className="person-id">
                <div className="person-name-row">
                  <h2>{selected.name}</h2>
                  <span className="person-type">{catalogStatus(selected)}</span>
                </div>
                <div className="person-sub">
                  {[selected.sku, catalogCategory(selected)].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div className="people-detail-actions">
                <button type="button" className="act-btn" onClick={() => onEdit(selected)}>
                  Edit
                </button>
                <button type="button" className="act-btn danger" onClick={() => onDelete(selected.id)}>
                  Delete
                </button>
              </div>
            </header>

            {selected.description && <p className="catalog-desc">{selected.description}</p>}

            <dl className="people-stats">
              <div>
                <dt>Price</dt>
                <dd>{productPriceLabel(selected)}</dd>
              </div>
              <div>
                <dt>Stock</dt>
                <dd>{productStockLabel(selected)}</dd>
              </div>
              <div>
                <dt>Weight</dt>
                <dd>{productWeightLabel(selected) || "—"}</dd>
              </div>
              <div>
                <dt>Packs</dt>
                <dd>{selected.sell_options?.length || 0}</dd>
              </div>
            </dl>

            <div className="catalog-stock-row">
              <span className="field-label">Adjust stock</span>
              <div className="stock-stepper">
                <button type="button" title="Remove 1 stock unit" onClick={() => onAdjustStock(selected, -1)}>
                  −
                </button>
                <span>stock</span>
                <button type="button" title="Add 1 stock unit" onClick={() => onAdjustStock(selected, 1)}>
                  +
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
