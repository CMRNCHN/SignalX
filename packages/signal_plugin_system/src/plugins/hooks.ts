import type { PluginMessage, PluginEvent } from './types';
import { pluginRegistry } from './registry';

/**
 * Plugin hooks for integration with SignalX core
 */

/**
 * Message received hook
 * Called when a new message is received
 */
export async function onMessageReceived(message: {
  threadId: string;
  sender: string;
  body: string;
  timestamp: number;
}): Promise<void> {
  await pluginRegistry.broadcast({
    type: 'message.received',
    payload: message,
    source: 'signalx.core',
  });
}

/**
 * Thread selected hook
 * Called when user selects a thread
 */
export async function onThreadSelected(threadId: string): Promise<void> {
  await pluginRegistry.broadcast({
    type: 'thread.selected',
    payload: { threadId },
    source: 'signalx.core',
  });
}

/**
 * Draft created hook
 * Called when a draft is created
 */
export async function onDraftCreated(draft: {
  threadId: string;
  content: string;
  source: string;
}): Promise<void> {
  await pluginRegistry.broadcast({
    type: 'draft.created',
    payload: draft,
    source: 'signalx.core',
  });
}

/**
 * Message sent hook
 * Called when a message is sent
 */
export async function onMessageSent(message: {
  threadId: string;
  recipient: string;
  content: string;
}): Promise<void> {
  await pluginRegistry.broadcast({
    type: 'message.sent',
    payload: message,
    source: 'signalx.core',
  });
}

/**
 * Subscribe to plugin events
 */
export function subscribeToPluginEvents(
  callback: (event: PluginEvent) => void
): () => void {
  return pluginRegistry.onEvent(callback);
}

/**
 * Send message to specific plugin
 */
export async function sendToPlugin(
  pluginId: string,
  message: Omit<PluginMessage, 'timestamp'>
): Promise<void> {
  await pluginRegistry.sendMessage(pluginId, message as PluginMessage);
}
