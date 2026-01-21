/**
 * Testing Utilities for SignalX
 * 
 * Provides common utilities and helpers for writing tests.
 */

import { render, RenderOptions } from '@testing-library/react';
import { ReactElement } from 'react';
import { vi } from 'vitest';

/**
 * Custom render function with providers
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, {
    ...options,
  });
}

/**
 * Mock Tauri API
 */
export function mockTauriAPI() {
  const mockInvoke = vi.fn();
  const mockListen = vi.fn();
  const mockEmit = vi.fn();

  return {
    invoke: mockInvoke,
    listen: mockListen,
    emit: mockEmit,
    // Reset all mocks
    reset: () => {
      mockInvoke.mockReset();
      mockListen.mockReset();
      mockEmit.mockReset();
    },
  };
}

/**
 * Wait for async operations to complete
 */
export async function waitForAsync() {
  await new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Create mock message data
 */
export function createMockMessage(overrides?: Partial<{
  id: string;
  thread_id: string;
  sender: string;
  content: string;
  timestamp: number;
}>) {
  return {
    id: overrides?.id || `msg-${Date.now()}`,
    thread_id: overrides?.thread_id || 'thread-1',
    sender: overrides?.sender || '+1234567890',
    recipient: null,
    content: overrides?.content || 'Test message',
    direction: 'Incoming' as const,
    timestamp: overrides?.timestamp || Date.now(),
    raw_json: null,
  };
}

/**
 * Create mock thread summary
 */
export function createMockThreadSummary(overrides?: Partial<{
  id: string;
  participants: string[];
  last_message_timestamp: number;
  unread_count: number;
}>) {
  return {
    id: overrides?.id || 'thread-1',
    participants: overrides?.participants || ['+1234567890'],
    last_message_timestamp: overrides?.last_message_timestamp || Date.now(),
    unread_count: overrides?.unread_count || 0,
    message_count: 1,
    outbox_count: 0,
  };
}

/**
 * Mock localStorage
 */
export function mockLocalStorage() {
  const store: Record<string, string> = {};

  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach(key => delete store[key]);
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => {
      const keys = Object.keys(store);
      return keys[index] || null;
    }),
  };
}

/**
 * Setup test environment
 */
export function setupTestEnvironment() {
  // Mock window.matchMedia
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // Mock ResizeObserver
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));

  // Mock IntersectionObserver
  global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
}

/**
 * Test data factories
 */
export const testData = {
  message: createMockMessage,
  threadSummary: createMockThreadSummary,
};

/**
 * Assert accessibility
 */
export async function expectAccessible(element: HTMLElement) {
  // Check for required ARIA attributes
  const hasRole = element.getAttribute('role') !== null;
  const hasLabel = 
    element.getAttribute('aria-label') !== null ||
    element.getAttribute('aria-labelledby') !== null ||
    element.textContent !== null;

  if (element.tagName === 'BUTTON' || element.tagName === 'A') {
    expect(hasLabel || hasRole).toBe(true);
  }
}
