/** True when the UI is running inside the SignalX Tauri desktop shell. */
export function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  // Dev-only escape hatch: `?ui=1` renders the shell in a plain browser so the
  // interface can be inspected without the desktop host. No IPC exists there,
  // so every api call fails and the dev fixtures supply the content.
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("ui")) {
    return true;
  }
  const w = window as Window & {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
    isTauri?: boolean;
  };
  return Boolean(w.__TAURI_INTERNALS__ || w.__TAURI__ || w.isTauri);
}
