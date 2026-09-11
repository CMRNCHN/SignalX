import { SidebarState, Scope } from "../types";
import { SidebarSearch } from "./SidebarSearch";
import { ScopeSection } from "./ScopeSection";
import { FilterPanel } from "./FilterPanel";

const SCOPES: Array<{ key: Scope; label: string; icon: string }> = [
  { key: "messages", label: "Messages", icon: "💬" },
  { key: "people", label: "People", icon: "👥" },
  { key: "catalog", label: "Catalog", icon: "📦" },
  { key: "orders", label: "Orders", icon: "📋" },
  { key: "bot_menus", label: "Bot Menus", icon: "🤖" },
];

interface SidebarProps {
  state: SidebarState;
  onSearch: (query: string) => void;
  onToggleScope: (scope: Scope) => void;
  onSelectItem: (itemId: string) => void;
  onFilterChange: (scope: Scope, filterKey: string, value: any) => void;
}

export function Sidebar({
  state,
  onSearch,
  onToggleScope,
  onSelectItem,
  onFilterChange,
}: SidebarProps) {
  return (
    <div className="sidebar">
      {/* Search */}
      <SidebarSearch
        value={state.searchQuery}
        onChange={onSearch}
      />

      {/* Scope sections */}
      <div className="scope-list">
        {SCOPES.map((scope) => (
          <ScopeSection
            key={scope.key}
            scope={scope.key}
            label={scope.label}
            icon={scope.icon}
            count={state.scopeCounts[scope.key] || 0}
            isExpanded={state.expandedScopes.has(scope.key)}
            isSelected={state.selectedScope === scope.key}
            onToggleExpand={() => onToggleScope(scope.key)}
            onSelectItem={onSelectItem}
            selectedItemId={state.selectedItemId}
            items={state.scopeResults[scope.key] || []}
          />
        ))}
      </div>

      {/* Filters (scope-dependent) */}
      <FilterPanel
        scope={state.selectedScope}
        filters={state.activeFilters}
        onFilterChange={onFilterChange}
      />
    </div>
  );
}
