/**
 * Core utilities for SignalX
 */

export function formatTimestamp(date: Date = new Date()): string {
  return date.toISOString();
}

export function validateConfig(config: unknown): boolean {
  if (!config || typeof config !== 'object') {
    return false;
  }

  const cfg = config as Record<string, unknown>;

  // Validate required top-level properties
  if (!cfg.app || typeof cfg.app !== 'object') {
    return false;
  }
  if (!cfg.logging || typeof cfg.logging !== 'object') {
    return false;
  }
  if (!cfg.modules || typeof cfg.modules !== 'object') {
    return false;
  }

  return true;
}

export function ensureError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}
