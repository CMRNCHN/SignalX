import { useEffect, useId, useRef, useState } from "react";
import { IconInfo } from "../navIcons";

/** Explains a derived value in place. These rows come from heuristics rather
 *  than something the operator typed, so the rule that produced them should be
 *  readable without leaving the screen. */
export function WhyTip({ why, label = "Why this appears" }: { why: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span className="whytip" ref={wrap}>
      <button
        type="button"
        className={open ? "whytip-btn open" : "whytip-btn"}
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <IconInfo />
      </button>
      {open && (
        <span className="whytip-pop" id={id} role="note">
          {why}
        </span>
      )}
    </span>
  );
}
