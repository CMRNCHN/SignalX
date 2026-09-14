import { useEffect, useRef } from "react";

type Layer = { id: number; dismiss: () => void };

let nextId = 1;
const layers: Layer[] = [];

export function pushEscapeLayer(dismiss: () => void): number {
  const id = nextId++;
  layers.push({ id, dismiss });
  return id;
}

export function popEscapeLayer(id: number): void {
  const i = layers.findIndex((l) => l.id === id);
  if (i >= 0) layers.splice(i, 1);
}

/** Close the most recently opened overlay. Returns true if something closed. */
export function dismissTopEscapeLayer(): boolean {
  const top = layers[layers.length - 1];
  if (!top) return false;
  top.dismiss();
  return true;
}

/** Register a dismiss callback while `active`. Later registrations sit on top. */
export function useEscapeLayer(active: boolean, dismiss: () => void): void {
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  useEffect(() => {
    if (!active) return;
    const id = pushEscapeLayer(() => dismissRef.current());
    return () => popEscapeLayer(id);
  }, [active]);
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return target.closest("[contenteditable='true']") != null;
}
