export type OutboxItem = {
  id: string;
  threadId: string;
  recipient: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  status: 'DRAFT' | 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED';
  attemptCount: number;
  lastError?: string;
  nextRetryAt?: number;
};

export type OutboxSummary = {
  draft: number;
  queued: number;
  sending: number;
  sent: number;
  failed: number;
};

const STORAGE_KEY = 'signalx.outbox.v1';
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5000; // 5 seconds base delay

/**
 * Load outbox items from persistent storage
 */
export function loadOutbox(): OutboxItem[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    
    const items = JSON.parse(stored) as OutboxItem[];
    // Ensure all items have required fields
    return items.map(item => ({
      ...item,
      updatedAt: item.updatedAt || item.createdAt,
      attemptCount: item.attemptCount || 0,
      status: item.status || 'DRAFT',
    }));
  } catch (e) {
    console.error('Failed to load outbox:', e);
    return [];
  }
}

/**
 * Save outbox items to persistent storage
 */
export function saveOutbox(items: OutboxItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    console.error('Failed to save outbox:', e);
  }
}

/**
 * Add a new item to the outbox
 */
export function enqueueItem(
  threadId: string,
  recipient: string,
  body: string,
  status: OutboxItem['status'] = 'QUEUED'
): OutboxItem {
  const now = Date.now();
  const item: OutboxItem = {
    id: crypto.randomUUID(),
    threadId,
    recipient,
    body,
    createdAt: now,
    updatedAt: now,
    status,
    attemptCount: 0,
  };

  const items = loadOutbox();
  items.unshift(item); // Add to front
  saveOutbox(items);
  return item;
}

/**
 * Update an outbox item
 */
export function updateItem(updated: OutboxItem): OutboxItem {
  const items = loadOutbox();
  const index = items.findIndex(item => item.id === updated.id);
  
  if (index === -1) {
    throw new Error(`Outbox item not found: ${updated.id}`);
  }

  items[index] = {
    ...updated,
    updatedAt: Date.now(),
  };
  
  saveOutbox(items);
  return items[index];
}

/**
 * Remove an item from the outbox
 */
export function removeItem(itemId: string): boolean {
  const items = loadOutbox();
  const initialLength = items.length;
  const filtered = items.filter(item => item.id !== itemId);
  
  if (filtered.length === initialLength) {
    return false; // Item not found
  }
  
  saveOutbox(filtered);
  return true;
}

/**
 * Get outbox summary statistics
 */
export function getOutboxSummary(): OutboxSummary {
  const items = loadOutbox();
  
  return {
    draft: items.filter(i => i.status === 'DRAFT').length,
    queued: items.filter(i => i.status === 'QUEUED').length,
    sending: items.filter(i => i.status === 'SENDING').length,
    sent: items.filter(i => i.status === 'SENT').length,
    failed: items.filter(i => i.status === 'FAILED').length,
  };
}

/**
 * Get items by status
 */
export function getItemsByStatus(status: OutboxItem['status']): OutboxItem[] {
  return loadOutbox().filter(item => item.status === status);
}

/**
 * Get next item ready to send (QUEUED status, sorted by createdAt)
 */
export function getNextItemToSend(): OutboxItem | null {
  const queued = getItemsByStatus('QUEUED');
  if (queued.length === 0) return null;
  
  // Sort by creation time (oldest first)
  queued.sort((a, b) => a.createdAt - b.createdAt);
  return queued[0];
}

/**
 * Mark item as sending
 */
export function markAsSending(itemId: string): OutboxItem | null {
  const items = loadOutbox();
  const item = items.find(i => i.id === itemId);
  
  if (!item || item.status !== 'QUEUED') {
    return null;
  }
  
  return updateItem({
    ...item,
    status: 'SENDING',
    updatedAt: Date.now(),
  });
}

/**
 * Mark item as sent
 */
export function markAsSent(itemId: string): OutboxItem | null {
  const items = loadOutbox();
  const item = items.find(i => i.id === itemId);
  
  if (!item) {
    return null;
  }
  
  return updateItem({
    ...item,
    status: 'SENT',
    updatedAt: Date.now(),
  });
}

/**
 * Mark item as failed and schedule retry if attempts remain
 */
export function markAsFailed(itemId: string, error: string): OutboxItem | null {
  const items = loadOutbox();
  const item = items.find(i => i.id === itemId);
  
  if (!item) {
    return null;
  }
  
  const attemptCount = (item.attemptCount || 0) + 1;
  const shouldRetry = attemptCount < MAX_RETRY_ATTEMPTS;
  
  return updateItem({
    ...item,
    status: shouldRetry ? 'QUEUED' : 'FAILED',
    attemptCount,
    lastError: error,
    nextRetryAt: shouldRetry ? Date.now() + (RETRY_DELAY_MS * attemptCount) : undefined,
    updatedAt: Date.now(),
  });
}

/**
 * Clear old sent items (older than specified days)
 */
export function clearOldSentItems(daysOld: number = 30): number {
  const cutoff = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
  const items = loadOutbox();
  const filtered = items.filter(item => 
    item.status !== 'SENT' || item.updatedAt > cutoff
  );
  
  const removed = items.length - filtered.length;
  saveOutbox(filtered);
  return removed;
}
