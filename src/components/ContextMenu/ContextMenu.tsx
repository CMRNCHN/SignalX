import { useEffect, useRef } from "react";
import "./ContextMenu.css";

export interface MenuItem {
  id: string;
  label: string;
  action: () => void;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
}

export interface ContextMenuPosition {
  x: number;
  y: number;
}

interface ContextMenuProps {
  position: ContextMenuPosition | null;
  items: MenuItem[];
  onClose: () => void;
  onAddItem?: () => void;
  onEditMenu?: () => void;
  onDeleteMenu?: () => void;
}

export function ContextMenu({
  position,
  items,
  onClose,
  onAddItem,
  onEditMenu,
  onDeleteMenu,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!position) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [position, onClose]);

  if (!position) return null;

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ top: `${position.y}px`, left: `${position.x}px` }}
      role="menu"
    >
      {items.length > 0 && (
        <div className="context-menu-items">
          {items.map((item) =>
            item.divider ? (
              <div key={item.id} className="context-menu-divider" />
            ) : (
              <button
                key={item.id}
                className={`context-menu-item ${item.danger ? "danger" : ""} ${
                  item.disabled ? "disabled" : ""
                }`}
                onClick={() => {
                  if (!item.disabled) {
                    item.action();
                    onClose();
                  }
                }}
                disabled={item.disabled}
                role="menuitem"
              >
                {item.label}
              </button>
            ),
          )}
        </div>
      )}

      {(onAddItem || onEditMenu || onDeleteMenu) && (
        <div className="context-menu-divider" />
      )}

      <div className="context-menu-actions">
        {onAddItem && (
          <button
            className="context-menu-action"
            onClick={() => {
              onAddItem();
              onClose();
            }}
            role="menuitem"
            title="Add a new item to this menu"
          >
            + Add item
          </button>
        )}
        {onEditMenu && (
          <button
            className="context-menu-action"
            onClick={() => {
              onEditMenu();
              onClose();
            }}
            role="menuitem"
            title="Edit this menu"
          >
            ⚙ Edit menu
          </button>
        )}
        {onDeleteMenu && (
          <button
            className="context-menu-action danger"
            onClick={() => {
              onDeleteMenu();
              onClose();
            }}
            role="menuitem"
            title="Delete this menu"
          >
            ✕ Delete menu
          </button>
        )}
      </div>
    </div>
  );
}
