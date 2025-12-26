import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  LiveRegionAnnouncer,
  getAnnouncer,
  announce,
  announceAssertive,
  clearAnnouncements,
  announcements,
} from './announcer';

describe('LiveRegionAnnouncer', () => {
  let announcer: LiveRegionAnnouncer;

  beforeEach(() => {
    announcer = new LiveRegionAnnouncer();
    vi.useFakeTimers();
  });

  afterEach(() => {
    announcer.destroy();
    vi.useRealTimers();
  });

  it('creates live regions on initialization', () => {
    const politeRegion = document.querySelector('[aria-live="polite"]');
    const assertiveRegion = document.querySelector('[aria-live="assertive"]');

    expect(politeRegion).not.toBeNull();
    expect(assertiveRegion).not.toBeNull();
  });

  it('announces polite messages', () => {
    announcer.announce('Test message');
    vi.advanceTimersByTime(100);

    const politeRegion = document.querySelector('[aria-live="polite"]');
    expect(politeRegion?.textContent).toBe('Test message');
  });

  it('announces assertive messages', () => {
    announcer.announceAssertive('Urgent message');
    vi.advanceTimersByTime(100);

    const assertiveRegion = document.querySelector('[aria-live="assertive"]');
    expect(assertiveRegion?.textContent).toBe('Urgent message');
  });

  it('clears previous message before announcing new one', () => {
    announcer.announce('First message');
    vi.advanceTimersByTime(100);

    const politeRegion = document.querySelector('[aria-live="polite"]');
    expect(politeRegion?.textContent).toBe('First message');

    announcer.announce('Second message');
    expect(politeRegion?.textContent).toBe('');
    vi.advanceTimersByTime(100);
    expect(politeRegion?.textContent).toBe('Second message');
  });

  it('respects custom delay', () => {
    announcer.announce('Delayed message', 500);
    
    vi.advanceTimersByTime(100);
    const politeRegion = document.querySelector('[aria-live="polite"]');
    expect(politeRegion?.textContent).toBe('');

    vi.advanceTimersByTime(400);
    expect(politeRegion?.textContent).toBe('Delayed message');
  });

  it('clears all announcements', () => {
    announcer.announce('Test message');
    vi.advanceTimersByTime(100);

    const politeRegion = document.querySelector('[aria-live="polite"]');
    expect(politeRegion?.textContent).toBe('Test message');

    announcer.clear();
    expect(politeRegion?.textContent).toBe('');
  });

  it('removes live regions on destroy', () => {
    let politeRegion = document.querySelector('[aria-live="polite"]');
    let assertiveRegion = document.querySelector('[aria-live="assertive"]');

    expect(politeRegion).not.toBeNull();
    expect(assertiveRegion).not.toBeNull();

    announcer.destroy();

    politeRegion = document.querySelector('[aria-live="polite"]');
    assertiveRegion = document.querySelector('[aria-live="assertive"]');

    expect(politeRegion).toBeNull();
    expect(assertiveRegion).toBeNull();
  });

  it('has screen-reader-only styles on live regions', () => {
    const politeRegion = document.querySelector('[aria-live="polite"]') as HTMLElement;
    
    expect(politeRegion.style.position).toBe('absolute');
    expect(politeRegion.style.left).toBe('-10000px');
    expect(politeRegion.style.width).toBe('1px');
    expect(politeRegion.style.height).toBe('1px');
    expect(politeRegion.style.overflow).toBe('hidden');
  });
});

describe('Announcer singleton', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    const announcer = getAnnouncer();
    announcer.destroy();
    vi.useRealTimers();
  });

  it('returns the same instance', () => {
    const announcer1 = getAnnouncer();
    const announcer2 = getAnnouncer();
    expect(announcer1).toBe(announcer2);
  });

  it('announce function works', () => {
    announce('Test message');
    vi.advanceTimersByTime(100);

    const politeRegion = document.querySelector('[aria-live="polite"]');
    expect(politeRegion?.textContent).toBe('Test message');
  });

  it('announceAssertive function works', () => {
    announceAssertive('Urgent message');
    vi.advanceTimersByTime(100);

    const assertiveRegion = document.querySelector('[aria-live="assertive"]');
    expect(assertiveRegion?.textContent).toBe('Urgent message');
  });

  it('clearAnnouncements function works', () => {
    announce('Test message');
    vi.advanceTimersByTime(100);

    let politeRegion = document.querySelector('[aria-live="polite"]');
    expect(politeRegion?.textContent).toBe('Test message');

    clearAnnouncements();
    politeRegion = document.querySelector('[aria-live="polite"]');
    expect(politeRegion?.textContent).toBe('');
  });
});

describe('Announcement templates', () => {
  it('generates loading message', () => {
    expect(announcements.loading('users')).toBe('Loading users');
  });

  it('generates loaded message', () => {
    expect(announcements.loaded('users')).toBe('users loaded');
  });

  it('generates error message', () => {
    expect(announcements.error('Network error')).toBe('Error: Network error');
  });

  it('generates success message', () => {
    expect(announcements.success('Operation completed')).toBe('Success: Operation completed');
  });

  it('generates saved message', () => {
    expect(announcements.saved('Document')).toBe('Document saved');
  });

  it('generates deleted message', () => {
    expect(announcements.deleted('Item')).toBe('Item deleted');
  });

  it('generates selected message', () => {
    expect(announcements.selected('Option 1')).toBe('Option 1 selected');
  });

  it('generates expanded message', () => {
    expect(announcements.expanded('Menu')).toBe('Menu expanded');
  });

  it('generates collapsed message', () => {
    expect(announcements.collapsed('Menu')).toBe('Menu collapsed');
  });

  it('generates page changed message', () => {
    expect(announcements.pageChanged(2, 5)).toBe('Page 2 of 5');
  });

  it('generates results found message with singular', () => {
    expect(announcements.resultsFound(1, 'test')).toBe('1 result found for "test"');
  });

  it('generates results found message with plural', () => {
    expect(announcements.resultsFound(5, 'test')).toBe('5 results found for "test"');
  });

  it('generates no results message', () => {
    expect(announcements.noResults('test')).toBe('No results found for "test"');
  });

  it('generates navigation change message', () => {
    expect(announcements.navigationChange('Settings')).toBe('Navigated to Settings');
  });

  it('generates form error message', () => {
    expect(announcements.formError('Email', 'Invalid format')).toBe('Email: Invalid format');
  });

  it('generates item added message', () => {
    expect(announcements.itemAdded('Item', 'cart')).toBe('Item added to cart');
  });

  it('generates item removed message', () => {
    expect(announcements.itemRemoved('Item', 'cart')).toBe('Item removed from cart');
  });

  it('generates progress update message', () => {
    expect(announcements.progressUpdate(3, 10)).toBe('Progress: 3 of 10 complete');
  });
});

