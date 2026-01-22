/**
 * Tauri wrapper with resilience and self-healing
 * - Gracefully handles browser-only mode
 * - Auto-waits for Tauri to be available
 * - Throttles warning spam
 * - Provides fallback values
 */

import type { InvokeArgs } from "@tauri-apps/api/core";
import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen as tauriListen, type UnlistenFn } from "@tauri-apps/api/event";
import { logWithScope } from "./logger";

const logFn = logWithScope("tauri");
const log = {
  info: (msg: string, meta?: Record<string, unknown>) => logFn('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => logFn('warn', msg, meta),
  error: (msg: string, meta?: unknown) => logFn('error', msg, typeof meta === 'object' ? meta as Record<string, unknown> : { error: meta }),
  debug: (msg: string, meta?: Record<string, unknown>) => logFn('debug', msg, meta),
};
const TAURI_WAIT_MS = 2000;
const TAURI_POLL_MS = 100;
const LOG_THROTTLE_MS = 5000;

let lastWarnAt = 0;
let tauriUnavailable = false;

/**
 * Check if Tauri API is available
 */
export const isTauriAvailable = () => {
  const w = window as any;
  return Boolean(w?.__TAURI__?.core?.invoke);
};

const warnOnce = (message: string, meta?: Record<string, unknown>) => {
  const now = Date.now();
  if (now - lastWarnAt < LOG_THROTTLE_MS) return;
  lastWarnAt = now;
  log("warn", message, meta);
};

/**
 * Wait for Tauri to become available (up to TAURI_WAIT_MS)
 */
const waitForTauri = async () => {
  if (isTauriAvailable()) return true;
  const started = Date.now();
  while (Date.now() - started < TAURI_WAIT_MS) {
    await new Promise((r) => setTimeout(r, TAURI_POLL_MS));
    if (isTauriAvailable()) return true;
  }
  return false;
};

/**
 * Register global self-fix utilities for debugging
 */
export const registerSelfFix = () => {
  if (typeof window === "undefined") return;
  (window as any).signalxSelfFix = {
    retryTauri: () => {
      tauriUnavailable = false;
      log("info", "Retrying Tauri availability checks");
    },
    setDevAccount: (number: string) => {
      localStorage.setItem("signalx.dev.account", number);
      log("info", "Set dev account number", { number });
    },
    clearDevAccount: () => {
      localStorage.removeItem("signalx.dev.account");
      log("info", "Cleared dev account number");
    },
    dumpLogs: () => {
      return (window as any).__signalxLogs ?? [];
    },
  };
};

/**
 * Invoke a Tauri command with resilience
 * @param command - Tauri command name
 * @param args - Command arguments
 * @param opts - Options (fallback value)
 * @example
 * const accounts = await invoke<string[]>('list_accounts', {}, { fallback: [] });
 */
export const invoke = async <T>(
  command: string,
  args?: InvokeArgs,
  opts?: { fallback?: T }
): Promise<T> => {
  if (tauriUnavailable) {
    warnOnce("Tauri marked unavailable; invoke skipped", { command });
    if ("fallback" in (opts ?? {})) return opts?.fallback as T;
    throw new Error("Tauri unavailable");
  }
  
  const available = await waitForTauri();
  if (!available) {
    tauriUnavailable = true;
    warnOnce("Tauri not available; invoke skipped", { command });
    if ("fallback" in (opts ?? {})) return opts?.fallback as T;
    throw new Error("Tauri not available");
  }
  
  try {
    return (await tauriInvoke<T>(command, args)) as T;
  } catch (error) {
    log("error", "Invoke failed", {
      command,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

/**
 * Listen to Tauri events with resilience
 * @param event - Event name
 * @param handler - Event handler
 * @example
 * const unlisten = await listen<Message>('message-received', (e) => console.log(e.payload));
 */
export const listen = async <T>(
  event: string,
  handler: (event: { payload: T }) => void
): Promise<UnlistenFn> => {
  if (tauriUnavailable) {
    warnOnce("Tauri marked unavailable; listen skipped", { event });
    return () => undefined;
  }
  
  const available = await waitForTauri();
  if (!available) {
    tauriUnavailable = true;
    warnOnce("Tauri not available; listen skipped", { event });
    return () => undefined;
  }
  
  try {
    return await tauriListen<T>(event, handler);
  } catch (error) {
    log("error", "Listen failed", {
      event,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};
