function tauriInternalsPresent(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as Window & {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
    isTauri?: boolean;
  };
  return Boolean(w.__TAURI_INTERNALS__ || w.__TAURI__ || w.isTauri);
}

/** Dev-only: `?ui=1` renders the shell in a plain browser. No IPC exists there. */
export function isUiPreview(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(import.meta.env.DEV && new URLSearchParams(window.location.search).has("ui"));
}

/** True when the operator-facing shell should render (desktop host or UI preview). */
export function isTauriRuntime(): boolean {
  return isUiPreview() || tauriInternalsPresent();
}

/** True when Tauri `invoke` / event listen will actually work. */
export function canInvoke(): boolean {
  return !isUiPreview() && tauriInternalsPresent();
}
