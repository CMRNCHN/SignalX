/**
 * Accessibility Performance Monitor
 * Tracks and reports accessibility-related performance metrics
 */

interface A11yMetric {
  name: string;
  value: number;
  timestamp: number;
  metadata?: Record<string, any>;
}

interface A11yPerformanceReport {
  focusShiftCount: number;
  announcementCount: number;
  modalOpenCount: number;
  averageFocusShiftTime: number;
  slowFocusShifts: A11yMetric[];
  totalAnnouncements: number;
  metrics: A11yMetric[];
}

class AccessibilityPerformanceMonitor {
  private metrics: A11yMetric[] = [];
  private enabled = process.env.NODE_ENV === 'development';
  private focusShiftStartTime: number | null = null;
  private observers: Map<string, PerformanceObserver> = new Map();

  constructor() {
    if (this.enabled) {
      this.setupFocusTracking();
      this.setupMutationTracking();
    }
  }

  /**
   * Track focus shifts
   */
  private setupFocusTracking(): void {
    let previousFocus: Element | null = null;

    document.addEventListener('focusin', e => {
      const currentFocus = e.target as Element;

      if (previousFocus && previousFocus !== currentFocus) {
        const shiftTime = this.focusShiftStartTime
          ? performance.now() - this.focusShiftStartTime
          : 0;

        this.recordMetric('focus-shift', shiftTime, {
          from: this.getElementDescription(previousFocus),
          to: this.getElementDescription(currentFocus),
        });

        // Warn about slow focus shifts
        if (shiftTime > 100) {
          console.warn(`Slow focus shift detected (${shiftTime.toFixed(2)}ms)`, {
            from: previousFocus,
            to: currentFocus,
          });
        }
      }

      previousFocus = currentFocus;
      this.focusShiftStartTime = performance.now();
    });
  }

  /**
   * Track DOM mutations that might affect accessibility
   */
  private setupMutationTracking(): void {
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        // Track ARIA attribute changes
        if (mutation.type === 'attributes' && mutation.attributeName?.startsWith('aria-')) {
          this.recordMetric('aria-change', 1, {
            element: this.getElementDescription(mutation.target as Element),
            attribute: mutation.attributeName,
          });
        }

        // Track live region updates
        if (mutation.type === 'childList') {
          const target = mutation.target as Element;
          const ariaLive = target.getAttribute('aria-live');
          if (ariaLive) {
            this.recordMetric('live-region-update', 1, {
              element: this.getElementDescription(target),
              priority: ariaLive,
            });
          }
        }
      });
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: [
        'aria-live',
        'aria-expanded',
        'aria-selected',
        'aria-checked',
        'aria-hidden',
      ],
      childList: true,
      subtree: true,
    });
  }

  /**
   * Record a metric
   */
  private recordMetric(name: string, value: number, metadata?: Record<string, any>): void {
    this.metrics.push({
      name,
      value,
      timestamp: Date.now(),
      metadata,
    });

    // Keep only last 1000 metrics
    if (this.metrics.length > 1000) {
      this.metrics.shift();
    }
  }

  /**
   * Get element description for logging
   */
  private getElementDescription(element: Element): string {
    const tag = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : '';
    const classes = element.className ? `.${element.className.split(' ').join('.')}` : '';
    return `${tag}${id}${classes}`;
  }

  /**
   * Track modal open
   */
  public trackModalOpen(modalId: string): void {
    this.recordMetric('modal-open', 1, { modalId });
  }

  /**
   * Track announcement
   */
  public trackAnnouncement(message: string, type: 'polite' | 'assertive'): void {
    this.recordMetric('announcement', 1, { message, type });
  }

  /**
   * Track keyboard shortcut usage
   */
  public trackShortcut(shortcutId: string): void {
    this.recordMetric('shortcut-used', 1, { shortcutId });
  }

  /**
   * Generate performance report
   */
  public generateReport(): A11yPerformanceReport {
    const focusShifts = this.metrics.filter(m => m.name === 'focus-shift');
    const announcements = this.metrics.filter(m => m.name === 'announcement');
    const modals = this.metrics.filter(m => m.name === 'modal-open');

    const avgFocusShift =
      focusShifts.length > 0
        ? focusShifts.reduce((sum, m) => sum + m.value, 0) / focusShifts.length
        : 0;

    const slowFocusShifts = focusShifts.filter(m => m.value > 100);

    return {
      focusShiftCount: focusShifts.length,
      announcementCount: announcements.length,
      modalOpenCount: modals.length,
      averageFocusShiftTime: avgFocusShift,
      slowFocusShifts,
      totalAnnouncements: announcements.length,
      metrics: this.metrics,
    };
  }

  /**
   * Log performance report to console
   */
  public logReport(): void {
    const report = this.generateReport();

    console.group(
      '%c♿ Accessibility Performance Report',
      'font-weight: bold; font-size: 14px; color: #3b82f6'
    );

    console.log(`Focus Shifts: ${report.focusShiftCount}`);
    console.log(`Average Focus Shift Time: ${report.averageFocusShiftTime.toFixed(2)}ms`);

    if (report.slowFocusShifts.length > 0) {
      console.warn(`Slow Focus Shifts: ${report.slowFocusShifts.length}`);
      report.slowFocusShifts.forEach(metric => {
        console.log(`  ${metric.value.toFixed(2)}ms:`, metric.metadata);
      });
    }

    console.log(`Announcements: ${report.announcementCount}`);
    console.log(`Modal Opens: ${report.modalOpenCount}`);

    console.groupEnd();
  }

  /**
   * Clear metrics
   */
  public clear(): void {
    this.metrics = [];
  }

  /**
   * Enable monitoring
   */
  public enable(): void {
    this.enabled = true;
  }

  /**
   * Disable monitoring
   */
  public disable(): void {
    this.enabled = false;
  }
}

// Singleton instance
let monitorInstance: AccessibilityPerformanceMonitor | null = null;

/**
 * Get the performance monitor instance
 */
export const getA11yMonitor = (): AccessibilityPerformanceMonitor => {
  if (!monitorInstance) {
    monitorInstance = new AccessibilityPerformanceMonitor();
  }
  return monitorInstance;
};

/**
 * Track modal open
 */
export const trackModalOpen = (modalId: string): void => {
  getA11yMonitor().trackModalOpen(modalId);
};

/**
 * Track announcement
 */
export const trackAnnouncement = (message: string, type: 'polite' | 'assertive'): void => {
  getA11yMonitor().trackAnnouncement(message, type);
};

/**
 * Track keyboard shortcut
 */
export const trackShortcut = (shortcutId: string): void => {
  getA11yMonitor().trackShortcut(shortcutId);
};

/**
 * Generate performance report
 */
export const generateA11yPerformanceReport = (): A11yPerformanceReport => {
  return getA11yMonitor().generateReport();
};

/**
 * Log performance report
 */
export const logA11yPerformanceReport = (): void => {
  getA11yMonitor().logReport();
};

/**
 * Add to window for console access
 */
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).logA11yPerformance = logA11yPerformanceReport;
  (window as any).getA11yReport = generateA11yPerformanceReport;
}

/**
 * React hook for monitoring component accessibility
 */
export const useA11yMonitoring = (componentName: string) => {
  React.useEffect(() => {
    const startTime = performance.now();

    return () => {
      const duration = performance.now() - startTime;
      if (duration > 1000) {
        console.warn(`Component ${componentName} took ${duration.toFixed(2)}ms to mount`);
      }
    };
  }, [componentName]);
};

import React from 'react';
