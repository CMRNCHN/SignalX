import React, { useState, useRef, useEffect } from 'react';
import { Keys, handleArrowNavigation } from '../utils/keyboard';
import { useEscapeKey } from '../utils/a11yHooks';

export interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  disabled?: boolean;
  separator?: boolean;
  onClick?: () => void;
  shortcut?: string;
}

interface AccessibleMenuProps {
  trigger: React.ReactElement;
  items: MenuItem[];
  align?: 'left' | 'right';
  className?: string;
}

/**
 * Accessible dropdown menu with keyboard navigation
 * Follows WAI-ARIA Menu Button Pattern
 */
export const AccessibleMenu: React.FC<AccessibleMenuProps> = ({
  trigger,
  items,
  align = 'left',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);

  // Close menu on Escape
  useEscapeKey(() => {
    if (isOpen) {
      setIsOpen(false);
      triggerRef.current?.focus();
    }
  }, isOpen);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Focus first item when menu opens
  useEffect(() => {
    if (isOpen) {
      setFocusedIndex(0);
      // Focus first non-disabled, non-separator item
      const firstEnabledIndex = items.findIndex(item => !item.disabled && !item.separator);
      if (firstEnabledIndex !== -1) {
        setFocusedIndex(firstEnabledIndex);
      }
    }
  }, [isOpen, items]);

  const handleTriggerClick = () => {
    setIsOpen(!isOpen);
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === Keys.ARROW_DOWN || e.key === Keys.ARROW_UP || e.key === Keys.ENTER || e.key === Keys.SPACE) {
      e.preventDefault();
      setIsOpen(true);
    }
  };

  const handleMenuKeyDown = (e: React.KeyboardEvent) => {
    const enabledItems = items.filter(item => !item.disabled && !item.separator);
    const currentEnabledIndex = enabledItems.findIndex(item => item.id === items[focusedIndex]?.id);

    if (e.key === Keys.ARROW_DOWN) {
      e.preventDefault();
      const nextIndex = currentEnabledIndex < enabledItems.length - 1 ? currentEnabledIndex + 1 : 0;
      const nextItem = enabledItems[nextIndex];
      const nextItemIndex = items.findIndex(item => item.id === nextItem.id);
      setFocusedIndex(nextItemIndex);
    } else if (e.key === Keys.ARROW_UP) {
      e.preventDefault();
      const prevIndex = currentEnabledIndex > 0 ? currentEnabledIndex - 1 : enabledItems.length - 1;
      const prevItem = enabledItems[prevIndex];
      const prevItemIndex = items.findIndex(item => item.id === prevItem.id);
      setFocusedIndex(prevItemIndex);
    } else if (e.key === Keys.HOME) {
      e.preventDefault();
      const firstItem = enabledItems[0];
      const firstItemIndex = items.findIndex(item => item.id === firstItem.id);
      setFocusedIndex(firstItemIndex);
    } else if (e.key === Keys.END) {
      e.preventDefault();
      const lastItem = enabledItems[enabledItems.length - 1];
      const lastItemIndex = items.findIndex(item => item.id === lastItem.id);
      setFocusedIndex(lastItemIndex);
    } else if (e.key === Keys.ENTER || e.key === Keys.SPACE) {
      e.preventDefault();
      const item = items[focusedIndex];
      if (item && !item.disabled && !item.separator) {
        item.onClick?.();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    } else if (e.key === Keys.TAB) {
      setIsOpen(false);
    }
  };

  const handleItemClick = (item: MenuItem) => {
    if (!item.disabled && !item.separator) {
      item.onClick?.();
      setIsOpen(false);
      triggerRef.current?.focus();
    }
  };

  // Clone trigger and add props
  const triggerElement = React.cloneElement(trigger, {
    ref: triggerRef,
    onClick: handleTriggerClick,
    onKeyDown: handleTriggerKeyDown,
    'aria-haspopup': 'menu',
    'aria-expanded': isOpen,
  });

  return (
    <div className={`accessible-menu ${className}`} style={{ position: 'relative', display: 'inline-block' }}>
      {triggerElement}

      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          onKeyDown={handleMenuKeyDown}
          tabIndex={-1}
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            [align]: 0,
            backgroundColor: '#1A1C1F',
            border: '1px solid #374151',
            borderRadius: '8px',
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
            minWidth: '200px',
            padding: '4px',
            zIndex: 1000,
            outline: 'none',
          }}
        >
          {items.map((item, index) => {
            if (item.separator) {
              return (
                <div
                  key={item.id}
                  role="separator"
                  style={{
                    height: '1px',
                    backgroundColor: '#374151',
                    margin: '4px 0',
                  }}
                />
              );
            }

            const isFocused = index === focusedIndex;

            return (
              <div
                key={item.id}
                role="menuitem"
                tabIndex={-1}
                aria-disabled={item.disabled}
                onClick={() => handleItemClick(item)}
                onMouseEnter={() => !item.disabled && setFocusedIndex(index)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  cursor: item.disabled ? 'not-allowed' : 'pointer',
                  backgroundColor: isFocused && !item.disabled ? '#374151' : 'transparent',
                  color: item.disabled ? '#6B7280' : '#E0E0E0',
                  fontSize: '0.875rem',
                  transition: 'background-color 0.1s',
                  outline: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {item.icon && <span>{item.icon}</span>}
                  <span>{item.label}</span>
                </div>
                {item.shortcut && (
                  <span
                    style={{
                      fontSize: '0.75rem',
                      color: '#9CA3AF',
                      fontFamily: 'monospace',
                    }}
                  >
                    {item.shortcut}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// Example usage
export const MenuExample: React.FC = () => {
  const menuItems: MenuItem[] = [
    { id: '1', label: 'New File', icon: '📄', shortcut: '⌘N', onClick: () => console.log('New file') },
    { id: '2', label: 'Open', icon: '📂', shortcut: '⌘O', onClick: () => console.log('Open') },
    { id: 'sep1', label: '', separator: true },
    { id: '3', label: 'Save', icon: '💾', shortcut: '⌘S', onClick: () => console.log('Save') },
    { id: '4', label: 'Save As...', icon: '💾', shortcut: '⇧⌘S', onClick: () => console.log('Save as') },
    { id: 'sep2', label: '', separator: true },
    { id: '5', label: 'Export', icon: '📤', onClick: () => console.log('Export') },
    { id: '6', label: 'Print', icon: '🖨️', shortcut: '⌘P', disabled: true, onClick: () => console.log('Print') },
  ];

  return (
    <AccessibleMenu
      trigger={
        <button
          style={{
            padding: '8px 16px',
            backgroundColor: '#374151',
            color: '#E0E0E0',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          File ▼
        </button>
      }
      items={menuItems}
    />
  );
};

