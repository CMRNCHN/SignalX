import React, { useEffect, useRef } from "react";
import { Input, Button } from "./primitives";

export function NewMessageModal({
  open,
  value,
  onChange,
  onCancel,
  onCreate,
}: {
  open: boolean;
  value: string;
  onChange: (v: string) => void;
  onCancel: () => void;
  onCreate: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 2600,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        style={{
          width: "min(520px, 96vw)",
          background: "#0b0d10",
          border: "1px solid #1f2937",
          borderRadius: 16,
          boxShadow: "0 30px 90px rgba(0,0,0,0.6)",
          padding: 14,
        }}
      >
        <div style={{ fontWeight: 900, marginBottom: 10 }}>New message</div>
        <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 8 }}>
          Enter a phone number (E.164 recommended, e.g. +12025550123).
        </div>
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="+1202…"
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
            if (e.key === "Enter") onCreate();
          }}
          fullWidth
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={onCreate}>
            Start
          </Button>
        </div>
      </div>
    </div>
  );
}


