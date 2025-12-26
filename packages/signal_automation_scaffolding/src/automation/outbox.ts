export type OutboxItem = {
  id: string;
  threadId: string;
  recipient: string;
  body: string;
  createdAt: number;
  status: 'DRAFT' | 'QUEUED' | 'SENT' | 'FAILED';
};

const KEY = 'signalx.outbox.v1';

export function loadOutbox(): OutboxItem[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

export function saveOutbox(items: OutboxItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function enqueueDraft(threadId: string, recipient: string, body: string): OutboxItem {
  const item: OutboxItem = { id: crypto.randomUUID(), threadId, recipient, body, createdAt: Date.now(), status: 'DRAFT' };
  const items = loadOutbox();
  items.unshift(item);
  saveOutbox(items);
  return item;
}
