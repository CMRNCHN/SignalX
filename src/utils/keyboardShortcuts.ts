/**
 * Global Keyboard Shortcuts Manager
 * Centralized management of application-wide keyboard shortcuts
 */

export interface KeyboardShortcut {
  id: string;
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
  description: string;
  handler: () => void;
  enabled?: boolean;
  category?: string;
}

class KeyboardShortcutsManager {
  private shortcuts: Map<string, KeyboardShortcut> = new Map();
  private enabled = true;

  constructor() {
    this.setupListener();
  }

  private setupListener(): void {
    document.addEventListener('keydown', (e) => {
      if (!this.enabled) return;

      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      this.shortcuts.forEach((shortcut) => {
        if (!shortcut.enabled) return;

        const matches =
          e.key.toLowerCase() === shortcut.key.toLowerCase() &&
          e.ctrlKey === (shortcut.ctrl || false) &&
          e.altKey === (shortcut.alt || false) &&
          e.shiftKey === (shortcut.shift || false) &&
          e.metaKey === (shortcut.meta || false);

        if (matches) {
          e.preventDefault();
          shortcut.handler();
        }
      });
    });
  }

  /**
   * Register a keyboard shortcut
   */
  public register(shortcut: KeyboardShortcut): void {
    if (this.shortcuts.has(shortcut.id)) {
      console.warn(`Shortcut with id "${shortcut.id}" already exists. Overwriting.`);
    }
    this.shortcuts.set(shortcut.id, { ...shortcut, enabled: shortcut.enabled ?? true });
  }

  /**
   * Unregister a keyboard shortcut
   */
  public unregister(id: string): void {
    this.shortcuts.delete(id);
  }

  /**
   * Enable a shortcut
   */
  public enable(id: string): void {
    const shortcut = this.shortcuts.get(id);
    if (shortcut) {
      shortcut.enabled = true;
    }
  }

  /**
   * Disable a shortcut
   */
  public disable(id: string): void {
    const shortcut = this.shortcuts.get(id);
    if (shortcut) {
      shortcut.enabled = false;
    }
  }

  /**
   * Enable all shortcuts
   */
  public enableAll(): void {
    this.enabled = true;
  }

  /**
   * Disable all shortcuts
   */
  public disableAll(): void {
    this.enabled = false;
  }

  /**
   * Get all registered shortcuts
   */
  public getAll(): KeyboardShortcut[] {
    return Array.from(this.shortcuts.values());
  }

  /**
   * Get shortcuts by category
   */
  public getByCategory(category: string): KeyboardShortcut[] {
    return this.getAll().filter((s) => s.category === category);
  }

  /**
   * Get shortcut by ID
   */
  public get(id: string): KeyboardShortcut | undefined {
    return this.shortcuts.get(id);
  }

  /**
   * Check if a shortcut exists
   */
  public has(id: string): boolean {
    return this.shortcuts.has(id);
  }

  /**
   * Format shortcut for display
   */
  public format(shortcut: KeyboardShortcut): string {
    const parts: string[] = [];

    // Use platform-appropriate modifier key symbols
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

    if (shortcut.ctrl) parts.push(isMac ? '⌃' : 'Ctrl');
    if (shortcut.alt) parts.push(isMac ? '⌥' : 'Alt');
    if (shortcut.shift) parts.push(isMac ? '⇧' : 'Shift');
    if (shortcut.meta) parts.push(isMac ? '⌘' : 'Win');

    parts.push(shortcut.key.toUpperCase());

    return parts.join(isMac ? '' : '+');
  }
}

// Singleton instance
let instance: KeyboardShortcutsManager | null = null;

/**
 * Get the global keyboard shortcuts manager instance
 */
export const getShortcutsManager = (): KeyboardShortcutsManager => {
  if (!instance) {
    instance = new KeyboardShortcutsManager();
  }
  return instance;
};

/**
 * Register a keyboard shortcut
 */
export const registerShortcut = (shortcut: KeyboardShortcut): void => {
  getShortcutsManager().register(shortcut);
};

/**
 * Unregister a keyboard shortcut
 */
export const unregisterShortcut = (id: string): void => {
  getShortcutsManager().unregister(id);
};

/**
 * React hook for registering keyboard shortcuts
 */
export const useKeyboardShortcut = (shortcut: Omit<KeyboardShortcut, 'enabled'>): void => {
  const manager = getShortcutsManager();

  React.useEffect(() => {
    manager.register({ ...shortcut, enabled: true });

    return () => {
      manager.unregister(shortcut.id);
    };
  }, [shortcut.id, shortcut.key, shortcut.ctrl, shortcut.alt, shortcut.shift, shortcut.meta]);
};

/**
 * React hook for using the shortcuts manager
 */
export const useShortcutsManager = () => {
  return React.useMemo(() => getShortcutsManager(), []);
};

/**
 * Default application shortcuts
 */
export const registerDefaultShortcuts = (handlers: {
  onNewMessage?: () => void;
  onSearch?: () => void;
  onSettings?: () => void;
  onHelp?: () => void;
  onRefresh?: () => void;
  onToggleSidebar?: () => void;
}): void => {
  const manager = getShortcutsManager();

  if (handlers.onNewMessage) {
    manager.register({
      id: 'new-message',
      key: 'n',
      meta: true,
      description: 'New message',
      handler: handlers.onNewMessage,
      category: 'General',
    });
  }

  if (handlers.onSearch) {
    manager.register({
      id: 'search',
      key: 'k',
      meta: true,
      description: 'Search',
      handler: handlers.onSearch,
      category: 'General',
    });
  }

  if (handlers.onSettings) {
    manager.register({
      id: 'settings',
      key: ',',
      meta: true,
      description: 'Settings',
      handler: handlers.onSettings,
      category: 'General',
    });
  }

  if (handlers.onHelp) {
    manager.register({
      id: 'help',
      key: '?',
      shift: true,
      description: 'Help',
      handler: handlers.onHelp,
      category: 'General',
    });
  }

  if (handlers.onRefresh) {
    manager.register({
      id: 'refresh',
      key: 'r',
      meta: true,
      description: 'Refresh',
      handler: handlers.onRefresh,
      category: 'General',
    });
  }

  if (handlers.onToggleSidebar) {
    manager.register({
      id: 'toggle-sidebar',
      key: 'b',
      meta: true,
      description: 'Toggle sidebar',
      handler: handlers.onToggleSidebar,
      category: 'View',
    });
  }
};

// Import React for hooks
import React from 'react';

/**
 * Keyboard shortcuts help component
 */
export const KeyboardShortcutsHelp: React.FC = () => {
  const manager = useShortcutsManager();
  const shortcuts = manager.getAll();

  // Group by category
  const categories = shortcuts.reduce((acc, shortcut) => {
    const category = shortcut.category || 'Other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(shortcut);
    return acc;
  }, {} as Record<string, KeyboardShortcut[]>);

  return (
    <div style={{ padding: '20px' }}>
      <h2 style={{ marginBottom: '24px', color: '#E0E0E0' }}>Keyboard Shortcuts</h2>

      {Object.entries(categories).map(([category, categoryShortcuts]) => (
        <div key={category} style={{ marginBottom: '32px' }}>
          <h3 style={{ marginBottom: '16px', color: '#9CA3AF', fontSize: '0.875rem', textTransform: 'uppercase' }}>
            {category}
          </h3>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {categoryShortcuts.map((shortcut) => (
                <tr key={shortcut.id} style={{ borderBottom: '1px solid #374151' }}>
                  <td style={{ padding: '12px 0', color: '#E0E0E0' }}>
                    {shortcut.description}
                  </td>
                  <td style={{ padding: '12px 0', textAlign: 'right' }}>
                    <kbd
                      style={{
                        backgroundColor: '#374151',
                        color: '#E0E0E0',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontFamily: 'monospace',
                        border: '1px solid #4b5563',
                      }}
                    >
                      {manager.format(shortcut)}
                    </kbd>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {shortcuts.length === 0 && (
        <p style={{ color: '#9CA3AF' }}>No keyboard shortcuts registered.</p>
      )}
    </div>
  );
};

