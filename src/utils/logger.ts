/**
 * Structured logging utility for SignalX
 * - Captures all logs with timestamps and context
 * - Exposes logs globally for debugging
 * - Auto-registers global error handlers
 */

type LogLevel = "debug" | "info" | "warn" | "error";

export type LogEntry = {
  level: LogLevel;
  scope: string;
  message: string;
  meta?: Record<string, unknown>;
  timestamp: string;
};

const MAX_LOGS = 500;
const logs: LogEntry[] = [];

const levelToConsole: Record<LogLevel, (...args: any[]) => void> = {
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

const pushLog = (entry: LogEntry) => {
  logs.push(entry);
  if (logs.length > MAX_LOGS) logs.shift();
  // Expose logs globally for debugging
  if (typeof window !== "undefined") {
    (window as any).__signalxLogs = logs;
  }
};

/**
 * Create a logger bound to a specific scope
 * @example
 * const log = logWithScope('boot');
 * log('info', 'Application started');
 * log('error', 'Failed to load', { reason: 'timeout' });
 */
export const logWithScope = (scope: string) => {
  return (level: LogLevel, message: string, meta?: Record<string, unknown>) => {
    const entry: LogEntry = {
      level,
      scope,
      message,
      meta,
      timestamp: new Date().toISOString(),
    };
    pushLog(entry);
    const fn = levelToConsole[level] ?? console.log;
    if (meta) {
      fn(`[${entry.timestamp}] [${scope}] ${message}`, meta);
    } else {
      fn(`[${entry.timestamp}] [${scope}] ${message}`);
    }
  };
};

/**
 * Get all captured logs
 */
export const getLogs = () => logs.slice();

/**
 * Register global error handlers to capture unhandled errors
 */
export const registerGlobalErrorHandlers = () => {
  if (typeof window === "undefined") return;
  const log = logWithScope("global");
  
  window.addEventListener("error", (event) => {
    log("error", "Unhandled error", {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error instanceof Error ? event.error.message : String(event.error),
    });
  });
  
  window.addEventListener("unhandledrejection", (event) => {
    log("error", "Unhandled promise rejection", {
      reason: event.reason instanceof Error ? event.reason.message : String(event.reason),
    });
  });
};
