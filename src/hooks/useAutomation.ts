import { useEffect } from 'react';
import { listen } from '../utils/tauri';
import { logWithScope } from '../utils/logger';
import { runAutomation, loadRules } from '../../packages/signal_automation_scaffolding/src/automation';
import type { IncomingMessage } from '../../packages/signal_automation_scaffolding/src/automation/types';

/**
 * Hook to integrate automation engine with message events
 */
export function useAutomation(
  onDraftReady?: (draft: { threadId: string; content: string; confidence: number }) => void
) {
  const logFn = logWithScope("useAutomation");
  const log = {
    info: (msg: string, meta?: Record<string, unknown>) => logFn('info', msg, meta),
    warn: (msg: string, meta?: Record<string, unknown>) => logFn('warn', msg, meta),
    error: (msg: string, meta?: unknown) => logFn('error', msg, typeof meta === 'object' ? meta as Record<string, unknown> : { error: meta }),
    debug: (msg: string, meta?: Record<string, unknown>) => logFn('debug', msg, meta),
  };
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    (async () => {
      try {
        // Listen for message received events
        unlisten = await listen<IncomingMessage>('message-received', async event => {
          const message = event.payload;

          // Load rules
          const rules = loadRules();

          // Run automation
          const result = runAutomation(rules, {
            threadId: message.thread_id || '',
            sender: message.sender || '',
            body: message.content || '',
            ts: message.timestamp || Date.now(),
          });

          // If automation generated a draft, notify
          if (result.action === 'DRAFT' && result.draft && onDraftReady) {
            onDraftReady({
              threadId: message.thread_id || '',
              content: result.draft,
              confidence: result.confidence || 0.5,
            });
          }
        });
      } catch (error) {
        log("warn", "Failed to set up automation listener", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [onDraftReady]);
}
