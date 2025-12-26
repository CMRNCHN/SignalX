// Live region announcements for screen readers

/**
 * Creates and manages live regions for screen reader announcements
 */
export class LiveRegionAnnouncer {
  private politeRegion: HTMLDivElement | null = null;
  private assertiveRegion: HTMLDivElement | null = null;
  private timeout: number | null = null;

  constructor() {
    this.initialize();
  }

  /**
   * Initialize live regions
   */
  private initialize(): void {
    // Create polite live region
    this.politeRegion = this.createLiveRegion('polite');
    // Create assertive live region
    this.assertiveRegion = this.createLiveRegion('assertive');
  }

  /**
   * Create a live region element
   */
  private createLiveRegion(ariaLive: 'polite' | 'assertive'): HTMLDivElement {
    const region = document.createElement('div');
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', ariaLive);
    region.setAttribute('aria-atomic', 'true');
    region.style.position = 'absolute';
    region.style.left = '-10000px';
    region.style.width = '1px';
    region.style.height = '1px';
    region.style.overflow = 'hidden';
    document.body.appendChild(region);
    return region;
  }

  /**
   * Announce a message to screen readers (polite)
   * Won't interrupt current announcements
   */
  public announce(message: string, delay = 100): void {
    this.announceToRegion(this.politeRegion, message, delay);
  }

  /**
   * Announce a message to screen readers (assertive)
   * Will interrupt current announcements
   */
  public announceAssertive(message: string, delay = 100): void {
    this.announceToRegion(this.assertiveRegion, message, delay);
  }

  /**
   * Announce to a specific region
   */
  private announceToRegion(
    region: HTMLDivElement | null,
    message: string,
    delay: number
  ): void {
    if (!region) return;

    // Clear previous timeout
    if (this.timeout) {
      clearTimeout(this.timeout);
    }

    // Clear the region first to ensure announcement
    region.textContent = '';

    // Use a small delay to ensure screen readers pick up the change
    this.timeout = window.setTimeout(() => {
      if (region) {
        region.textContent = message;
      }
    }, delay);
  }

  /**
   * Clear all announcements
   */
  public clear(): void {
    if (this.politeRegion) {
      this.politeRegion.textContent = '';
    }
    if (this.assertiveRegion) {
      this.assertiveRegion.textContent = '';
    }
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }

  /**
   * Cleanup and remove live regions
   */
  public destroy(): void {
    this.clear();
    if (this.politeRegion) {
      document.body.removeChild(this.politeRegion);
      this.politeRegion = null;
    }
    if (this.assertiveRegion) {
      document.body.removeChild(this.assertiveRegion);
      this.assertiveRegion = null;
    }
  }
}

// Singleton instance
let announcerInstance: LiveRegionAnnouncer | null = null;

/**
 * Get the singleton announcer instance
 */
export const getAnnouncer = (): LiveRegionAnnouncer => {
  if (!announcerInstance) {
    announcerInstance = new LiveRegionAnnouncer();
  }
  return announcerInstance;
};

/**
 * Announce a message to screen readers (polite)
 */
export const announce = (message: string, delay?: number): void => {
  getAnnouncer().announce(message, delay);
};

/**
 * Announce a message to screen readers (assertive)
 */
export const announceAssertive = (message: string, delay?: number): void => {
  getAnnouncer().announceAssertive(message, delay);
};

/**
 * Clear all announcements
 */
export const clearAnnouncements = (): void => {
  getAnnouncer().clear();
};

/**
 * Common announcement messages
 */
export const announcements = {
  loading: (item: string) => `Loading ${item}`,
  loaded: (item: string) => `${item} loaded`,
  error: (message: string) => `Error: ${message}`,
  success: (message: string) => `Success: ${message}`,
  saved: (item: string) => `${item} saved`,
  deleted: (item: string) => `${item} deleted`,
  selected: (item: string) => `${item} selected`,
  expanded: (item: string) => `${item} expanded`,
  collapsed: (item: string) => `${item} collapsed`,
  pageChanged: (page: number, total: number) => `Page ${page} of ${total}`,
  resultsFound: (count: number, query: string) =>
    `${count} result${count !== 1 ? 's' : ''} found for "${query}"`,
  noResults: (query: string) => `No results found for "${query}"`,
  navigationChange: (location: string) => `Navigated to ${location}`,
  formError: (field: string, error: string) => `${field}: ${error}`,
  itemAdded: (item: string, location: string) => `${item} added to ${location}`,
  itemRemoved: (item: string, location: string) => `${item} removed from ${location}`,
  progressUpdate: (current: number, total: number) =>
    `Progress: ${current} of ${total} complete`,
} as const;

/**
 * React hook for live announcements
 */
export const useLiveAnnouncer = () => {
  const announcer = getAnnouncer();

  return {
    announce: (message: string, delay?: number) => announcer.announce(message, delay),
    announceAssertive: (message: string, delay?: number) =>
      announcer.announceAssertive(message, delay),
    clear: () => announcer.clear(),
  };
};

/**
 * Status message component for visually hidden but screen-reader accessible messages
 */
export const srOnlyStyles: React.CSSProperties = {
  position: 'absolute',
  left: '-10000px',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
};

