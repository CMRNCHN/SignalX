import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePlugins, usePluginThreadSelection } from './usePlugins';
import * as pluginModule from '../../packages/signal_plugin_system/src/plugins';

// Mock the plugin module
vi.mock('../../packages/signal_plugin_system/src/plugins', () => ({
  pluginRegistry: {
    broadcast: vi.fn(),
    activate: vi.fn(),
  },
  getActivatedPlugins: vi.fn(() => []),
  onMessageReceived: vi.fn(),
  onThreadSelected: vi.fn(),
}));

// Mock Tauri event listener
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

describe('usePlugins', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets up message and account listeners on mount', async () => {
    const { listen } = await import('@tauri-apps/api/event');
    
    renderHook(() => usePlugins());

    await waitFor(() => {
      expect(listen).toHaveBeenCalledWith('message-received', expect.any(Function));
      expect(listen).toHaveBeenCalledWith('account-changed', expect.any(Function));
    });
  });

  it('forwards message events to plugins', async () => {
    const { onMessageReceived } = pluginModule as any;
    const { listen } = await import('@tauri-apps/api/event');
    let messageHandler: any;

    (listen as any).mockImplementation((event: string, handler: any) => {
      if (event === 'message-received') {
        messageHandler = handler;
      }
      return Promise.resolve(() => {});
    });

    renderHook(() => usePlugins());

    await waitFor(() => {
      expect(listen).toHaveBeenCalled();
    });

    // Simulate message received event
    if (messageHandler) {
      await messageHandler({
        payload: {
          thread_id: 'thread-1',
          sender: 'sender-1',
          content: 'Test message',
          timestamp: Date.now(),
        },
      });
    }

    await waitFor(() => {
      expect(onMessageReceived).toHaveBeenCalledWith({
        threadId: 'thread-1',
        sender: 'sender-1',
        body: 'Test message',
        timestamp: expect.any(Number),
      });
    });
  });

  it('activates enabled plugins on mount', async () => {
    const { getActivatedPlugins, pluginRegistry } = pluginModule as any;
    getActivatedPlugins.mockReturnValue([
      { metadata: { id: 'plugin-1' } },
      { metadata: { id: 'plugin-2' } },
    ]);

    const { listen } = await import('@tauri-apps/api/event');
    (listen as any).mockResolvedValue(() => {});

    renderHook(() => usePlugins());

    await waitFor(() => {
      expect(pluginRegistry.activate).toHaveBeenCalledWith('plugin-1');
      expect(pluginRegistry.activate).toHaveBeenCalledWith('plugin-2');
    });
  });

  it('cleans up listeners on unmount', async () => {
    const unlisten1 = vi.fn();
    const unlisten2 = vi.fn();
    const { listen } = await import('@tauri-apps/api/event');
    let callCount = 0;
    
    (listen as any).mockImplementation(() => {
      callCount++;
      return Promise.resolve(callCount === 1 ? unlisten1 : unlisten2);
    });

    const { unmount } = renderHook(() => usePlugins());

    await waitFor(() => {
      expect(listen).toHaveBeenCalledTimes(2);
    });

    unmount();

    expect(unlisten1).toHaveBeenCalled();
    expect(unlisten2).toHaveBeenCalled();
  });
});

describe('usePluginThreadSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls onThreadSelected when threadId is provided', () => {
    const { onThreadSelected } = pluginModule as any;
    
    renderHook(() => usePluginThreadSelection('thread-1'));

    expect(onThreadSelected).toHaveBeenCalledWith('thread-1');
  });

  it('does not call onThreadSelected when threadId is null', () => {
    const { onThreadSelected } = pluginModule as any;
    
    renderHook(() => usePluginThreadSelection(null));

    expect(onThreadSelected).not.toHaveBeenCalled();
  });

  it('updates when threadId changes', () => {
    const { onThreadSelected } = pluginModule as any;
    
    const { rerender } = renderHook(
      ({ threadId }) => usePluginThreadSelection(threadId),
      { initialProps: { threadId: 'thread-1' } }
    );

    expect(onThreadSelected).toHaveBeenCalledWith('thread-1');
    expect(onThreadSelected).toHaveBeenCalledTimes(1);

    rerender({ threadId: 'thread-2' });

    expect(onThreadSelected).toHaveBeenCalledWith('thread-2');
    expect(onThreadSelected).toHaveBeenCalledTimes(2);
  });
});
