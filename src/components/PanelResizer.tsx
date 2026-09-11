import type { PanelColumn } from "../usePanelWidths";

type Props = {
  column: PanelColumn;
  /** Which seam this sits on — drives the CSS that positions it. */
  seam: "rail" | "list" | "aside";
  label: string;
  onBegin: (column: PanelColumn, e: React.PointerEvent<HTMLElement>) => void;
  onReset: (column: PanelColumn) => void;
  onNudge: (column: PanelColumn, delta: number) => void;
};

/* A drag handle straddling a column seam.
 *
 * It lives as a child of `.shell` rather than inside the column it resizes:
 * the columns clip their overflow, and positioning from the same `--w-*`
 * variables the grid uses means the handle cannot drift out of alignment with
 * the edge it controls. */
export function PanelResizer({ column, seam, label, onBegin, onReset, onNudge }: Props) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      tabIndex={0}
      title={`${label} — drag, or double-click to reset`}
      className={`shell-resizer at-${seam}`}
      onPointerDown={(e) => onBegin(column, e)}
      onDoubleClick={() => onReset(column)}
      onKeyDown={(e) => {
        // Arrows move the seam itself, so left always means "the seam moves
        // left", regardless of which side of the window the column sits on.
        const step = e.shiftKey ? 32 : 8;
        const wider = column === "aside" ? "ArrowLeft" : "ArrowRight";
        const narrower = column === "aside" ? "ArrowRight" : "ArrowLeft";
        if (e.key === wider) onNudge(column, step);
        else if (e.key === narrower) onNudge(column, -step);
        else if (e.key === "Enter" || e.key === " ") onReset(column);
        else return;
        e.preventDefault();
      }}
    >
      <span className="shell-resizer-grip" aria-hidden />
    </div>
  );
}
