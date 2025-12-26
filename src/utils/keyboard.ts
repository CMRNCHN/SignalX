// Keyboard navigation utilities for SignalX

/**
 * Common keyboard codes
 */
export const Keys = {
  ENTER: 'Enter',
  SPACE: ' ',
  ESCAPE: 'Escape',
  TAB: 'Tab',
  ARROW_UP: 'ArrowUp',
  ARROW_DOWN: 'ArrowDown',
  ARROW_LEFT: 'ArrowLeft',
  ARROW_RIGHT: 'ArrowRight',
  HOME: 'Home',
  END: 'End',
  PAGE_UP: 'PageUp',
  PAGE_DOWN: 'PageDown',
} as const;

/**
 * Check if an element is focusable
 */
export const isFocusable = (element: HTMLElement): boolean => {
  if (element.tabIndex < 0) return false;
  
  const focusableSelectors = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ];

  return focusableSelectors.some(selector => element.matches(selector));
};

/**
 * Get all focusable elements within a container
 */
export const getFocusableElements = (container: HTMLElement): HTMLElement[] => {
  const focusableSelectors = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelectors)).filter(
    element => {
      // Filter out invisible elements
      const style = window.getComputedStyle(element);
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        element.offsetParent !== null
      );
    }
  );
};

/**
 * Focus the first focusable element in a container
 */
export const focusFirstElement = (container: HTMLElement): boolean => {
  const focusableElements = getFocusableElements(container);
  if (focusableElements.length > 0) {
    focusableElements[0].focus();
    return true;
  }
  return false;
};

/**
 * Focus the last focusable element in a container
 */
export const focusLastElement = (container: HTMLElement): boolean => {
  const focusableElements = getFocusableElements(container);
  if (focusableElements.length > 0) {
    focusableElements[focusableElements.length - 1].focus();
    return true;
  }
  return false;
};

/**
 * Handle arrow key navigation in a list
 */
export const handleArrowNavigation = (
  event: KeyboardEvent,
  container: HTMLElement,
  orientation: 'vertical' | 'horizontal' = 'vertical'
): void => {
  const { key } = event;
  const focusableElements = getFocusableElements(container);
  const currentIndex = focusableElements.findIndex(el => el === document.activeElement);

  if (currentIndex === -1) return;

  let nextIndex = currentIndex;

  if (orientation === 'vertical') {
    if (key === Keys.ARROW_UP) {
      nextIndex = currentIndex > 0 ? currentIndex - 1 : focusableElements.length - 1;
      event.preventDefault();
    } else if (key === Keys.ARROW_DOWN) {
      nextIndex = currentIndex < focusableElements.length - 1 ? currentIndex + 1 : 0;
      event.preventDefault();
    }
  } else {
    if (key === Keys.ARROW_LEFT) {
      nextIndex = currentIndex > 0 ? currentIndex - 1 : focusableElements.length - 1;
      event.preventDefault();
    } else if (key === Keys.ARROW_RIGHT) {
      nextIndex = currentIndex < focusableElements.length - 1 ? currentIndex + 1 : 0;
      event.preventDefault();
    }
  }

  if (key === Keys.HOME) {
    nextIndex = 0;
    event.preventDefault();
  } else if (key === Keys.END) {
    nextIndex = focusableElements.length - 1;
    event.preventDefault();
  }

  focusableElements[nextIndex]?.focus();
};

/**
 * Create a roving tabindex manager for a list of items
 * This allows arrow key navigation while maintaining a single tab stop
 */
export class RovingTabIndexManager {
  private container: HTMLElement;
  private items: HTMLElement[];
  private currentIndex: number;

  constructor(container: HTMLElement, initialIndex = 0) {
    this.container = container;
    this.items = getFocusableElements(container);
    this.currentIndex = initialIndex;
    this.updateTabIndexes();
  }

  private updateTabIndexes(): void {
    this.items.forEach((item, index) => {
      item.tabIndex = index === this.currentIndex ? 0 : -1;
    });
  }

  public focus(): void {
    this.items[this.currentIndex]?.focus();
  }

  public setIndex(index: number): void {
    if (index >= 0 && index < this.items.length) {
      this.currentIndex = index;
      this.updateTabIndexes();
    }
  }

  public next(): void {
    this.currentIndex = (this.currentIndex + 1) % this.items.length;
    this.updateTabIndexes();
    this.focus();
  }

  public previous(): void {
    this.currentIndex = (this.currentIndex - 1 + this.items.length) % this.items.length;
    this.updateTabIndexes();
    this.focus();
  }

  public first(): void {
    this.currentIndex = 0;
    this.updateTabIndexes();
    this.focus();
  }

  public last(): void {
    this.currentIndex = this.items.length - 1;
    this.updateTabIndexes();
    this.focus();
  }

  public refresh(): void {
    this.items = getFocusableElements(this.container);
    if (this.currentIndex >= this.items.length) {
      this.currentIndex = Math.max(0, this.items.length - 1);
    }
    this.updateTabIndexes();
  }
}

/**
 * Hook for managing keyboard shortcuts
 */
export const createKeyboardShortcut = (
  key: string,
  modifiers: {
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
    meta?: boolean;
  } = {}
) => {
  return (event: KeyboardEvent): boolean => {
    return (
      event.key === key &&
      event.ctrlKey === (modifiers.ctrl ?? false) &&
      event.altKey === (modifiers.alt ?? false) &&
      event.shiftKey === (modifiers.shift ?? false) &&
      event.metaKey === (modifiers.meta ?? false)
    );
  };
};

/**
 * Trap focus within a container
 */
export const trapFocus = (container: HTMLElement, event: KeyboardEvent): void => {
  if (event.key !== Keys.TAB) return;

  const focusableElements = getFocusableElements(container);
  if (focusableElements.length === 0) return;

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  if (event.shiftKey && document.activeElement === firstElement) {
    event.preventDefault();
    lastElement.focus();
  } else if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault();
    firstElement.focus();
  }
};

/**
 * Check if event is an activation key (Enter or Space)
 */
export const isActivationKey = (event: KeyboardEvent): boolean => {
  return event.key === Keys.ENTER || event.key === Keys.SPACE;
};

/**
 * Handle click with keyboard support
 */
export const handleClickWithKeyboard = (
  event: KeyboardEvent | React.KeyboardEvent,
  callback: () => void
): void => {
  if (isActivationKey(event as KeyboardEvent)) {
    event.preventDefault();
    callback();
  }
};

