import { Scope, FilterState } from "../types";

interface FilterPanelProps {
  scope: Scope | null;
  filters: FilterState;
  onFilterChange: (scope: Scope, filterKey: string, value: any) => void;
}

export function FilterPanel({ scope, filters, onFilterChange }: FilterPanelProps) {
  if (!scope) return null;

  const scopeFilters = filters[scope];
  if (!scopeFilters || Object.keys(scopeFilters).length === 0) {
    return null;
  }

  return (
    <div className="filter-panel">
      <p className="filter-label">Filters:</p>

      {scope === "people" && (
        <>
          {/* Type filter */}
          {filters.people.type && (
            <button className="filter-item" onClick={() => onFilterChange("people", "type", undefined)}>
              Type: {filters.people.type.join(", ")}
            </button>
          )}
          {/* Status filter */}
          {filters.people.status && (
            <button className="filter-item" onClick={() => onFilterChange("people", "status", undefined)}>
              Status: {filters.people.status.join(", ")}
            </button>
          )}
        </>
      )}

      {scope === "orders" && (
        <>
          {/* Status filter */}
          {filters.orders.status && (
            <button className="filter-item" onClick={() => onFilterChange("orders", "status", undefined)}>
              Status: {filters.orders.status.join(", ")}
            </button>
          )}
          {/* Date range filter */}
          {filters.orders.dateRange && (
            <button className="filter-item" onClick={() => onFilterChange("orders", "dateRange", undefined)}>
              Date: {filters.orders.dateRange === "all" ? "All time" : `Last ${filters.orders.dateRange} days`}
            </button>
          )}
        </>
      )}

      {scope === "catalog" && (
        <>
          {/* Status filter */}
          {filters.catalog.status && (
            <button className="filter-item" onClick={() => onFilterChange("catalog", "status", undefined)}>
              Status: {filters.catalog.status.join(", ")}
            </button>
          )}
          {/* Category filter */}
          {filters.catalog.category && (
            <button className="filter-item" onClick={() => onFilterChange("catalog", "category", undefined)}>
              Category: {filters.catalog.category.join(", ")}
            </button>
          )}
        </>
      )}
    </div>
  );
}
