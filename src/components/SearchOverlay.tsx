import { ReactNode, useEffect, useRef } from "react";

interface SearchOverlayProps {
  isOpen: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  onClose: () => void;
  children: ReactNode;
}

export function SearchOverlay({
  isOpen,
  query,
  onQueryChange,
  onClose,
  children,
}: SearchOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="search-overlay" onClick={onClose}>
      <div className="search-overlay-modal" onClick={(e) => e.stopPropagation()}>
        <div className="search-overlay-header">
          <input
            ref={inputRef}
            type="text"
            className="search-overlay-input"
            placeholder="Search messages, people, orders, catalog..."
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            aria-label="Search"
          />
          <button
            className="search-overlay-close"
            onClick={onClose}
            aria-label="Close search"
          >
            ✕
          </button>
        </div>
        <div className="search-overlay-content">{children}</div>
      </div>
    </div>
  );
}
