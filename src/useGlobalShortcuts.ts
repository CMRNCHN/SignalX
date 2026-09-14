import { useEffect } from "react";
import { dismissTopEscapeLayer, isTypingTarget } from "./overlayEscape";

export type ShortcutPanel = "threads" | "people" | "catalog" | "orders" | "sales" | "settings";

export type NavShortcut = { digit: string; panel: ShortcutPanel; label: string };

/** ⌘/Ctrl+1..6 — the six primary nav destinations, in rail order. */
export const NAV_SHORTCUTS: NavShortcut[] = [
  { digit: "1", panel: "threads", label: "Messages" },
  { digit: "2", panel: "people", label: "People" },
  { digit: "3", panel: "catalog", label: "Catalog" },
  { digit: "4", panel: "orders", label: "Orders" },
  { digit: "5", panel: "sales", label: "Sales" },
  { digit: "6", panel: "settings", label: "Settings" },
];

type Args = {
  onSearch: () => void;
  onNav: (panel: ShortcutPanel) => void;
  onToggleHelp: () => void;
};

export function useGlobalShortcuts({ onSearch, onNav, onToggleHelp }: Args): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;

      if (e.key === "Escape") {
        if (dismissTopEscapeLayer()) e.preventDefault();
        return;
      }

      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onSearch();
        return;
      }

      if (mod && !e.altKey && !e.shiftKey) {
        const hit = NAV_SHORTCUTS.find((s) => s.digit === e.key);
        if (hit) {
          e.preventDefault();
          onNav(hit.panel);
        }
        return;
      }

      if (isTypingTarget(e.target)) return;
      if (mod || e.altKey) return;

      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        onToggleHelp();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onSearch, onNav, onToggleHelp]);
}
