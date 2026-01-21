import { useEffect } from 'react';
import { listen } from '../utils/tauri';
import { logWithScope } from '../utils/logger';
import {
  pluginRegistry,
  getActivatedPlugins,
} from '../../packages/signal_plugin_system/src/plugins';
import {
  onMessageReceived as pluginOnMessageReceived,
  onThreadSelected as pluginOnThreadSelected,
} from '../../packages/signal_plugin_system/src/plugins/hooks';

/**
 * Hook to integrate plugin system with app events
 */
export function usePlugins() {
  const log = logWithScope("usePlugins");
  useEffect(() => {
    const unlisteners: (() => void)[] = [];

    (async () => {
      try {
        // Listen for message received events and forward to plugins
        const u1 = await listen<any>('message-received', async event => {
          const msg = event.payload;
          await pluginOnMessageReceived({
            threadId: msg.thread_id || '',
            sender: msg.sender || '',
            body: msg.content || '',
            timestamp: msg.timestamp || Date.now(),
          });
        });
        unlisteners.push(u1);

        // Listen for account changes and forward to plugins
        const u2 = await listen<any>('account-changed', async event => {
          await pluginRegistry.broadcast({
            type: 'account.changed',
            payload: event.payload,
            source: 'signalx.core',
          });
        });
        unlisteners.push(u2);

        // Activate all enabled plugins
        const plugins = getActivatedPlugins();
        for (const plugin of plugins) {
          try {
            await pluginRegistry.activate(plugin.metadata.id);
          } catch (error) {
            log("warn", "Failed to activate plugin", {
              pluginId: plugin.metadata.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      } catch (error) {
        log("warn", "Failed to set up plugin listeners", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();

    return () => {
      unlisteners.forEach(unlisten => {
        try {
          unlisten();
        } catch (e) {
          // Ignore cleanup errors
        }
      });
    };
  }, []);
}

/**
 * Hook to notify plugins when thread is selected
 */
export function usePluginThreadSelection(threadId: string | null) {
  useEffect(() => {
    if (threadId) {
      pluginOnThreadSelected(threadId);
    }
  }, [threadId]);
}
