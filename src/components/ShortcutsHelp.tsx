import { IconX } from "../navIcons";
import { useEscapeLayer } from "../overlayEscape";
import { NAV_SHORTCUTS } from "../useGlobalShortcuts";

const MOD =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform)
    ? "⌘"
    : "Ctrl";

const ROWS: { keys: string; action: string }[] = [
  { keys: `${MOD}K`, action: "Focus search" },
  ...NAV_SHORTCUTS.map((s) => ({ keys: `${MOD}${s.digit}`, action: s.label })),
  { keys: "?", action: "Keyboard shortcuts" },
  { keys: "Esc", action: "Close menu or composer" },
];

export function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEscapeLayer(open, onClose);
  if (!open) return null;

  return (
    <div className="shortcuts-scrim" onClick={onClose} role="presentation">
      <div
        className="shortcuts-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shortcuts-head">
          <h2 id="shortcuts-title">Keyboard shortcuts</h2>
          <button type="button" className="icon-btn tiny" onClick={onClose} aria-label="Close">
            <IconX />
          </button>
        </div>
        <dl className="shortcuts-list">
          {ROWS.map((row) => (
            <div className="shortcuts-row" key={row.keys}>
              <dt>
                <kbd>{row.keys}</kbd>
              </dt>
              <dd>{row.action}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
