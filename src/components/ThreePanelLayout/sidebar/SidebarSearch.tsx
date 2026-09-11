import { useState } from "react";
import { IconX } from "../../../navIcons";

interface SidebarSearchProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
}

export function SidebarSearch({ value, onChange, onSubmit }: SidebarSearchProps) {
  return (
    <div className="sidebar-search">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSubmit?.()}
        placeholder="🔍 Search…"
        aria-label="Search sidebar"
      />
      {value && (
        <button
          type="button"
          className="icon-btn tiny"
          onClick={() => onChange("")}
          aria-label="Clear search"
        >
          <IconX />
        </button>
      )}
    </div>
  );
}
