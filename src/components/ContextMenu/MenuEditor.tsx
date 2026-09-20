import { useState } from "react";
import type { MenuConfig, MenuItemConfig } from "./menuManager";
import "./MenuEditor.css";

interface MenuEditorProps {
  menu: MenuConfig;
  onSave: (menu: MenuConfig) => void;
  onClose: () => void;
}

const ACTION_TYPES = [
  "exportThread",
  "deleteThread",
  "copyId",
  "editOrder",
  "duplicateOrder",
  "sendInvoice",
  "deleteOrder",
  "editProduct",
  "adjustStock",
  "copySku",
  "deleteProduct",
  "editContact",
  "newDm",
  "copyPhone",
  "deleteContact",
  "copyDetails",
];

export function MenuEditor({ menu, onSave, onClose }: MenuEditorProps) {
  const [items, setItems] = useState<MenuItemConfig[]>(menu.items);
  const [newLabel, setNewLabel] = useState("");
  const [newAction, setNewAction] = useState("copyId");

  const handleAddItem = () => {
    if (!newLabel.trim()) return;
    const newItem: MenuItemConfig = {
      id: `item-${Date.now()}`,
      label: newLabel,
      actionType: newAction,
    };
    setItems([...items, newItem]);
    setNewLabel("");
  };

  const handleDeleteItem = (id: string) => {
    setItems(items.filter((item) => item.id !== id));
  };

  const handleToggleDanger = (id: string) => {
    setItems(
      items.map((item) =>
        item.id === id ? { ...item, danger: !item.danger } : item,
      ),
    );
  };

  const handleSave = () => {
    onSave({ ...menu, items });
  };

  return (
    <div className="menu-editor-overlay" onClick={onClose}>
      <div className="menu-editor" onClick={(e) => e.stopPropagation()}>
        <h2>{menu.name}</h2>
        <p className="menu-editor-hint">Customize menu items for {menu.objectType}</p>

        <div className="menu-editor-items">
          {items.map((item) => (
            <div key={item.id} className="menu-editor-item">
              <div className="menu-editor-item-content">
                <input
                  type="text"
                  value={item.label}
                  onChange={(e) => {
                    setItems(
                      items.map((i) =>
                        i.id === item.id ? { ...i, label: e.target.value } : i,
                      ),
                    );
                  }}
                  placeholder="Item label"
                  className="menu-editor-input"
                />
                <select
                  value={item.actionType}
                  onChange={(e) => {
                    setItems(
                      items.map((i) =>
                        i.id === item.id
                          ? { ...i, actionType: e.target.value }
                          : i,
                      ),
                    );
                  }}
                  className="menu-editor-select"
                >
                  {ACTION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              <label className="menu-editor-danger-checkbox">
                <input
                  type="checkbox"
                  checked={item.danger || false}
                  onChange={() => handleToggleDanger(item.id)}
                />
                Danger
              </label>
              <button
                className="menu-editor-delete-btn"
                onClick={() => handleDeleteItem(item.id)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="menu-editor-add">
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="New item label"
            className="menu-editor-input"
          />
          <select
            value={newAction}
            onChange={(e) => setNewAction(e.target.value)}
            className="menu-editor-select"
          >
            {ACTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <button
            className="menu-editor-add-btn"
            onClick={handleAddItem}
            disabled={!newLabel.trim()}
          >
            + Add
          </button>
        </div>

        <div className="menu-editor-actions">
          <button className="menu-editor-btn cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="menu-editor-btn save" onClick={handleSave}>
            Save menu
          </button>
        </div>
      </div>
    </div>
  );
}
