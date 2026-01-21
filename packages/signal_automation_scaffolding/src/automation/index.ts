/**
 * SignalX Automation Engine
 * 
 * Provides rule-based automation for message handling, drafting, and queuing.
 */

export * from './types';
export * from './engine';
export * from './rules';
export * from './outbox';

// Re-export commonly used functions
export {
  runAutomation,
  validateRule,
  createRule,
} from './engine';

export {
  loadRules,
  saveRules,
  addRule,
  updateRule,
  removeRule,
  toggleRule,
  getRule,
  DEFAULT_RULES,
  RULE_TEMPLATES,
} from './rules';

export {
  loadOutbox,
  saveOutbox,
  enqueueItem,
  updateItem,
  removeItem,
  getOutboxSummary,
  getItemsByStatus,
  getNextItemToSend,
  markAsSending,
  markAsSent,
  markAsFailed,
  clearOldSentItems,
} from './outbox';
