import { useEffect, useRef, RefObject } from 'react';
import { announce } from './announcer';

/**
 * Announce when a component mounts or updates
 */
export const useAnnounceOnMount = (message: string, deps: any[] = []) => {
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      announce(message);
    }
  }, deps);
};

/**
 * Announce loading states
 */
export const useAnnounceLoading = (
  isLoading: boolean,
  loadingMessage: string,
  loadedMessage: string
) => {
  const prevLoading = useRef(isLoading);

  useEffect(() => {
    if (prevLoading.current && !isLoading) {
      announce(loadedMessage);
    } else if (!prevLoading.current && isLoading) {
      announce(loadingMessage);
    }
    prevLoading.current = isLoading;
  }, [isLoading, loadingMessage, loadedMessage]);
};

/**
 * Announce when a count changes (e.g., search results, unread messages)
 */
export const useAnnounceCount = (
  count: number,
  singularLabel: string,
  pluralLabel: string,
  delay = 500
) => {
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = window.setTimeout(() => {
      const label = count === 1 ? singularLabel : pluralLabel;
      announce(`${count} ${label}`);
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [count, singularLabel, pluralLabel, delay]);
};

/**
 * Focus an element when a condition is met
 */
export const useFocusOnCondition = (
  ref: RefObject<HTMLElement>,
  condition: boolean,
  delay = 100
) => {
  useEffect(() => {
    if (condition && ref.current) {
      const timeout = setTimeout(() => {
        ref.current?.focus();
      }, delay);
      return () => clearTimeout(timeout);
    }
  }, [condition, ref, delay]);
};

/**
 * Trap focus within an element
 */
export const useFocusTrap = (ref: RefObject<HTMLElement>, isActive: boolean) => {
  useEffect(() => {
    if (!isActive || !ref.current) return;

    const element = ref.current;
    const focusableElements = element.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    element.addEventListener('keydown', handleTab);
    firstElement.focus();

    return () => {
      element.removeEventListener('keydown', handleTab);
    };
  }, [ref, isActive]);
};

/**
 * Manage roving tabindex for a list of items
 */
export const useRovingTabIndex = (
  containerRef: RefObject<HTMLElement>,
  itemSelector: string,
  orientation: 'vertical' | 'horizontal' = 'vertical'
) => {
  const currentIndex = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const items = Array.from(container.querySelectorAll<HTMLElement>(itemSelector));
    if (items.length === 0) return;

    // Set initial tabindex values
    items.forEach((item, index) => {
      item.tabIndex = index === currentIndex.current ? 0 : -1;
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (!target.matches(itemSelector)) return;

      let nextIndex = currentIndex.current;

      if (orientation === 'vertical') {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          nextIndex = Math.min(currentIndex.current + 1, items.length - 1);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          nextIndex = Math.max(currentIndex.current - 1, 0);
        }
      } else {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          nextIndex = Math.min(currentIndex.current + 1, items.length - 1);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          nextIndex = Math.max(currentIndex.current - 1, 0);
        }
      }

      if (e.key === 'Home') {
        e.preventDefault();
        nextIndex = 0;
      } else if (e.key === 'End') {
        e.preventDefault();
        nextIndex = items.length - 1;
      }

      if (nextIndex !== currentIndex.current) {
        items[currentIndex.current].tabIndex = -1;
        items[nextIndex].tabIndex = 0;
        items[nextIndex].focus();
        currentIndex.current = nextIndex;
      }
    };

    container.addEventListener('keydown', handleKeyDown);

    return () => {
      container.removeEventListener('keydown', handleKeyDown);
    };
  }, [containerRef, itemSelector, orientation]);

  return currentIndex.current;
};

/**
 * Handle Escape key to close/cancel
 */
export const useEscapeKey = (callback: () => void, isActive = true) => {
  useEffect(() => {
    if (!isActive) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        callback();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [callback, isActive]);
};

/**
 * Announce navigation changes
 */
export const useAnnounceNavigation = (location: string, deps: any[] = []) => {
  useEffect(() => {
    announce(`Navigated to ${location}`);
  }, deps);
};

/**
 * Focus first error in a form
 */
export const useFocusError = (errors: Record<string, any>) => {
  useEffect(() => {
    const errorKeys = Object.keys(errors);
    if (errorKeys.length > 0) {
      const firstErrorField = document.querySelector<HTMLElement>(
        `[name="${errorKeys[0]}"], [id="${errorKeys[0]}"]`
      );
      if (firstErrorField) {
        firstErrorField.focus();
        const errorMessage = errors[errorKeys[0]];
        announce(`Error: ${errorMessage}`, 100);
      }
    }
  }, [errors]);
};

/**
 * Announce when items are added/removed from a list
 */
export const useAnnounceListChanges = (items: any[], itemLabel: string, announceBoth = false) => {
  const prevCount = useRef(items.length);

  useEffect(() => {
    const currentCount = items.length;
    const diff = currentCount - prevCount.current;

    if (diff > 0 && announceBoth) {
      announce(`${diff} ${itemLabel}${diff !== 1 ? 's' : ''} added`);
    } else if (diff < 0 && announceBoth) {
      announce(`${Math.abs(diff)} ${itemLabel}${diff !== -1 ? 's' : ''} removed`);
    } else if (diff !== 0) {
      const label = currentCount === 1 ? itemLabel : `${itemLabel}s`;
      announce(`${currentCount} ${label}`);
    }

    prevCount.current = currentCount;
  }, [items.length, itemLabel, announceBoth]);
};
