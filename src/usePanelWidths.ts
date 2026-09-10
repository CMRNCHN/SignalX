import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

/* Column widths the operator can drag.
 *
 * The shell's `grid-template-columns` reads `--w-*`, and each of those falls
 * back through a `--u-*` "user" variable (see `.shell` in styles.css). We only
 * ever write the `--u-*` layer, which is why the responsive breakpoints can
 * still clobber `--w-*` outright — a dragged rail must not survive the
 * collapse to the 72px icon rail below 900px. */

export type PanelColumn = "rail" | "list" | "listPeople" | "aside";

export type PanelLayout = {
  /** Which list column is on screen, if any. Wide panels span both tracks
   *  and so have no list edge to drag. */
  listKey: "list" | "listPeople" | null;
  aside: boolean;
};

type Widths = Partial<Record<PanelColumn, number>>;

const STORAGE_KEY = "signalx.panelWidths.v1";

const CSS_VAR: Record<PanelColumn, string> = {
  rail: "--u-rail",
  list: "--u-list",
  listPeople: "--u-list-people",
  aside: "--u-aside",
};

/** Mirrors the fallbacks in `.shell` / `.shell-people`. Keep the two in sync:
 *  CSS owns the unset case, this owns the arithmetic during a drag. */
const DEFAULTS: Record<PanelColumn, number> = {
  rail: 220,
  list: 300,
  listPeople: 400,
  aside: 300,
};

/** Per-column travel. The floor keeps a column legible; the ceiling stops one
 *  column from being dragged out to absurdity on a wide display. */
const LIMITS: Record<PanelColumn, [number, number]> = {
  rail: [180, 400],
  list: [240, 600],
  listPeople: [320, 700],
  aside: [240, 520],
};

/** The flexible column has no track of its own to defend — it absorbs whatever
 *  the fixed ones leave. Every drag is clamped to keep it at least this wide,
 *  so the conversation or detail pane can never be squeezed to nothing. */
const MIN_FLEX = 380;

function readStored(): Widths {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Widths = {};
    for (const key of Object.keys(CSS_VAR) as PanelColumn[]) {
      const v = (parsed as Record<string, unknown>)[key];
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      const [min, max] = LIMITS[key];
      out[key] = Math.round(Math.min(max, Math.max(min, v)));
    }
    return out;
  } catch {
    // A private window or cleared site data is not an error worth surfacing —
    // the defaults are perfectly usable.
    return {};
  }
}

function write(widths: Widths): Widths {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widths));
  } catch {
    /* ignore — the layout still works for this session */
  }
  return widths;
}

const widthOf = (column: PanelColumn, widths: Widths) => widths[column] ?? DEFAULTS[column];

/* Every column whose track consumes width right now — which is not the same as
 * every column with a drag handle. The shell template always carries a list
 * track; a wide panel simply spans it rather than rendering into it, so it
 * still has to be counted against the budget. Leaving it out let the rail be
 * dragged to 400px on a 1024px window and squeeze the pane beside it to 303px. */
const activeColumns = (layout: PanelLayout): PanelColumn[] => [
  "rail",
  layout.listKey ?? "list",
  ...(layout.aside ? (["aside"] as const) : []),
];

/* Widths dragged on a wide display would starve the flexible column on a
 * narrow one — the window is resizable down to 1024, and the app can reopen on
 * a different screen. So the stored value is what the operator asked for, and
 * this is what actually fits: columns give back their headroom above the floor,
 * proportionally, until the flexible column has room again. Nothing is written
 * back, so widening the window restores the layout they chose. */
function fitToViewport(widths: Widths, layout: PanelLayout, viewport: number): Widths {
  const active = activeColumns(layout);
  const asked = active.reduce((sum, c) => sum + widthOf(c, widths), 0);
  const budget = viewport - MIN_FLEX;
  if (asked <= budget) return widths;

  const headroom = active.reduce((sum, c) => sum + (widthOf(c, widths) - LIMITS[c][0]), 0);
  const overshoot = asked - budget;
  const out: Widths = { ...widths };
  for (const c of active) {
    const floor = LIMITS[c][0];
    const own = widthOf(c, widths) - floor;
    // Everything already at its floor stays there; the flexible column takes
    // the remainder rather than pushing a column below what it can show.
    const give = headroom > 0 ? Math.round((own / headroom) * overshoot) : 0;
    out[c] = Math.max(floor, widthOf(c, widths) - give);
  }
  return out;
}

export function usePanelWidths(layout: PanelLayout) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [widths, setWidths] = useState<Widths>(readStored);
  const [viewport, setViewport] = useState(() =>
    typeof window === "undefined" ? 1440 : window.innerWidth,
  );

  useEffect(() => {
    const onResize = () => setViewport(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const effective = fitToViewport(widths, layout, viewport);

  const styleVars: CSSProperties = {};
  for (const key of Object.keys(CSS_VAR) as PanelColumn[]) {
    const fitted = effective[key];
    // Emit whenever the value on screen differs from the stylesheet's own
    // fallback — not only when the operator dragged this column. An untouched
    // column still has to give up width when a dragged neighbour overruns the
    // budget, and without this the fit computed that reduction and threw it
    // away, leaving the flexible column below its floor.
    if (fitted == null || (widths[key] == null && fitted === DEFAULTS[key])) continue;
    (styleVars as Record<string, string>)[CSS_VAR[key]] = `${fitted}px`;
  }

  const beginDrag = useCallback(
    (column: PanelColumn, event: ReactPointerEvent<HTMLElement>) => {
      const shell = shellRef.current;
      if (!shell || event.button !== 0) return;
      event.preventDefault();

      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);

      const startX = event.clientX;
      // Start from what is on screen, not what is stored, or a handle that the
      // viewport fit has already pulled in would jump on first movement.
      const startWidth = widthOf(column, effective);
      const [min, ceiling] = LIMITS[column];
      const otherFixed = activeColumns(layout)
        .filter((c) => c !== column)
        .reduce((sum, c) => sum + widthOf(c, effective), 0);
      const max = Math.max(min, Math.min(ceiling, shell.clientWidth - otherFixed - MIN_FLEX));

      let latest = startWidth;
      // Paint straight to the element during the drag. Routing every pointermove
      // through React state would re-render the whole app for one CSS variable.
      const onMove = (ev: PointerEvent) => {
        const delta = column === "aside" ? startX - ev.clientX : ev.clientX - startX;
        latest = Math.round(Math.min(max, Math.max(min, startWidth + delta)));
        shell.style.setProperty(CSS_VAR[column], `${latest}px`);
      };
      const onEnd = () => {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onEnd);
        handle.removeEventListener("pointercancel", onEnd);
        document.body.classList.remove("is-resizing");
        setWidths((prev) => write({ ...prev, [column]: latest }));
      };

      document.body.classList.add("is-resizing");
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onEnd);
      handle.addEventListener("pointercancel", onEnd);
    },
    [effective, layout],
  );

  /** Double-click a handle to hand the column back to its default. */
  const resetColumn = useCallback((column: PanelColumn) => {
    shellRef.current?.style.removeProperty(CSS_VAR[column]);
    setWidths((prev) => {
      const next = { ...prev };
      delete next[column];
      return write(next);
    });
  }, []);

  /** Keyboard parity: the handle is focusable, so arrows nudge it. */
  const nudge = useCallback(
    (column: PanelColumn, delta: number) => {
      const [min, ceiling] = LIMITS[column];
      const otherFixed = activeColumns(layout)
        .filter((c) => c !== column)
        .reduce((sum, c) => sum + widthOf(c, effective), 0);
      const max = Math.max(min, Math.min(ceiling, viewport - otherFixed - MIN_FLEX));
      const next = Math.round(Math.min(max, Math.max(min, widthOf(column, effective) + delta)));
      setWidths((prev) => write({ ...prev, [column]: next }));
    },
    [effective, layout, viewport],
  );

  return { shellRef, styleVars, beginDrag, resetColumn, nudge };
}
