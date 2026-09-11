import { useState, useCallback, useEffect } from "react";
import { SidebarState, DetailViewState, Scope, FilterState } from "../types";

interface UsethreePanelOptions {
  onFetchData?: (scope: Scope, itemId: string) => Promise<any>;
}

export function useThreePanel(options: UsethreePanelOptions = {}) {
  // Sidebar state
  const [sidebarState, setSidebarState] = useState<SidebarState>({
    searchQuery: "",
    expandedScopes: new Set(),
    selectedScope: null,
    selectedItemId: null,
    scopeCounts: {
      messages: 0,
      people: 0,
      catalog: 0,
      orders: 0,
      bot_menus: 0,
    },
    activeFilters: {
      messages: {},
      people: {},
      catalog: {},
      orders: {},
      bot_menus: {},
    },
    scopeResults: {
      messages: [],
      people: [],
      catalog: [],
      orders: [],
      bot_menus: [],
    },
  });

  // Detail view state
  const [detailState, setDetailState] = useState<DetailViewState>({
    selectedScope: null,
    selectedItemId: null,
    itemData: null,
    loading: false,
    error: null,
  });

  // Search handler
  const handleSearch = useCallback((query: string) => {
    setSidebarState((prev) => ({
      ...prev,
      searchQuery: query,
      // TODO: Fetch results for all scopes based on query
    }));
  }, []);

  // Toggle scope expansion
  const handleToggleScope = useCallback((scope: Scope) => {
    setSidebarState((prev) => {
      const newExpanded = new Set(prev.expandedScopes);
      if (newExpanded.has(scope)) {
        newExpanded.delete(scope);
      } else {
        newExpanded.add(scope);
      }
      return { ...prev, expandedScopes: newExpanded, selectedScope: scope };
    });
  }, []);

  // Select item
  const handleSelectItem = useCallback(
    async (itemId: string) => {
      const scope = sidebarState.selectedScope;
      if (!scope) return;

      setSidebarState((prev) => ({
        ...prev,
        selectedItemId: itemId,
      }));

      setDetailState((prev) => ({
        ...prev,
        selectedScope: scope,
        selectedItemId: itemId,
        loading: true,
        error: null,
      }));

      try {
        if (options.onFetchData) {
          const data = await options.onFetchData(scope, itemId);
          setDetailState((prev) => ({
            ...prev,
            itemData: data,
            loading: false,
          }));
        }
      } catch (error) {
        setDetailState((prev) => ({
          ...prev,
          error: error instanceof Error ? error.message : "Unknown error",
          loading: false,
        }));
      }
    },
    [sidebarState.selectedScope, options]
  );

  // Filter handler
  const handleFilterChange = useCallback(
    (scope: Scope, filterKey: string, value: any) => {
      setSidebarState((prev) => ({
        ...prev,
        activeFilters: {
          ...prev.activeFilters,
          [scope]: {
            ...prev.activeFilters[scope],
            [filterKey]: value,
          },
        },
        // TODO: Re-fetch results for this scope with new filters
      }));
    },
    []
  );

  return {
    sidebarState,
    detailState,
    handleSearch,
    handleToggleScope,
    handleSelectItem,
    handleFilterChange,
  };
}
