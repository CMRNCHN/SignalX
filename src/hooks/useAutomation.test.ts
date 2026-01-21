import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAutomation } from './useAutomation';
import * as automationModule from '../../packages/signal_automation_scaffolding/src/automation';

// Mock the automation module
vi.mock('../../packages/signal_automation_scaffolding/src/automation', () => ({
  runAutomation: vi.fn(),
  loadRules: vi.fn(() => []),
}));

// Mock Tauri event listener
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

describe('useAutomation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets up message listener on mount', async () => {
    const { listen } = await import('@tauri-apps/api/event');
    
    renderHook(() => useAutomation());

    await waitFor(() => {
      expect(listen).toHaveBeenCalledWith('message-received', expect.any(Function));
    });
  });

  it('calls onDraftReady when automation generates draft', async () => {
    const onDraftReady = vi.fn();
    const { runAutomation, loadRules } = automationModule as any;
    
    runAutomation.mockReturnValue({
      action: 'DRAFT',
      draft: 'Test draft',
      confidence: 0.8,
    });
    loadRules.mockReturnValue([]);

    const { listen } = await import('@tauri-apps/api/event');
    let eventHandler: any;

    (listen as any).mockImplementation((event: string, handler: any) => {
      if (event === 'message-received') {
        eventHandler = handler;
      }
      return Promise.resolve(() => {});
    });

    renderHook(() => useAutomation(onDraftReady));

    await waitFor(() => {
      expect(listen).toHaveBeenCalled();
    });

    // Simulate message received event
    if (eventHandler) {
      await eventHandler({
        payload: {
          thread_id: 'thread-1',
          sender: 'sender-1',
          content: 'Test message',
          timestamp: Date.now(),
        },
      });
    }

    await waitFor(() => {
      expect(onDraftReady).toHaveBeenCalledWith({
        threadId: 'thread-1',
        content: 'Test draft',
        confidence: 0.8,
      });
    });
  });

  it('does not call onDraftReady when automation does not generate draft', async () => {
    const onDraftReady = vi.fn();
    const { runAutomation } = automationModule as any;
    
    runAutomation.mockReturnValue({
      action: 'NO_ACTION',
    });

    const { listen } = await import('@tauri-apps/api/event');
    (listen as any).mockResolvedValue(() => {});

    renderHook(() => useAutomation(onDraftReady));

    await waitFor(() => {
      expect(listen).toHaveBeenCalled();
    });

    // onDraftReady should not be called
    expect(onDraftReady).not.toHaveBeenCalled();
  });

  it('cleans up listener on unmount', async () => {
    const unlisten = vi.fn();
    const { listen } = await import('@tauri-apps/api/event');
    (listen as any).mockResolvedValue(unlisten);

    const { unmount } = renderHook(() => useAutomation());

    await waitFor(() => {
      expect(listen).toHaveBeenCalled();
    });

    unmount();

    expect(unlisten).toHaveBeenCalled();
  });
});
