/**
 * Custom hook for listening to backend events
 * Handles all Tauri event subscriptions for real-time updates
 */

import { useEffect } from 'react';
import { listen } from '../utils/tauri';
import { logWithScope } from '../utils/logger';

const log = logWithScope('useBackendEvents');

export interface OutboxStatsEvent {
  account_id: string;
  queued: number;
  sending: number;
  sent: number;
  failed: number;
}

export interface MessageSentEvent {
  id: string;
  account_id: string;
  thread_id: string;
  recipient: string;
  sent_at: number;
}

export interface OutboxSendFailedEvent {
  id: string;
  account_id: string;
  thread_id: string;
  error: string;
  retry_count: number;
  next_retry_at: number | null;
  max_retries: number;
}

export interface OutboxRetryScheduledEvent {
  id: string;
  account_id: string;
  thread_id: string;
  next_retry_at: number;
  retry_count: number;
}

export interface OutboxMovedToDLQEvent {
  id: string;
  account_id: string;
  thread_id: string;
  reason: string;
  retry_count: number;
  failed_at: number;
}

export interface ReceiveErrorEvent {
  account_id: string;
  error: string;
  timestamp: number;
  consecutive_failures: number;
}

export interface DuplicateMessageEvent {
  message_id: string;
  thread_id: string;
  timestamp: number;
}

export interface BackendEventHandlers {
  onOutboxStatsUpdated?: (event: OutboxStatsEvent) => void;
  onMessageSent?: (event: MessageSentEvent) => void;
  onOutboxSendFailed?: (event: OutboxSendFailedEvent) => void;
  onOutboxRetryScheduled?: (event: OutboxRetryScheduledEvent) => void;
  onOutboxMovedToDLQ?: (event: OutboxMovedToDLQEvent) => void;
  onReceiveError?: (event: ReceiveErrorEvent) => void;
  onDuplicateMessage?: (event: DuplicateMessageEvent) => void;
  onThreadsUpdated?: (threads: any[]) => void;
  onMessageReceived?: (message: any) => void;
  onAccountChanged?: (data: { account_id: string }) => void;
}

/**
 * Subscribe to backend events
 * 
 * @example
 * ```tsx
 * useBackendEvents({
 *   onMessageSent: (event) => {
 *     console.log('Message sent!', event);
 *     toast.success('Message sent successfully');
 *   },
 *   onOutboxStatsUpdated: (stats) => {
 *     console.log('Outbox stats:', stats);
 *   }
 * });
 * ```
 */
export function useBackendEvents(handlers: BackendEventHandlers) {
  useEffect(() => {
    const unsubscribers: Array<() => void> = [];

    // Outbox stats updated
    if (handlers.onOutboxStatsUpdated) {
      listen<OutboxStatsEvent>('outbox-stats-updated', (event) => {
        log.info('Outbox stats updated', event.payload);
        handlers.onOutboxStatsUpdated!(event.payload);
      }).then((unsub) => unsubscribers.push(unsub));
    }

    // Message sent successfully
    if (handlers.onMessageSent) {
      listen<MessageSentEvent>('message-sent', (event) => {
        log.info('Message sent', event.payload);
        handlers.onMessageSent!(event.payload);
      }).then((unsub) => unsubscribers.push(unsub));
    }

    // Outbox send failed
    if (handlers.onOutboxSendFailed) {
      listen<OutboxSendFailedEvent>('outbox-send-failed', (event) => {
        log.warn('Outbox send failed', event.payload);
        handlers.onOutboxSendFailed!(event.payload);
      }).then((unsub) => unsubscribers.push(unsub));
    }

    // Outbox retry scheduled
    if (handlers.onOutboxRetryScheduled) {
      listen<OutboxRetryScheduledEvent>('outbox-retry-scheduled', (event) => {
        log.info('Outbox retry scheduled', event.payload);
        handlers.onOutboxRetryScheduled!(event.payload);
      }).then((unsub) => unsubscribers.push(unsub));
    }

    // Outbox moved to DLQ
    if (handlers.onOutboxMovedToDLQ) {
      listen<OutboxMovedToDLQEvent>('outbox-moved-to-dlq', (event) => {
        log.error('Outbox moved to DLQ', event.payload);
        handlers.onOutboxMovedToDLQ!(event.payload);
      }).then((unsub) => unsubscribers.push(unsub));
    }

    // Receive error
    if (handlers.onReceiveError) {
      listen<ReceiveErrorEvent>('receive-error', (event) => {
        log.error('Receive error', event.payload);
        handlers.onReceiveError!(event.payload);
      }).then((unsub) => unsubscribers.push(unsub));
    }

    // Duplicate message detected
    if (handlers.onDuplicateMessage) {
      listen<DuplicateMessageEvent>('duplicate-message-detected', (event) => {
        log.warn('Duplicate message detected', event.payload);
        handlers.onDuplicateMessage!(event.payload);
      }).then((unsub) => unsubscribers.push(unsub));
    }

    // Threads updated (existing event)
    if (handlers.onThreadsUpdated) {
      listen('threads-updated', (event) => {
        log.info('Threads updated', event.payload);
        handlers.onThreadsUpdated!(event.payload as any[]);
      }).then((unsub) => unsubscribers.push(unsub));
    }

    // Message received (existing event)
    if (handlers.onMessageReceived) {
      listen('message-received', (event) => {
        log.info('Message received', event.payload);
        handlers.onMessageReceived!(event.payload);
      }).then((unsub) => unsubscribers.push(unsub));
    }

    // Account changed (existing event)
    if (handlers.onAccountChanged) {
      listen<{ account_id: string }>('account-changed', (event) => {
        log.info('Account changed', event.payload);
        handlers.onAccountChanged!(event.payload);
      }).then((unsub) => unsubscribers.push(unsub));
    }

    // Cleanup on unmount
    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [
    handlers.onOutboxStatsUpdated,
    handlers.onMessageSent,
    handlers.onOutboxSendFailed,
    handlers.onOutboxRetryScheduled,
    handlers.onOutboxMovedToDLQ,
    handlers.onReceiveError,
    handlers.onDuplicateMessage,
    handlers.onThreadsUpdated,
    handlers.onMessageReceived,
    handlers.onAccountChanged,
  ]);
}

/**
 * Hook for outbox-specific events
 * Convenience wrapper around useBackendEvents
 */
export function useOutboxEvents(handlers: {
  onStatsUpdated?: (stats: OutboxStatsEvent) => void;
  onMessageSent?: (event: MessageSentEvent) => void;
  onSendFailed?: (event: OutboxSendFailedEvent) => void;
  onRetryScheduled?: (event: OutboxRetryScheduledEvent) => void;
  onMovedToDLQ?: (event: OutboxMovedToDLQEvent) => void;
}) {
  useBackendEvents({
    onOutboxStatsUpdated: handlers.onStatsUpdated,
    onMessageSent: handlers.onMessageSent,
    onOutboxSendFailed: handlers.onSendFailed,
    onOutboxRetryScheduled: handlers.onRetryScheduled,
    onOutboxMovedToDLQ: handlers.onMovedToDLQ,
  });
}
