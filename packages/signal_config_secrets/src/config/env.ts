export type Env = {
  SIGNALX_SIGNALCLI_CONFIG: string;
  SIGNALX_NUMBER: string;
  SIGNALX_SIGNALCLI_BIN?: string;
  SIGNALX_OLLAMA_MODEL?: string;
};

export function readEnv(): Env {
  const v = (k: string) => (import.meta as any).env?.[k] ?? (window as any).__SIGNALX_ENV__?.[k];
  const cfg = v('VITE_SIGNALX_SIGNALCLI_CONFIG') ?? v('SIGNALX_SIGNALCLI_CONFIG');
  const num = v('VITE_SIGNALX_NUMBER') ?? v('SIGNALX_NUMBER');
  if (!cfg || !num) throw new Error('Missing required env vars: SIGNALX_SIGNALCLI_CONFIG and/or SIGNALX_NUMBER');
  return {
    SIGNALX_SIGNALCLI_CONFIG: cfg,
    SIGNALX_NUMBER: num,
    SIGNALX_SIGNALCLI_BIN: v('VITE_SIGNALX_SIGNALCLI_BIN') ?? v('SIGNALX_SIGNALCLI_BIN'),
    SIGNALX_OLLAMA_MODEL: v('VITE_SIGNALX_OLLAMA_MODEL') ?? v('SIGNALX_OLLAMA_MODEL'),
  };
}
