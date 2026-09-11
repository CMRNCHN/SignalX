import { Sidebar } from "./sidebar/Sidebar";
import { DetailView } from "./detail/DetailView";
import { ActionPanel } from "./actions/ActionPanel";
import { useThreePanel } from "./hooks/useThreePanel";
import { Scope } from "./types";

interface ThreePanelLayoutProps {
  onFetchData?: (scope: Scope, itemId: string) => Promise<any>;
  onAction?: (actionId: string, scope: Scope, itemId: string) => void;
}

export function ThreePanelLayout({ onFetchData, onAction }: ThreePanelLayoutProps) {
  const {
    sidebarState,
    detailState,
    handleSearch,
    handleToggleScope,
    handleSelectItem,
    handleFilterChange,
  } = useThreePanel({ onFetchData });

  const handleActionClick = (actionId: string) => {
    if (onAction && detailState.selectedScope && detailState.selectedItemId) {
      onAction(actionId, detailState.selectedScope, detailState.selectedItemId);
    }
  };

  return (
    <div className="three-panel-layout">
      {/* Panel 1: Sidebar Navigator */}
      <div className="panel panel-sidebar">
        <Sidebar
          state={sidebarState}
          onSearch={handleSearch}
          onToggleScope={handleToggleScope}
          onSelectItem={handleSelectItem}
          onFilterChange={handleFilterChange}
        />
      </div>

      {/* Panel 2: Detail View */}
      <div className="panel panel-detail">
        <DetailView
          state={detailState}
          onAction={handleActionClick}
        />
      </div>

      {/* Panel 3: Quick Actions */}
      <div className="panel panel-actions">
        <ActionPanel
          scope={detailState.selectedScope}
          itemId={detailState.selectedItemId}
          onAction={handleActionClick}
          loading={detailState.loading}
        />
      </div>
    </div>
  );
}
