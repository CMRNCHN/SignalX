import { Scope } from "../types";
import { IconChevronDown } from "../../../navIcons";

interface ScopeSectionProps {
  scope: Scope;
  label: string;
  icon: string;
  count: number;
  isExpanded: boolean;
  isSelected: boolean;
  onToggleExpand: () => void;
  onSelectItem: (itemId: string) => void;
  selectedItemId: string | null;
  items: Array<{ id: string; name: string; subtitle?: string }>;
}

export function ScopeSection({
  scope,
  label,
  icon,
  count,
  isExpanded,
  isSelected,
  onToggleExpand,
  onSelectItem,
  selectedItemId,
  items,
}: ScopeSectionProps) {
  return (
    <div className="scope-section">
      {/* Scope header */}
      <button
        type="button"
        className={`scope-header ${isSelected ? "selected" : ""}`}
        onClick={onToggleExpand}
        aria-expanded={isExpanded}
      >
        <span className="scope-caret">
          {isExpanded ? "▼" : "▶"}
        </span>
        <span className="scope-icon">{icon}</span>
        <span className="scope-label">{label}</span>
        <span className="scope-count">{count}</span>
      </button>

      {/* Scope results (nested) */}
      {isExpanded && items.length > 0 && (
        <div className="scope-results">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`scope-result-item ${selectedItemId === item.id ? "active" : ""}`}
              onClick={() => onSelectItem(item.id)}
              aria-selected={selectedItemId === item.id}
            >
              <div className="result-item-name">{item.name}</div>
              {item.subtitle && <div className="result-item-subtitle">{item.subtitle}</div>}
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {isExpanded && items.length === 0 && (
        <div className="scope-empty">
          <p>No results</p>
        </div>
      )}
    </div>
  );
}
