import { useState, useCallback } from "react";
import type { MenuItem, ContextMenuPosition } from "./ContextMenu";

export function useContextMenu() {
  const [position, setPosition] = useState<ContextMenuPosition | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [currentObjectId, setCurrentObjectId] = useState<string | null>(null);

  const openContextMenu = useCallback(
    (e: React.MouseEvent, menuItems: MenuItem[], objectId?: string) => {
      e.preventDefault();
      e.stopPropagation();
      setPosition({ x: e.clientX, y: e.clientY });
      setItems(menuItems);
      setCurrentObjectId(objectId || null);
    },
    [],
  );

  const closeContextMenu = useCallback(() => {
    setPosition(null);
    setItems([]);
    setCurrentObjectId(null);
  }, []);

  return {
    position,
    items,
    currentObjectId,
    openContextMenu,
    closeContextMenu,
  };
}
