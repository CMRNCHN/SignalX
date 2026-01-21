import { useEffect, useMemo, useRef, useState } from "react";
import { invoke, listen, isTauriAvailable } from "./utils/tauri";
import "./App.css";
import { ToolsPanel } from "./components/ToolsPanel";
import { SettingsModal } from "./components/SettingsModal";
import { NewMessageModal } from "./components/NewMessageModal";
import SkipLink from "./components/SkipLink";
import { ToastContainer } from "./components/Toast";
import { useToast } from "./hooks/useToast";
import { logWithScope } from "./utils/logger";
import { getUserFriendlyMessage } from "./utils/errorHandler";
import { useAutomation } from "./hooks/useAutomation";
import { usePlugins, usePluginThreadSelection } from "./hooks/usePlugins";
import { Input, Button, Select, Spinner, Checkbox } from "./components/primitives";
import { OutboxStatus } from "./components/OutboxStatus";
import { useBackendEvents } from "./hooks/useBackendEvents";
import { OnboardingTour } from "./components/OnboardingTour";
import { useOnboarding } from "./hooks/useOnboarding";
import { FeatureHint } from "./components/FeatureHint";

type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string };

async function unwrap<T>(p: Promise<any>, label: string): Promise<T> {
  const res = (await p) as ApiResponse<T>;
  if (!res || typeof res !== "object" || !("success" in res)) {
    throw new Error(`${label}: invalid response`);
  }
  if (!res.success)
    throw new Error(
      `${label}: ${"error" in res ? res.error : "unknown error"}`
    );
  return res.data;
}

type Direction = "Incoming" | "Outgoing";

export interface Message {
  id: string;
  thread_id: string;
  timestamp: number;
  sender: string;
  recipient?: string | null;
  content: string;
  direction: Direction;
  raw_json?: any | null;
}

export interface ThreadSummary {
  id: string;
  participants: string[];
  last_message_timestamp: number;
  unread_count: number;
  message_count: number;
  outbox_count?: number;
}

type AccountChangedPayload = { account_id: string };

type Diagnostics = {
  env_path: string | null;
  app_data_dir: string;
  threads_dir: string;
  aliases_dir: string;
  search_dir: string;
  signal_cli_path: string;
  signal_cli_version: string | null;
  signal_cli_usable: boolean;
  signal_cli_last_error: string | null;
  config_path: string | null;
  number: string | null;
  active_account: string | null;
};

type ReceiveLoopState = {
  last_receive_ok_at: number | null;
  last_receive_error: string | null;
  consecutive_failures: number;
  backoff_ms: number;
  cooldown_until: number | null;
};

type AliasMap = Record<string, string>; // number -> alias

type SearchResult = {
  message_id: string;
  thread_id: string;
  timestamp: number;
  sender: string;
  snippet: string;
  offset: number;
};

type PendingReply = {
  message_id: string;
  thread_id: string;
  draft: string;
  intent: string;
  created_at: number;
};

type OutboxState = "queued" | "sending" | "sent" | "failed";
type OutboxItem = {
  id: string;
  account_id: string;
  thread_id: string;
  recipient: string;
  content: string;
  created_at: number;
  last_attempt_at: number | null;
  attempt_count: number;
  last_error: string | null;
  state: OutboxState;
};

type OutboxSummary = {
  queued: number;
  sending: number;
  failed: number;
};

type CustomField = {
  id: string; // stable uuid
  key: string;
  type: "text" | "number" | "bool" | "date" | "tag";
  searchable: boolean;
  value: string; // normalized string form
};

type ContactMeta = {
  contact_id: string;
  display_name: string | null;
  alias: string | null;
  categories: string[];
  favorite: boolean;
  muted: boolean;
  icon: string | null;
  photo_path: string | null;
  apple_contact_id: string | null;
  custom_fields: CustomField[];
  updated_at: number;
};

type ContactMetaPatch = {
  display_name?: string | null;
  alias?: string | null;
  categories?: string[];
  favorite?: boolean;
  muted?: boolean;
  icon?: string | null;
  apple_contact_id?: string | null;
  custom_fields?: CustomField[];
};

type GroupMeta = {
  group_id: string;
  display_name: string | null;
  categories: string[];
  favorite: boolean;
  muted: boolean;
  icon: string | null;
  custom_fields: CustomField[];
  member_notes: string[];
  updated_at: number;
};

type GroupMetaPatch = {
  display_name?: string | null;
  categories?: string[];
  favorite?: boolean;
  muted?: boolean;
  icon?: string | null;
  custom_fields?: CustomField[];
  member_notes?: string[];
};

// -----------------------------
// Welcome visuals: WebGL wavy lines background
// -----------------------------
const vertexShaderSource = `
  attribute vec4 aVertexPosition;
  attribute vec2 aTextureCoord;
  varying vec2 vTextureCoord;
  void main() {
    gl_Position = aVertexPosition;
    vTextureCoord = aTextureCoord;
  }
`;

const fragmentShaderSource = `
  precision mediump float;
  uniform vec2 iResolution;
  uniform float iTime;
  uniform vec2 iMouse;
  varying vec2 vTextureCoord;

  #define PI 3.14159265359

  float hash(float n) { return fract(sin(n) * 43758.5453); }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i.x + i.y * 57.0);
    float b = hash(i.x + 1.0 + i.y * 57.0);
    float c = hash(i.x + i.y * 57.0 + 1.0);
    float d = hash(i.x + 1.0 + i.y * 57.0 + 1.0);
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float sum = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for(int i = 0; i < 6; i++) {
      sum += amp * noise(p * freq);
      amp *= 0.5;
      freq *= 2.0;
    }
    return sum;
  }

  float lines(vec2 uv, float thickness, float distortion) {
    float y = uv.y;
    float distortionAmount = distortion * fbm(vec2(uv.x * 2.0, y * 0.5 + iTime * 0.1));
    y += distortionAmount;
    float linePattern = fract(y * 20.0);
    float line = smoothstep(0.5 - thickness, 0.5, linePattern) -
                smoothstep(0.5, 0.5 + thickness, linePattern);
    return line;
  }

  void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    float aspect = iResolution.x / iResolution.y;
    uv.x *= aspect;

    vec2 mousePos = iMouse.xy;
    mousePos.x *= aspect;
    float mouseDist = length(uv - mousePos);
    float mouseInfluence = smoothstep(0.5, 0.0, mouseDist);

    float baseThickness = 0.05;
    float baseDistortion = 0.2;

    float thickness = mix(baseThickness, baseThickness * 1.5, mouseInfluence);
    float distortion = mix(baseDistortion, baseDistortion * 2.0, mouseInfluence);

    float line = lines(uv, thickness, distortion);

    float timeOffset = sin(iTime * 0.2) * 0.1;
    float animatedLine = lines(uv + vec2(timeOffset, 0.0), thickness, distortion);

    line = mix(line, animatedLine, 0.3);

    vec3 backgroundColor = vec3(0.0, 0.0, 0.0);
    vec3 lineColor = vec3(1.0, 1.0, 1.0);

    vec3 finalColor = mix(backgroundColor, lineColor, line);
    finalColor += vec3(0.1, 0.1, 0.1) * mouseInfluence * line;

    fragColor = vec4(finalColor, 1.0);
  }

  void main() {
    vec2 fragCoord = vTextureCoord * iResolution;
    vec4 color;
    mainImage(color, fragCoord);
    gl_FragColor = color;
  }
`;

function ShaderBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl");
    if (!gl) return;

    const createShader = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader) || "Shader compile error");
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertexShader = createShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(
      gl.FRAGMENT_SHADER,
      fragmentShaderSource
    );
    if (!vertexShader || !fragmentShader) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(program) || "Program link error");
      return;
    }

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
      gl.STATIC_DRAW
    );

    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      gl.STATIC_DRAW
    );

    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      new Uint16Array([0, 1, 2, 0, 2, 3]),
      gl.STATIC_DRAW
    );

    const positionLoc = gl.getAttribLocation(program, "aVertexPosition");
    const texCoordLoc = gl.getAttribLocation(program, "aTextureCoord");
    const resolutionLoc = gl.getUniformLocation(program, "iResolution");
    const timeLoc = gl.getUniformLocation(program, "iTime");
    const mouseLoc = gl.getUniformLocation(program, "iMouse");

    let mouseX = 0.5;
    let mouseY = 0.5;
    const onMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX / window.innerWidth;
      mouseY = 1 - e.clientY / window.innerHeight;
    };
    window.addEventListener("mousemove", onMouseMove);

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    window.addEventListener("resize", resize);
    resize();

    const startTime = Date.now();
    let rafId = 0;
    const render = () => {
      const time = (Date.now() - startTime) / 1000;
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);

      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(positionLoc);

      gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
      gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(texCoordLoc);

      gl.uniform2f(resolutionLoc, canvas.width, canvas.height);
      gl.uniform1f(timeLoc, time);
      gl.uniform2f(mouseLoc, mouseX, mouseY);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

      rafId = requestAnimationFrame(render);
    };
    rafId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      if (positionBuffer) gl.deleteBuffer(positionBuffer);
      if (texCoordBuffer) gl.deleteBuffer(texCoordBuffer);
      if (indexBuffer) gl.deleteBuffer(indexBuffer);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        display: "block",
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}

function avatarForAccount(id: string) {
  const letter = id.trim().charAt(0).toUpperCase() || "?";
  const colors = [
    "#38bdf8",
    "#a78bfa",
    "#22c55e",
    "#f472b6",
    "#f59e0b",
    "#eab308",
  ];
  const color = colors[id.length % colors.length];
  return (
    <div
      style={{
        width: 48,
        height: 48,
        borderRadius: "50%",
        background: color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#0b0d10",
        fontWeight: 800,
        fontSize: 18,
        boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
      }}
    >
      {letter}
    </div>
  );
}

function WelcomeOverlay({
  accounts,
  selectedAccount,
  onSelectAccount,
  onEnter,
  error,
}: {
  accounts: string[];
  selectedAccount: string | null;
  onSelectAccount: (id: string) => void;
  onEnter: () => void;
  error?: string | null;
}) {
  const canEnter = Boolean(selectedAccount);
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999,
        color: "#e5e7eb",
        overflow: "hidden",
      }}
    >
      <ShaderBackground />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 20% 20%, rgba(59,130,246,0.16), transparent 45%), radial-gradient(circle at 80% 30%, rgba(16,185,129,0.14), transparent 40%), linear-gradient(135deg, rgba(0,0,0,0.75), rgba(0,0,0,0.65))",
          backdropFilter: "blur(2px)",
        }}
      />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <div
          style={{
            maxWidth: 720,
            width: "100%",
            background: "rgba(15, 23, 42, 0.72)",
            border: "1px solid rgba(148, 163, 184, 0.2)",
            borderRadius: 18,
            boxShadow: "0 30px 80px rgba(0,0,0,0.45)",
            padding: 28,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <div
                style={{
                  fontSize: 13,
                  letterSpacing: 1,
                  color: "#9ca3af",
                  textTransform: "uppercase",
                }}
              >
                SignalX Desktop
              </div>
              <div style={{ fontSize: 34, fontWeight: 800, marginTop: 6 }}>
                Welcome.
              </div>
              <div style={{ marginTop: 8, color: "#cbd5e1", lineHeight: 1.5 }}>
                Threads hum quietly. Choose your presence, whisper the key, and
                step inside.
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 12,
              }}
            >
              {accounts.length === 0 ? (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid rgba(148, 163, 184, 0.14)",
                    background: "rgba(255,255,255,0.02)",
                    color: "#94a3b8",
                  }}
                >
                  No accounts detected yet. If you have `SIGNALX_NUMBER` set,
                  restart the app; otherwise link a Signal device first.
                </div>
              ) : (
                accounts.map((acc) => {
                  const selected = selectedAccount === acc;
                  return (
                    <div
                      key={acc}
                      onClick={() => onSelectAccount(acc)}
                      style={{
                        padding: 14,
                        borderRadius: 12,
                        border: selected
                          ? "1px solid #38bdf8"
                          : "1px solid rgba(148,163,184,0.14)",
                        background: selected
                          ? "rgba(14,165,233,0.12)"
                          : "rgba(255,255,255,0.02)",
                        cursor: "pointer",
                        display: "flex",
                        gap: 12,
                        alignItems: "center",
                        transition: "border 120ms, background 120ms",
                      }}
                    >
                      {avatarForAccount(acc)}
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>{acc}</div>
                        <div style={{ color: "#94a3b8", fontSize: 12 }}>
                          Tap to enter
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div
              style={{
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <div style={{ flex: 1, minWidth: 240 }}>
                {error ? (
                  <div style={{ fontSize: 12, color: "#fca5a5" }}>{error}</div>
                ) : (
                  <div style={{ fontSize: 12, color: "#9ca3af" }}>
                    Select an account above to continue.
                  </div>
                )}
              </div>
              <Button
                onClick={onEnter}
                disabled={!canEnter}
                variant="primary"
                size="lg"
                style={{
                  minWidth: 140,
                  background: !canEnter
                    ? undefined
                    : "linear-gradient(135deg, #0ea5e9, #22d3ee)",
                  boxShadow: !canEnter
                    ? "none"
                    : "0 10px 30px rgba(14,165,233,0.35)",
                }}
              >
                Enter
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function fmtTime(ts: number) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

export default function App() {
  const { toasts, dismissToast, showError, showSuccess, showInfo } = useToast();
  const log = logWithScope("App");
  const addLog = (msg: string) => log("info", msg);
  const [tauriAvailable, setTauriAvailable] = useState(isTauriAvailable());

  useEffect(() => {
    if (tauriAvailable) return;
    const timer = window.setInterval(() => {
      if (isTauriAvailable()) {
        setTauriAvailable(true);
        addLog("Tauri became available");
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [tauriAvailable]);

  const [accounts, setAccounts] = useState<string[]>([]);
  const [activeAccount, setActiveAccount] = useState<string | null>(null);
  const [welcomeAccount, setWelcomeAccount] = useState<string | null>(null);
  const [welcomeError, setWelcomeError] = useState<string | null>(null);

  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [composerText, setComposerText] = useState("");
  const [sending, setSending] = useState(false);

  // Initialize plugins
  usePlugins();
  
  // Notify plugins when thread selection changes
  usePluginThreadSelection(selectedThreadId);

  // Initialize automation
  useAutomation((draft) => {
    // When automation generates a draft, show it in the UI
    if (selectedThreadId && draft.threadId === selectedThreadId) {
      setComposerText(draft.content);
      showInfo(`Automation draft ready (confidence: ${(draft.confidence * 100).toFixed(0)}%)`);
    }
  });

  // Backend event listeners - Real-time updates from Rust backend
  useBackendEvents({
    onMessageSent: (event) => {
      log.info('Message sent successfully', event);
      addLog(`✓ Message sent to ${event.recipient}`);
    },
    onOutboxSendFailed: (event) => {
      log.warn('Message send failed', event);
      if (event.retry_count >= event.max_retries) {
        addLog(`✗ Message failed: ${event.error}`);
      }
    },
    onOutboxMovedToDLQ: (event) => {
      log.error('Message moved to DLQ', event);
      addLog(`⚠ Message failed permanently: ${event.reason}`);
    },
    onThreadsUpdated: async (threads) => {
      log.info('Threads updated from event', threads.length);
      setThreads(threads);
    },
    onMessageReceived: async (message) => {
      log.info('New message received', message);
      await refreshThreads();
      addLog('📨 New message received');
    },
  });

  const [aliases, setAliases] = useState<AliasMap>({});
  const [aliasNumber, setAliasNumber] = useState("");
  const [aliasValue, setAliasValue] = useState("");
  const [contactMeta, setContactMeta] = useState<Record<string, ContactMeta>>(
    {}
  );
  const [categories, setCategories] = useState<string[]>([]);
  const [groupMeta, setGroupMeta] = useState<Record<string, GroupMeta>>({});
  const [groupCategories, setGroupCategories] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Feature flags
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const fe = (key: string, def: boolean) => (features[key] ?? def);

  useEffect(() => {
    if (!tauriAvailable) {
      const devAccount = localStorage.getItem("signalx.dev.account");
      if (devAccount) {
        setAccounts([devAccount]);
        setActiveAccount(devAccount);
        addLog("Tauri unavailable; using dev account fallback");
      } else {
        setAccounts([]);
        setActiveAccount(null);
        addLog("Tauri unavailable; skipping backend boot");
      }
      return;
    }
    let unlisten: null | (() => void) = null;
    (async () => {
      try {
        const res: any = await invoke("get_feature_flags");
        const flags = (res?.ok?.flags ?? res?.flags ?? {}) as Record<string, boolean>;
        setFeatures(flags);
      } catch (err) {
        console.warn('Failed to load feature flags:', err);
      }
      try {
        const u = await listen<any>("features-updated", (e) => {
          const flags = (e?.payload?.flags ?? {}) as Record<string, boolean>;
          setFeatures(flags);
        });
        unlisten = u;
      } catch (err) {
        console.warn('Failed to set up feature flags listener:', err);
      }
    })();
    return () => {
      try { 
        if (unlisten) unlisten(); 
      } catch (err) {
        console.warn('Failed to cleanup feature flags listener:', err);
      }
    };
  }, []);

  const [settingsContactId, setSettingsContactId] = useState<string | null>(null);
  const [settingsGroupId, setSettingsGroupId] = useState<string | null>(null);
  const [newMessageOpen, setNewMessageOpen] = useState(false);
  const [newMessageNumber, setNewMessageNumber] = useState("");

  // Contacts tab filters/sort
  const [contactsSort, setContactsSort] = useState<"smart" | "name">("smart");
  const [filterFavoritesOnly, setFilterFavoritesOnly] = useState(false);
  const [filterUnreadOnly, setFilterUnreadOnly] = useState(false);
  const [filterShowMuted, setFilterShowMuted] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterHasPhoto, setFilterHasPhoto] = useState(false);
  const [filterHasAppleLink, setFilterHasAppleLink] = useState(false);

  // Groups tab filters/sort (minimal, matches step 4 chips)
  const [groupsSort, setGroupsSort] = useState<"smart" | "name">("smart");
  const [groupFilterFavoritesOnly, setGroupFilterFavoritesOnly] = useState(false);
  const [groupFilterUnreadOnly, setGroupFilterUnreadOnly] = useState(false);
  const [groupFilterShowMuted, setGroupFilterShowMuted] = useState(false);
  const [groupFilterCategory, setGroupFilterCategory] = useState<string>("");
  const [contactPhotoUrls, setContactPhotoUrls] = useState<Record<string, string>>(
    {}
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchResultsRef = useRef<HTMLDivElement | null>(null);

  const [aiIntent, setAiIntent] = useState("polite");
  const [aiConstraints, setAiConstraints] = useState("short, clear, no emojis");
  const [aiOutput, setAiOutput] = useState<string>("");

  const [exporting, setExporting] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportResult, setExportResult] = useState<{
    path: string;
    format: string;
    message_count: number;
  } | null>(null);
  const [pendingReplies, setPendingReplies] = useState<PendingReply[]>([]);
  const [outboxItems, setOutboxItems] = useState<OutboxItem[]>([]);
  const [outboxSummary, setOutboxSummary] = useState<OutboxSummary>({
    queued: 0,
    sending: 0,
    failed: 0,
  });
  const [draftHistory, setDraftHistory] = useState<PendingReply[]>([]);
  const [showWelcome, setShowWelcome] = useState(true);
  const { isActive: isOnboardingActive, nextStep: onboardingNextStep } = useOnboarding();
  const [searchSender, setSearchSender] = useState("");
  const [searchAfter, setSearchAfter] = useState("");
  const [searchBefore, setSearchBefore] = useState("");
  const [sidebarWidth, setSidebarWidth] = useState(340);
  const [dragging, setDragging] = useState<"sidebar" | "tools" | null>(null);
  const [, setDiagnostics] = useState<Diagnostics | null>(null);
  const [receiveState, setReceiveState] = useState<ReceiveLoopState | null>(
    null
  );
  // Step 4: keep diagnostics hidden (reintroduced in Step 5 via Developer Mode)
  const [toolsOpen, setToolsOpen] = useState(true);
  const [toolsWidth, setToolsWidth] = useState(360);
  const [aliasesOpen, setAliasesOpen] = useState(false);
  const [navTab, setNavTab] = useState<"contacts" | "groups" | "threads">(
    "contacts"
  );
  const [peopleQuery, setPeopleQuery] = useState("");
  const [peopleQueryDebounced, setPeopleQueryDebounced] = useState("");

  // Field filters (Contacts/Groups)
  const [contactFieldKey, setContactFieldKey] = useState("");
  const [contactFieldValue, setContactFieldValue] = useState("");
  const [contactFieldOpen, setContactFieldOpen] = useState(false);
  const [groupFieldKey, setGroupFieldKey] = useState("");
  const [groupFieldValue, setGroupFieldValue] = useState("");
  const [groupFieldOpen, setGroupFieldOpen] = useState(false);

  const unlistenRefs = useRef<(() => void)[]>([]);

  // Debounce people search (Contacts/Groups) to keep UI responsive.
  useEffect(() => {
    const id = window.setTimeout(() => {
      setPeopleQueryDebounced(peopleQuery);
    }, 200);
    return () => window.clearTimeout(id);
  }, [peopleQuery]);
  const selectedThreadIdRef = useRef<string | null>(null);
  const activeAccountRef = useRef<string | null>(null);

  useEffect(() => {
    selectedThreadIdRef.current = selectedThreadId;
  }, [selectedThreadId]);

  useEffect(() => {
    activeAccountRef.current = activeAccount;
  }, [activeAccount]);

  const getThreadName = (t: ThreadSummary): string => {
    const first = t.participants?.[0] || t.id;
    return aliases[first] || aliases[t.id] || first || t.id;
  };

  const isGroupThread = (t: ThreadSummary): boolean => {
    return t.id.startsWith("group:") || (t.participants || []).length > 2;
  };

  const toContactKey = (threadOrNumber: string): string => {
    const s = (threadOrNumber || "").trim();
    if (!s) return "";
    if (s.startsWith("dm:") || s.startsWith("group:")) return s;
    return `dm:${s}`;
  };

  const dmNumberFromKey = (contactKey: string): string => {
    return contactKey.startsWith("dm:") ? contactKey.slice(3) : contactKey;
  };

  const contactIdFromThread = (t: ThreadSummary): string => {
    // Prefer the non-self participant for 1:1 threads
    const ps = t.participants || [];
    const nonSelf = ps.find((p) =>
      activeAccount ? p !== activeAccount : true
    );
    const num = nonSelf || t.id;
    return toContactKey(num);
  };

  const contactsDerived = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string; // phone number
        alias?: string;
        unread_count: number;
        last_message_ts: number;
        thread_id: string | null; // most recent 1:1 thread id
      }
    >();

    for (const t of threads) {
      if (isGroupThread(t)) continue;
      const cid = contactIdFromThread(t);
      const prev = map.get(cid);
      const unread = (prev?.unread_count || 0) + (t.unread_count || 0);
      const last =
        prev?.last_message_ts && prev.last_message_ts > t.last_message_timestamp
          ? prev.last_message_ts
          : t.last_message_timestamp;
      const threadId =
        !prev?.thread_id || t.last_message_timestamp >= prev.last_message_ts
          ? t.id
          : prev.thread_id;
      map.set(cid, {
        id: cid,
        alias: aliases[dmNumberFromKey(cid)],
        unread_count: unread,
        last_message_ts: last || 0,
        thread_id: threadId,
      });
    }

    const list = Array.from(map.values()).sort(
      (a, b) => (b.last_message_ts || 0) - (a.last_message_ts || 0)
    );
    const q = peopleQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) => {
      const name = (c.alias || "").toLowerCase();
      return c.id.toLowerCase().includes(q) || name.includes(q);
    });
  }, [threads, aliases, activeAccount, peopleQuery]);

  const contactsMerged = useMemo(() => {
    // union: thread-derived + meta-only contacts
    const map = new Map<
      string,
      {
        id: string;
        alias?: string;
        unread_count: number;
        last_message_ts: number;
        thread_id: string | null;
        meta?: ContactMeta;
      }
    >();

    for (const c of contactsDerived) {
      map.set(c.id, { ...c, meta: contactMeta[c.id] });
    }

    for (const [cid, meta] of Object.entries(contactMeta)) {
      if (!map.has(cid)) {
        map.set(cid, {
          id: cid,
          alias: aliases[dmNumberFromKey(cid)],
          unread_count: 0,
          last_message_ts: 0,
          thread_id: null,
          meta,
        });
      } else {
        const prev = map.get(cid)!;
        map.set(cid, { ...prev, meta });
      }
    }

    return Array.from(map.values());
  }, [contactsDerived, contactMeta, aliases]);

  const contactFieldKeys = useMemo(() => {
    const set = new Set<string>();
    for (const meta of Object.values(contactMeta || {})) {
      for (const f of (meta?.custom_fields || []) as any[]) {
        const k = String(f?.key || "").trim();
        if (k) set.add(k);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [contactMeta]);

  const contactsForUi = useMemo(() => {
    const q = peopleQueryDebounced.trim().toLowerCase();

    const withDisplay = contactsMerged.map((c) => {
      const meta = c.meta;
      const display =
        meta?.display_name ||
        meta?.alias ||
        aliases[dmNumberFromKey(c.id)] ||
        c.alias ||
        dmNumberFromKey(c.id);
      return { ...c, display_name: display, meta: meta || null };
    });

    const matchesQuery = (c: any) => {
      if (!q) return true;
      const meta = c.meta as ContactMeta | null;
      const searchableFields = (meta?.custom_fields || [])
        .filter((f: any) => f.searchable ?? f.is_searchable)
        .map((f) => `${f.key} ${f.value}`)
        .join(" ");
      const hay = [
        c.display_name || "",
        c.id || "",
        meta?.display_name || "",
        meta?.alias || "",
        (meta?.categories || []).join(" "),
        searchableFields,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    };

    let out = withDisplay.filter(matchesQuery);

    // Filters
    out = out.filter((c: any) => {
      const meta = c.meta as ContactMeta | null;
      if (filterFavoritesOnly && !meta?.favorite) return false;
      if (filterUnreadOnly && !(c.unread_count > 0)) return false;
      if (!filterShowMuted && meta?.muted) return false;
      if (filterCategory) {
        const cats = meta?.categories || [];
        if (!cats.includes(filterCategory)) return false;
      }
      if (filterHasPhoto && !meta?.photo_path) return false;
      if (filterHasAppleLink && !meta?.apple_contact_id) return false;
      if (contactFieldKey.trim() || contactFieldValue.trim()) {
        const fk = contactFieldKey.trim().toLowerCase();
        const fv = contactFieldValue.trim().toLowerCase();
        const fields = (meta?.custom_fields || []) as any[];
        const ok = fields.some((f) => {
          const k = String(f?.key || "").toLowerCase();
          const v = String(f?.value ?? "").toLowerCase();
          if (fk && !k.includes(fk)) return false;
          if (fv && !v.includes(fv)) return false;
          return true;
        });
        if (!ok) return false;
      }
      return true;
    });

    // Sort
    const byName = (a: any, b: any) =>
      String(a.display_name || "").localeCompare(String(b.display_name || ""));
    const byLast = (a: any, b: any) => (b.last_message_ts || 0) - (a.last_message_ts || 0);
    const byUnread = (a: any, b: any) => (b.unread_count || 0) - (a.unread_count || 0);
    const byFav = (a: any, b: any) => {
      const af = a.meta?.favorite ? 1 : 0;
      const bf = b.meta?.favorite ? 1 : 0;
      return bf - af;
    };

    // Always float favorites to the top, even in name sort
    if (contactsSort === "name") out.sort((a, b) => byFav(a, b) || byName(a, b));
    else out.sort((a, b) => (byFav(a, b) || byUnread(a, b) || byLast(a, b)));

    return out;
  }, [
    contactsMerged,
    aliases,
    peopleQueryDebounced,
    contactsSort,
    filterFavoritesOnly,
    filterUnreadOnly,
    filterShowMuted,
    filterCategory,
    filterHasPhoto,
    filterHasAppleLink,
    contactFieldKey,
    contactFieldValue,
  ]);

  const groupFieldKeys = useMemo(() => {
    const set = new Set<string>();
    for (const meta of Object.values(groupMeta || {})) {
      for (const f of (meta?.custom_fields || []) as any[]) {
        const k = String(f?.key || "").trim();
        if (k) set.add(k);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [groupMeta]);

  const groupsDerived = useMemo(() => {
    const list = threads
      .filter((t) => isGroupThread(t))
      .map((t) => {
        const meta = groupMeta[t.id];
        const name = meta?.display_name || aliases[t.id] || "Group chat";
        const icon = meta?.icon || null;
        const members = (t.participants || []).length;
        return {
          id: t.id,
          name,
          icon,
          members,
          unread_count: t.unread_count || 0,
          last_message_ts: t.last_message_timestamp || 0,
          meta: meta || null,
        };
      })
      .filter((g) => {
        if (groupFilterFavoritesOnly && !g.meta?.favorite) return false;
        if (groupFilterUnreadOnly && !(g.unread_count > 0)) return false;
        if (!groupFilterShowMuted && g.meta?.muted) return false;
        if (groupFilterCategory) {
          const cats = g.meta?.categories || [];
          if (!cats.includes(groupFilterCategory)) return false;
        }
        if (groupFieldKey.trim() || groupFieldValue.trim()) {
          const fk = groupFieldKey.trim().toLowerCase();
          const fv = groupFieldValue.trim().toLowerCase();
          const fields = (g.meta?.custom_fields || []) as any[];
          const ok = fields.some((f) => {
            const k = String(f?.key || "").toLowerCase();
            const v = String(f?.value ?? "").toLowerCase();
            if (fk && !k.includes(fk)) return false;
            if (fv && !v.includes(fv)) return false;
            return true;
          });
          if (!ok) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const byName = String(a.name || "").localeCompare(String(b.name || ""));
        const byLast = (b.last_message_ts || 0) - (a.last_message_ts || 0);
        const byUnread = (b.unread_count || 0) - (a.unread_count || 0);
        const byFav = (b.meta?.favorite ? 1 : 0) - (a.meta?.favorite ? 1 : 0);
        // Always float favorites to the top, even in name sort
        if (groupsSort === "name") return byFav || byName;
        return byFav || byUnread || byLast;
      });

    const q = peopleQueryDebounced.trim().toLowerCase();
    if (!q) return list;
    return list.filter((g) => {
      const meta = g.meta as any | null;
      const searchableFields = ((meta?.custom_fields || []) as any[])
        .filter((f) => f.searchable ?? f.is_searchable)
        .map((f) => `${f.key} ${f.value}`)
        .join(" ");
      const hay = [
        g.name,
        g.id,
        meta?.display_name || "",
        (meta?.categories || []).join(" "),
        searchableFields,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [
    threads,
    aliases,
    peopleQueryDebounced,
    groupMeta,
    groupsSort,
    groupFilterFavoritesOnly,
    groupFilterUnreadOnly,
    groupFilterShowMuted,
    groupFilterCategory,
    groupFieldKey,
    groupFieldValue,
  ]);

  const refreshDiagnostics = async () => {
    try {
      const d = await unwrap<Diagnostics>(
        invoke("get_diagnostics"),
        "get_diagnostics"
      );
      setDiagnostics(d);
    } catch (e: any) {
      addLog(String(e?.message || e));
    }
  };

  const refreshReceiveLoopState = async () => {
    try {
      const s = await unwrap<ReceiveLoopState>(
        invoke("get_receive_loop_state"),
        "get_receive_loop_state"
      );
      setReceiveState(s);
    } catch (e: any) {
      addLog(String(e?.message || e));
    }
  };

  const refreshThreads = async () => {
    try {
      const t = await unwrap<ThreadSummary[]>(
        invoke("get_threads"),
        "get_threads"
      );
      setThreads(t);
    } catch (e: any) {
      addLog(String(e?.message || e));
    }
  };

  const refreshAliases = async () => {
    try {
      const a = await unwrap<AliasMap>(invoke("list_aliases"), "list_aliases");
      setAliases(a || {});
    } catch (e: any) {
      addLog(String(e?.message || e));
    }
  };

  const refreshContactMeta = async () => {
    try {
      const list = await unwrap<ContactMeta[]>(
        invoke("list_contact_meta"),
        "list_contact_meta"
      );
      const map: Record<string, ContactMeta> = {};
      for (const c of list || []) {
        map[c.contact_id] = c;
      }
      setContactMeta(map);
    } catch (e: any) {
      addLog(String(e?.message || e));
      setContactMeta({});
    }
  };

  const refreshCategories = async () => {
    try {
      const cats = await unwrap<string[]>(
        invoke("list_categories"),
        "list_categories"
      );
      setCategories(cats || []);
    } catch (e: any) {
      addLog(String(e?.message || e));
      setCategories([]);
    }
  };

  const refreshGroupMeta = async () => {
    try {
      const list = await unwrap<GroupMeta[]>(
        invoke("list_group_meta"),
        "list_group_meta"
      );
      const map: Record<string, GroupMeta> = {};
      for (const g of list || []) {
        map[g.group_id] = g;
      }
      setGroupMeta(map);
    } catch (e: any) {
      addLog(String(e?.message || e));
      setGroupMeta({});
    }
  };

  const refreshGroupCategories = async () => {
    try {
      const cats = await unwrap<string[]>(
        invoke("list_group_categories"),
        "list_group_categories"
      );
      setGroupCategories(cats || []);
    } catch (e: any) {
      addLog(String(e?.message || e));
      setGroupCategories([]);
    }
  };

  const upsertContactMeta = async (contactId: string, patch: ContactMetaPatch) => {
    await unwrap<ContactMeta>(
      invoke("set_contact_meta", { contactId, patch }),
      "set_contact_meta"
    );
    await refreshContactMeta();
    await refreshCategories();
  };

  const deleteContactMeta = async (contactId: string) => {
    await unwrap<boolean>(
      invoke("delete_contact_meta", { contactId }),
      "delete_contact_meta"
    );
    await refreshContactMeta();
    await refreshCategories();
  };

  const uploadContactPhoto = async (contactId: string, bytes: number[], ext: string) => {
    await unwrap<ContactMeta>(
      invoke("set_contact_photo", { contactId, bytes, ext }),
      "set_contact_photo"
    );
    await refreshContactMeta();
  };

  const removeContactPhoto = async (contactId: string) => {
    await unwrap<ContactMeta>(
      invoke("clear_contact_photo", { contactId }),
      "clear_contact_photo"
    );
    await refreshContactMeta();
  };

  const linkAppleStub = async (contactId: string, appleContactId: string) => {
    await unwrap<ContactMeta>(
      invoke("link_apple_contact_stub", { contactId, appleContactId }),
      "link_apple_contact_stub"
    );
    await refreshContactMeta();
  };

  const unlinkAppleStub = async (contactId: string) => {
    await unwrap<ContactMeta>(
      invoke("unlink_apple_contact_stub", { contactId }),
      "unlink_apple_contact_stub"
    );
    await refreshContactMeta();
  };

  const setContactMuted = async (contactId: string, muted: boolean) => {
    await upsertContactMeta(contactId, { muted });
  };

  const createContact = async (contactId: string) => {
    await upsertContactMeta(contactId, {});
  };

  const setPhotoUrlFor = (contactId: string, url: string | null) => {
    setContactPhotoUrls((prev) => {
      const next = { ...prev };
      const old = next[contactId];
      if (old && old !== url) {
        try {
          URL.revokeObjectURL(old);
        } catch {}
      }
      if (!url) {
        delete next[contactId];
      } else {
        next[contactId] = url;
      }
      return next;
    });
  };

  const ensureContactPhotoCached = async (contactId: string) => {
    try {
      const res = await unwrap<{ bytes_base64: string; mime: string } | null>(
        invoke("read_contact_photo", { contactId }),
        "read_contact_photo"
      );
      if (!res) {
        setPhotoUrlFor(contactId, null);
        return;
      }
      const binStr = atob(res.bytes_base64 || "");
      const bytes = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
      const blob = new Blob([bytes], { type: res.mime || "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      setPhotoUrlFor(contactId, url);
    } catch {
      // ignore; keep avatar fallback
      setPhotoUrlFor(contactId, null);
    }
  };

  useEffect(() => {
    // cache photos for currently visible contacts (lightweight heuristic)
    const ids = contactsForUi
      .map((c: any) => c.id)
      .filter((id: string) => {
        const meta = contactMeta[id];
        return !!meta?.photo_path;
      })
      .slice(0, 80);
    for (const id of ids) {
      if (!contactPhotoUrls[id]) {
        ensureContactPhotoCached(id);
      }
    }
    // cleanup removed contacts
    for (const id of Object.keys(contactPhotoUrls)) {
      if (!contactMeta[id]?.photo_path) {
        setPhotoUrlFor(id, null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactsForUi, contactMeta]);

  const refreshPendingReplies = async (threadId: string) => {
    try {
      const replies = await unwrap<PendingReply[]>(
        invoke("get_pending_replies", { threadId }),
        "get_pending_replies"
      );
      setPendingReplies(replies || []);
    } catch (e: any) {
      addLog(String(e?.message || e));
      setPendingReplies([]);
    }
  };

  const refreshDraftHistory = async (threadId: string) => {
    try {
      const hist = await unwrap<PendingReply[]>(
        invoke("get_draft_history", { threadId }),
        "get_draft_history"
      );
      setDraftHistory(hist || []);
    } catch (e: any) {
      addLog(String(e?.message || e));
      setDraftHistory([]);
    }
  };

  const refreshOutbox = async (threadId: string) => {
    try {
      const items = await unwrap<OutboxItem[]>(
        invoke("list_outbox", { threadId }),
        "list_outbox"
      );
      setOutboxItems(items || []);
    } catch (e: any) {
      addLog(String(e?.message || e));
      setOutboxItems([]);
    }
  };

  const refreshOutboxSummary = async () => {
    try {
      const s = await unwrap<OutboxSummary>(
        invoke("get_outbox_state_summary"),
        "get_outbox_state_summary"
      );
      setOutboxSummary(s || { queued: 0, sending: 0, failed: 0 });
    } catch (e: any) {
      addLog(String(e?.message || e));
      setOutboxSummary({ queued: 0, sending: 0, failed: 0 });
    }
  };

  const loadThreadMessages = async (threadId: string) => {
    try {
      setExportMenuOpen(false);
      const m = await unwrap<Message[]>(
        invoke("get_thread_messages", { threadId }),
        "get_thread_messages"
      );
      setMessages(m);
      setSelectedThreadId(threadId);
      await unwrap<boolean>(
        invoke("mark_thread_read", { threadId }),
        "mark_thread_read"
      );
      await refreshThreads();
      await refreshPendingReplies(threadId);
      await refreshDraftHistory(threadId);
      await refreshOutbox(threadId);
    } catch (e: any) {
      addLog(String(e?.message || e));
      // Allow "empty conversation" for contacts/groups with no persisted thread yet.
      setSelectedThreadId(threadId);
      setMessages([]);
      await refreshPendingReplies(threadId);
      await refreshDraftHistory(threadId);
      await refreshOutbox(threadId);
    }
  };

  const boot = async () => {
    addLog("Boot…");
    try {
      const a = await unwrap<string[]>(
        invoke("list_accounts"),
        "list_accounts"
      );
      setAccounts(a || []);
      if (!welcomeAccount && (a || []).length === 1) {
        setWelcomeAccount((a || [])[0] || null);
      }
      const active = await unwrap<{ account_id: string | null }>(
        invoke("get_active_account"),
        "get_active_account"
      );
      setActiveAccount(active.account_id);
      await refreshThreads();
      await refreshAliases();
      await refreshContactMeta();
      await refreshCategories();
      await refreshGroupMeta();
      await refreshGroupCategories();
      await refreshOutboxSummary();
      await refreshDiagnostics();
      await refreshReceiveLoopState();
      addLog("Boot OK");
    } catch (e: any) {
      addLog(String(e?.message || e));
    }
  };

  useEffect(() => {
    if (!tauriAvailable) return;
    boot();
    // listeners
    (async () => {
      try {
        const u1 = await listen<Message>("message-received", async (event) => {
          const msg = event.payload;
          addLog(`event message-received: ${msg.thread_id} ${msg.id}`);
          
          const cur = selectedThreadIdRef.current;
          
          // If currently viewing this thread, reload its messages immediately for real-time display
          if (cur && msg.thread_id === cur) {
            // Add message optimistically for immediate UI update
            setMessages((prev) => {
              // Check if message already exists (avoid duplicates)
              const exists = prev.some((m) => m.id === msg.id);
              if (exists) return prev;
              return [...prev, msg];
            });
            // Then reload from backend for canonical state
            await loadThreadMessages(cur);
          } else {
            // For background threads, just refresh thread list to update unread counts
            // This is more efficient than loading all messages
            await refreshThreads();
            
            // Show notification for messages in other threads
            if (msg.sender && msg.content) {
              const senderName = msg.sender;
              const preview = msg.content.length > 50 
                ? msg.content.substring(0, 50) + "..." 
                : msg.content;
              showInfo(`New message from ${senderName}: ${preview}`);
            }
          }
        });
        const u2 = await listen<Message>("message-sent", async (event) => {
          const msg = event.payload;
          addLog(`event message-sent: ${msg.thread_id} ${msg.id}`);
          const cur = selectedThreadIdRef.current;
          
          // Remove any optimistic messages for this thread
          setMessages((prev) => prev.filter((m) => !m.id.startsWith("temp-")));
          
          if (cur && msg.thread_id === cur) {
            // Reload messages to get the real message from backend
            await loadThreadMessages(cur);
          } else {
            // Still refresh threads to update unread counts, etc.
            await refreshThreads();
          }
        });
        const u3 = await listen<AccountChangedPayload>(
          "account-changed",
          async (event) => {
          const { account_id } = event.payload;
          addLog(`event account-changed: ${account_id}`);
          
          // Clean up all state related to the previous account
          setActiveAccount(account_id);
          setSelectedThreadId(null);
          setMessages([]);
          setPendingReplies([]);
          setDraftHistory([]);
          setOutboxItems([]);
          setExportMenuOpen(false);
          setComposerText(""); // Clear composer
          setSearchResults([]); // Clear search results
          setContactPhotoUrls({}); // Clear photo cache
          
          // Update refs immediately for consistency
          selectedThreadIdRef.current = null;
          activeAccountRef.current = account_id;
          
          // Refresh all data for the new account
          try {
            await Promise.all([
              refreshThreads(),
              refreshAliases(),
              refreshContactMeta(),
              refreshCategories(),
              refreshGroupMeta(),
              refreshGroupCategories(),
              refreshOutboxSummary(),
              refreshDiagnostics(),
              refreshReceiveLoopState(),
            ]);
          } catch (e: any) {
            addLog(`Error refreshing data after account change: ${e?.message || e}`);
            // Continue even if some refreshes fail
          }
          }
        );
        const u4 = await listen<any>("outbox-updated", async (event) => {
          const payload = (event.payload || {}) as any;
          const accountId = String(payload.account_id || "");
          const threadId = payload.thread_id ? String(payload.thread_id) : null;
          const summary = payload.summary as OutboxSummary | undefined;

          if (summary) {
            setOutboxSummary(summary);
          } else {
            await refreshOutboxSummary();
          }

          const curAccount = activeAccountRef.current;
          if (curAccount && accountId && curAccount !== accountId) {
            return;
          }

          const curThread = selectedThreadIdRef.current;
          if (threadId && curThread && threadId === curThread) {
            await refreshOutbox(threadId);
          }
        });

        const u5 = await listen<OutboxItem>("outbox-item-updated", async (event) => {
          const item = event.payload;
          if (!item) return;
          const curAccount = activeAccountRef.current;
          if (curAccount && item.account_id && item.account_id !== curAccount) {
            return;
          }
          const curThread = selectedThreadIdRef.current;
          if (curThread && item.thread_id === curThread) {
            await refreshOutbox(curThread);
          }
          await refreshOutboxSummary();
        });

        const u6 = await listen<any>("contact-meta-updated", async (event) => {
          const payload = (event.payload || {}) as any;
          const contact_id = String(payload.contact_id || "").trim();
          if (!contact_id) return;
          if (payload.deleted) {
            setContactMeta((prev) => {
              const next = { ...(prev || {}) };
              delete next[contact_id];
              return next;
            });
            await refreshCategories();
            return;
          }
          try {
            const m = await unwrap<ContactMeta | null>(
              invoke("get_contact_meta", { contactId: contact_id }),
              "get_contact_meta"
            );
            if (m) {
              setContactMeta((prev) => ({ ...(prev || {}), [m.contact_id]: m }));
            } else {
              setContactMeta((prev) => {
                const next = { ...(prev || {}) };
                delete next[contact_id];
                return next;
              });
            }
            await refreshCategories();
          } catch {
            // ignore
          }
        });

        const u7 = await listen<any>("group-meta-updated", async (event) => {
          const payload = (event.payload || {}) as any;
          const group_id = String(payload.group_id || "").trim();
          if (!group_id) return;
          if (payload.deleted) {
            setGroupMeta((prev) => {
              const next = { ...(prev || {}) };
              delete next[group_id];
              return next;
            });
            await refreshGroupCategories();
            return;
          }
          try {
            const m = await unwrap<GroupMeta | null>(
              invoke("get_group_meta", { groupId: group_id }),
              "get_group_meta"
            );
            if (m) {
              setGroupMeta((prev) => ({ ...(prev || {}), [m.group_id]: m }));
            } else {
              setGroupMeta((prev) => {
                const next = { ...(prev || {}) };
                delete next[group_id];
                return next;
              });
            }
            await refreshGroupCategories();
          } catch {
            // ignore
          }
        });

        unlistenRefs.current.push(u1, u2, u3, u4, u5, u6, u7);
      } catch (e: any) {
        addLog(`listen error: ${String(e?.message || e)}`);
      }
    })();

    return () => {
      for (const u of unlistenRefs.current) u();
      unlistenRefs.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lightweight periodic diagnostics refresh (NOT receive polling)
  useEffect(() => {
    const id = window.setInterval(() => {
      refreshReceiveLoopState();
    }, 5000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Diagnostics/Debug entry points are removed in Step 4 (reintroduced in Step 5 via Developer Mode).

  useEffect(() => {
    if (selectedThreadId) {
      setShowWelcome(false);
    }
  }, [selectedThreadId]);

  // Resizable layout handlers (sidebar + Tools panel)
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      const total = window.innerWidth;
      const minSidebar = 240;
      const minTools = 320;
      const handleWidth = 12; // account for resizer(s)
      if (dragging === "sidebar") {
        const maxSidebar =
          total - (toolsOpen ? toolsWidth : 0) - minTools - handleWidth;
        const next = Math.min(
          Math.max(e.clientX, minSidebar),
          Math.max(minSidebar, maxSidebar)
        );
        setSidebarWidth(next);
      } else if (dragging === "tools") {
        const fromRight = total - e.clientX;
        const maxTools = Math.min(520, Math.max(320, Math.floor(total * 0.45)));
        const next = Math.min(Math.max(fromRight, minTools), maxTools);
        setToolsWidth(next);
      }
    };
    const onUp = () => setDragging(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, sidebarWidth, toolsOpen, toolsWidth]);

  const onAccountChange = async (accountId: string) => {
    try {
      await unwrap<boolean>(
        invoke("set_active_account", { accountId }),
        "set_active_account"
      );
      // backend emits account-changed; UI updates via listener
    } catch (e: any) {
      addLog(String(e?.message || e));
    }
  };

  const sendMessage = async () => {
    if (!selectedThreadId) {
      showError("Please select a conversation first");
      return;
    }
    const text = composerText.trim();
    if (!text) {
      showError("Message cannot be empty");
      return;
    }

    // Optimistic UI update: add message to UI immediately
    const optimisticMessage: Message = {
      id: `temp-${Date.now()}`,
      thread_id: selectedThreadId,
      timestamp: Date.now(),
      sender: activeAccountRef.current || "",
      recipient: null,
      content: text,
      direction: "Outgoing",
    };
    setMessages((prev) => [...prev, optimisticMessage]);
    setComposerText("");
    setSending(true);

    try {
      const result = await unwrap<any>(
        invoke("queue_outgoing_message", {
          threadId: selectedThreadId,
          recipient: "",
          content: text,
        }),
        "queue_outgoing_message"
      );
      
      // Refresh outbox to show queued message
      await refreshOutbox(selectedThreadId);
      await refreshOutboxSummary();
      
      showSuccess("Message queued for sending");
      addLog("Queued message for send");
      
      // The message-sent event will update the UI with the real message
      // Remove optimistic message when real one arrives
    } catch (e: any) {
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMessage.id));
      
      const errorMsg = getUserFriendlyMessage(e);
      
      // Enhanced error handling for specific error types
      if (errorMsg.toLowerCase().includes("thread_id") || errorMsg.toLowerCase().includes("thread")) {
        showError("Invalid conversation. Please select a valid conversation.");
      } else if (errorMsg.toLowerCase().includes("account") || errorMsg.toLowerCase().includes("active")) {
        showError("No active account. Please select an account first.");
      } else if (errorMsg.toLowerCase().includes("network") || errorMsg.toLowerCase().includes("connection")) {
        showError("Network error. Message will be retried automatically.");
      } else {
        showError(`Failed to send message: ${errorMsg}`);
      }
      
      addLog(`Send error: ${errorMsg}`);
      // Restore text to composer on error
      setComposerText(text);
    } finally {
      setSending(false);
    }
  };

  const enqueueSendText = async (threadId: string, text: string) => {
    const msg = text.trim();
    if (!msg) return;
    await unwrap<any>(
      invoke("queue_outgoing_message", {
        threadId,
        recipient: "",
        content: msg,
      }),
      "queue_outgoing_message"
    );
  };

  const setAlias = async () => {
    const num = aliasNumber.trim();
    const al = aliasValue.trim();
    if (!num || !al) return;
    try {
      await unwrap<boolean>(
        invoke("set_alias", { number: num, alias: al }),
        "set_alias"
      );
      setAliasNumber("");
      setAliasValue("");
      await refreshAliases();
    } catch (e: any) {
      addLog(String(e?.message || e));
    }
  };

  const doSearch = async () => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await unwrap<SearchResult[]>(
        invoke("search_messages", {
          query: q,
          limit: 50,
          threadId: null,
          sender: searchSender.trim() || null,
          afterTs: searchAfter ? Number(searchAfter) : null,
          beforeTs: searchBefore ? Number(searchBefore) : null,
        }),
        "search_messages"
      );
      setSearchResults(res || []);
      if (res && res.length === 0) {
        showInfo("No messages found");
      }
    } catch (e: any) {
      const errorMsg = getUserFriendlyMessage(e);
      showError(`Search failed: ${errorMsg}`);
      addLog(`Search error: ${errorMsg}`);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    const t = window.setTimeout(() => doSearch(), 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const openSearchResult = async (r: SearchResult) => {
    await loadThreadMessages(r.thread_id);
    // Jump-to-message
    const el = document.getElementById(`msg-${r.message_id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.animate(
        [
          { boxShadow: "0 0 0 rgba(0,0,0,0)" },
          { boxShadow: "0 0 0 2px #38bdf8" },
          { boxShadow: "0 0 0 rgba(0,0,0,0)" },
        ],
        {
          duration: 1200,
          easing: "ease-out",
        }
      );
    }
  };

  const aiSummarize = async () => {
    if (!selectedThreadId) return;
    try {
      const out = await unwrap<string>(
        invoke("summarize_thread", { threadId: selectedThreadId, lastN: 50 }),
        "summarize_thread"
      );
      setAiOutput(out);
    } catch (e: any) {
      addLog(String(e?.message || e));
    }
  };

  const aiDraft = async () => {
    if (!selectedThreadId) return;
    try {
      const out = await unwrap<string>(
        invoke("draft_reply", {
          threadId: selectedThreadId,
          intent: aiIntent,
          constraints: aiConstraints,
          lastN: 50,
        }),
        "draft_reply"
      );
      setAiOutput(out);
      setComposerText(out);
    } catch (e: any) {
      addLog(String(e?.message || e));
    }
  };

  const exportThread = async (format: "txt" | "json") => {
    if (!selectedThreadId) return;
    setExportMenuOpen(false);
    setExporting(true);
    setExportResult(null);
    try {
      const result = await unwrap<{
        path: string;
        format: string;
        message_count: number;
      }>(
        invoke("export_thread", {
          threadId: selectedThreadId,
          format,
          fromTs: null,
          toTs: null,
        }),
        "export_thread"
      );
      setExportResult(result);
      addLog(`Exported ${result.message_count} messages to ${result.path}`);
      showSuccess(
        `Exported ${
          result.message_count
        } messages (${result.format.toUpperCase()}) to ${result.path}`
      );
    } catch (e: any) {
      addLog(String(e?.message || e));
    } finally {
      setExporting(false);
    }
  };

  const openExportFolder = async (filePath: string) => {
    try {
      // Extract directory from file path
      const dirPath = filePath.substring(0, filePath.lastIndexOf("/"));
      // Use Tauri command to open folder (macOS: open command)
      await invoke("open_path", { path: dirPath });
    } catch (e: any) {
      addLog(`Failed to open folder: ${e?.message || e}`);
    }
  };

  const dismissDraft = async (messageId: string) => {
    if (!selectedThreadId) return;
    try {
      await unwrap<{ consumed: boolean }>(
        invoke("mark_pending_reply_consumed", {
          threadId: selectedThreadId,
          messageId,
        }),
        "mark_pending_reply_consumed"
      );
      await refreshPendingReplies(selectedThreadId);
    } catch (e: any) {
      addLog(String(e?.message || e));
    }
  };

  const useDraft = async (draft: PendingReply) => {
    setComposerText(draft.draft);
    setShowWelcome(false);
    if (selectedThreadId) {
      await dismissDraft(draft.message_id);
    }
  };

  const useAndSendDraft = async (draft: PendingReply) => {
    if (!selectedThreadId) return;
    const threadId = selectedThreadId;
    const msg = (draft.draft || "").trim();
    if (!msg) return;

    setSending(true);
    try {
      // Don't rely on React state updates for the message content.
      // Also: only consume the pending draft after we successfully enqueue the send.
      await enqueueSendText(threadId, msg);
      setComposerText("");
      await dismissDraft(draft.message_id);
      addLog("Queued message for send (from agent draft)");
    } catch (e: any) {
      addLog(String(e?.message || e));
    } finally {
      setSending(false);
    }
  };

  const retryOutbox = async (item: OutboxItem) => {
    try {
      await unwrap<any>(
        invoke("retry_outbox_item", {
          id: item.id,
        }),
        "retry_outbox_item"
      );
      await refreshOutbox(item.thread_id);
      await refreshOutboxSummary();
    } catch (e: any) {
      addLog(String(e?.message || e));
    }
  };

  const deleteOutbox = async (item: OutboxItem) => {
    try {
      await unwrap<any>(
        invoke("delete_outbox_item", {
          id: item.id,
        }),
        "delete_outbox_item"
      );
      await refreshOutbox(item.thread_id);
      await refreshOutboxSummary();
    } catch (e: any) {
      addLog(String(e?.message || e));
    }
  };

  const selectedThread = useMemo(
    () => threads.find((t) => t.id === selectedThreadId) || null,
    [threads, selectedThreadId]
  );

  const failedOutboxForSelected = useMemo(() => {
    if (!selectedThreadId) return [];
    return (outboxItems || []).filter((o) => o.state === "failed");
  }, [outboxItems, selectedThreadId]);

  const retryFailedForSelected = async () => {
    for (const it of failedOutboxForSelected) {
      await retryOutbox(it);
    }
  };

  // Enhanced health badge calculation
  const healthStatus = useMemo(() => {
    if (!receiveState) {
      return {
        status: "unknown",
        color: "#9ca3af",
        label: "Unknown",
        tooltip: "No receive state available",
      };
    }

    const now = Date.now();

    // Check cooldown first
    if (receiveState.cooldown_until && now < receiveState.cooldown_until) {
      const remaining = Math.ceil((receiveState.cooldown_until - now) / 1000);
      return {
        status: "cooldown",
        color: "#f59e0b",
        label: "Cooldown",
        tooltip: `In cooldown for ${remaining}s\nFailures: ${
          receiveState.consecutive_failures
        }\nBackoff: ${receiveState.backoff_ms}ms\n${
          receiveState.last_receive_error
            ? `Error: ${receiveState.last_receive_error}`
            : ""
        }`,
      };
    }

    // Check for failures
    if (receiveState.consecutive_failures > 0) {
      return {
        status: "error",
        color: "#ef4444",
        label: `Error (${receiveState.consecutive_failures})`,
        tooltip: `Consecutive failures: ${
          receiveState.consecutive_failures
        }\nBackoff: ${receiveState.backoff_ms}ms\n${
          receiveState.last_receive_error
            ? `Error: ${receiveState.last_receive_error}`
            : "No error message"
        }`,
      };
    }

    // Check time since last success
    if (!receiveState.last_receive_ok_at) {
      return {
        status: "idle",
        color: "#9ca3af",
        label: "Idle",
        tooltip: "No receive activity yet\nBackoff: 0ms",
      };
    }

    const timeSinceLastSuccess = now - receiveState.last_receive_ok_at;
    const secondsAgo = Math.floor(timeSinceLastSuccess / 1000);

    if (timeSinceLastSuccess < 15000) {
      // < 15 seconds: Green
      return {
        status: "healthy",
        color: "#10b981",
        label: "Healthy",
        tooltip: `Last success: ${secondsAgo}s ago\nBackoff: ${receiveState.backoff_ms}ms\nFailures: 0`,
      };
    } else if (timeSinceLastSuccess < 60000) {
      // 15-60 seconds: Yellow
      return {
        status: "degraded",
        color: "#f59e0b",
        label: "Degraded",
        tooltip: `Last success: ${secondsAgo}s ago\nBackoff: ${receiveState.backoff_ms}ms\nFailures: 0`,
      };
    } else {
      // > 60 seconds: Red
      return {
        status: "stale",
        color: "#ef4444",
        label: "Stale",
        tooltip: `Last success: ${secondsAgo}s ago\nBackoff: ${
          receiveState.backoff_ms
        }ms\nFailures: 0\n${
          receiveState.last_receive_error
            ? `Last error: ${receiveState.last_receive_error}`
            : ""
        }`,
      };
    }
  }, [receiveState]);

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        background: "#0b0d10",
        color: "#e5e7eb",
        fontFamily: "system-ui",
        overflow: "hidden",
      }}
    >
      {/* Accessibility: Skip Navigation Links */}
      <SkipLink href="#sidebar">Skip to sidebar</SkipLink>
      <SkipLink href="#main-content">Skip to main content</SkipLink>
      <SkipLink href="#message-composer">Skip to message composer</SkipLink>

      {/* Sidebar */}
      <div
        id="sidebar"
        style={{
          width: sidebarWidth,
          minWidth: 240,
          borderRight: "1px solid #1f2937",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: 12, borderBottom: "1px solid #1f2937" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <div style={{ fontWeight: 700 }}>SignalX</div>
            {outboxSummary.queued + outboxSummary.failed > 0 ? (
              <div
                title={`Outbox: ${outboxSummary.queued} queued, ${outboxSummary.failed} failed`}
                style={{
                  fontSize: 12,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: "#0f172a",
                  color: outboxSummary.failed > 0 ? "#fca5a5" : "#67e8f9",
                  border:
                    outboxSummary.failed > 0
                      ? "1px solid #7f1d1d"
                      : "1px solid #155e75",
                  fontWeight: 700,
                }}
              >
                Outbox {outboxSummary.queued + outboxSummary.failed}
              </div>
            ) : null}
          </div>

          <div style={{ marginTop: 8, fontSize: 12, color: "#9ca3af" }}>
            Receive:{" "}
            <span
              style={{
                color: healthStatus.color,
                fontWeight: 600,
                cursor: "help",
              }}
              title={healthStatus.tooltip}
            >
              {healthStatus.label}
            </span>
          </div>

          <div
            style={{
              marginTop: 10,
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <Select
              value={activeAccount || ""}
              onChange={(e) => onAccountChange(e.target.value)}
              options={[
                { value: "", label: "Select account…", disabled: true },
                ...accounts.map((a) => ({ value: a, label: a })),
              ]}
              fullWidth
              size="sm"
            />
            <Button
              onClick={() => boot()}
              variant="secondary"
              size="sm"
              icon="↻"
              iconPosition="left"
            >
              Boot
            </Button>
          </div>

          {/* Navigation tabs */}
          <div style={{ marginTop: 10 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 6,
                background: "#0b0d10",
                border: "1px solid #1f2937",
                borderRadius: 10,
                padding: 4,
              }}
            >
              {(["contacts", "groups", "threads"] as const).map((t) => (
                <Button
                  key={t}
                  onClick={() => {
                    setNavTab(t);
                    setPeopleQuery("");
                    setContactFieldOpen(false);
                    setGroupFieldOpen(false);
                  }}
                  variant={navTab === t ? "secondary" : "ghost"}
                  size="sm"
                >
                  {t === "contacts"
                    ? "Contacts"
                    : t === "groups"
                    ? "Groups"
                    : "Threads"}
                </Button>
              ))}
            </div>

            {navTab === "contacts" || navTab === "groups" ? (
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <Input
                  value={peopleQuery}
                  onChange={(e) => setPeopleQuery(e.target.value)}
                  placeholder="Search people & groups"
                  fullWidth
                />
                {navTab === "contacts" ? (
                  <Button
                    onClick={() => {
                      setNewMessageNumber("");
                      setNewMessageOpen(true);
                    }}
                    variant="secondary"
                    size="sm"
                    title="New message"
                  >
                    New
                  </Button>
                ) : null}
              </div>
            ) : (
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search messages…"
                style={{
                  marginTop: 10,
                  width: "100%",
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid #374151",
                  background: "#111827",
                  color: "#e5e7eb",
                }}
              />
            )}

            {navTab === "contacts" ? (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Select
                    value={contactsSort}
                    onChange={(e) => setContactsSort(e.target.value as any)}
                    options={[
                      { value: "smart", label: "Sort: Favorites/Unread/Last (default)" },
                      { value: "name", label: "Sort: Name A–Z" },
                    ]}
                    size="sm"
                    fullWidth
                  />
                  <Select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    options={[
                      { value: "", label: "Category" },
                      ...categories.map((c) => ({ value: c, label: c })),
                    ]}
                    size="sm"
                    fullWidth
                  />
                  <Button
                    onClick={() => setContactFieldOpen((v) => !v)}
                    variant={contactFieldKey.trim() || contactFieldValue.trim() ? "secondary" : "ghost"}
                    size="sm"
                    title="Filter by custom field"
                  >
                    Field
                    {contactFieldKey.trim() || contactFieldValue.trim()
                      ? `: ${contactFieldKey.trim() || "Any"}${contactFieldValue.trim() ? ` contains "${contactFieldValue.trim()}"` : ""}`
                      : ""}
                  </Button>
                </div>
                {contactFieldOpen ? (
                  <div
                    style={{
                      border: "1px solid #1f2937",
                      borderRadius: 10,
                      padding: 10,
                      background: "#0b0d10",
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr auto",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <Select
                      value={contactFieldKey}
                      onChange={(e) => setContactFieldKey(e.target.value)}
                      options={[
                        { value: "", label: "Any field" },
                        ...contactFieldKeys.map((k) => ({ value: k, label: k })),
                      ]}
                      size="sm"
                    />
                    <Input
                      value={contactFieldValue}
                      onChange={(e) => setContactFieldValue(e.target.value)}
                      placeholder="Value contains…"
                      size="sm"
                    />
                    <Button
                      onClick={() => {
                        setContactFieldKey("");
                        setContactFieldValue("");
                        setContactFieldOpen(false);
                      }}
                      variant="ghost"
                      size="sm"
                      title="Clear field filter"
                    >
                      Clear
                    </Button>
                  </div>
                ) : null}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 12 }}>
                  <Checkbox
                    checked={filterFavoritesOnly}
                    onChange={(e) => setFilterFavoritesOnly(e.target.checked)}
                    label="Favorites"
                    size="sm"
                  />
                  <Checkbox
                    checked={filterUnreadOnly}
                    onChange={(e) => setFilterUnreadOnly(e.target.checked)}
                    label="Unread"
                    size="sm"
                  />
                  <Checkbox
                    checked={filterHasPhoto}
                    onChange={(e) => setFilterHasPhoto(e.target.checked)}
                    label="Has photo"
                    size="sm"
                  />
                  <Checkbox
                    checked={filterHasAppleLink}
                    onChange={(e) => setFilterHasAppleLink(e.target.checked)}
                    label="Apple linked"
                    size="sm"
                  />
                  <Checkbox
                    checked={filterShowMuted}
                    onChange={(e) => setFilterShowMuted(e.target.checked)}
                    label="Show muted"
                    size="sm"
                  />
                </div>
              </div>
            ) : navTab === "groups" ? (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Select
                    value={groupsSort}
                    onChange={(e) => setGroupsSort(e.target.value as any)}
                    options={[
                      { value: "smart", label: "Sort: Favorites/Unread/Last (default)" },
                      { value: "name", label: "Sort: Name A–Z" },
                    ]}
                    size="sm"
                    fullWidth
                  />
                  <Select
                    value={groupFilterCategory}
                    onChange={(e) => setGroupFilterCategory(e.target.value)}
                    options={[
                      { value: "", label: "Category" },
                      ...groupCategories.map((c) => ({ value: c, label: c })),
                    ]}
                    size="sm"
                    fullWidth
                  />
                  <Button
                    onClick={() => setGroupFieldOpen((v) => !v)}
                    variant={groupFieldKey.trim() || groupFieldValue.trim() ? "secondary" : "ghost"}
                    size="sm"
                    title="Filter by custom field"
                  >
                    Field
                    {groupFieldKey.trim() || groupFieldValue.trim()
                      ? `: ${groupFieldKey.trim() || "Any"}${groupFieldValue.trim() ? ` contains "${groupFieldValue.trim()}"` : ""}`
                      : ""}
                  </Button>
                </div>
                {groupFieldOpen ? (
                  <div
                    style={{
                      border: "1px solid #1f2937",
                      borderRadius: 10,
                      padding: 10,
                      background: "#0b0d10",
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr auto",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <Select
                      value={groupFieldKey}
                      onChange={(e) => setGroupFieldKey(e.target.value)}
                      options={[
                        { value: "", label: "Any field" },
                        ...groupFieldKeys.map((k) => ({ value: k, label: k })),
                      ]}
                      size="sm"
                    />
                    <Input
                      value={groupFieldValue}
                      onChange={(e) => setGroupFieldValue(e.target.value)}
                      placeholder="Value contains…"
                      size="sm"
                    />
                    <Button
                      onClick={() => {
                        setGroupFieldKey("");
                        setGroupFieldValue("");
                        setGroupFieldOpen(false);
                      }}
                      variant="ghost"
                      size="sm"
                      title="Clear field filter"
                    >
                      Clear
                    </Button>
                  </div>
                ) : null}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 12 }}>
                  <Checkbox
                    checked={groupFilterFavoritesOnly}
                    onChange={(e) => setGroupFilterFavoritesOnly(e.target.checked)}
                    label="Favorites"
                    size="sm"
                  />
                  <Checkbox
                    checked={groupFilterUnreadOnly}
                    onChange={(e) => setGroupFilterUnreadOnly(e.target.checked)}
                    label="Unread"
                    size="sm"
                  />
                  <Checkbox
                    checked={groupFilterShowMuted}
                    onChange={(e) => setGroupFilterShowMuted(e.target.checked)}
                    label="Show muted"
                    size="sm"
                  />
                </div>
              </div>
            ) : null}

            {navTab === "threads" ? (
              <>
                <div
                  style={{
                    marginTop: 6,
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 6,
                  }}
                >
                  <Input
                    value={searchSender}
                    onChange={(e) => setSearchSender(e.target.value)}
                    placeholder="Sender"
                    size="sm"
                  />
                  <Input
                    value={searchAfter}
                    onChange={(e) => setSearchAfter(e.target.value)}
                    placeholder="After ts (ms)"
                    size="sm"
                  />
                  <Input
                    value={searchBefore}
                    onChange={(e) => setSearchBefore(e.target.value)}
                    placeholder="Before ts (ms)"
                    size="sm"
                  />
                </div>
            {searching ? (
                  <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#9ca3af" }}>
                    <Spinner size="sm" />
                    Searching…
                  </div>
            ) : null}
            {searchResults.length > 0 ? (
                  <div
                    ref={searchResultsRef}
                    style={{
                      marginTop: 8,
                      maxHeight: 180,
                      overflow: "auto",
                      border: "1px solid #1f2937",
                      borderRadius: 8,
                    }}
                  >
                    {searchResults.map((r) => {
                      const snippet = r.snippet || "";
                      return (
                  <div
                    key={r.message_id}
                    onClick={() => openSearchResult(r)}
                          style={{
                            padding: 10,
                            borderBottom: "1px solid #1f2937",
                            cursor: "pointer",
                          }}
                  >
                    <div style={{ fontSize: 12, color: "#9ca3af" }}>
                            {getThreadName({
                              id: r.thread_id,
                              participants: [r.thread_id],
                              last_message_timestamp: r.timestamp,
                              unread_count: 0,
                              message_count: 0,
                            })}
                      {" • "}
                      {fmtTime(r.timestamp)}
                    </div>
                          <div style={{ fontSize: 13 }}>{snippet}</div>
                  </div>
                      );
                    })}
              </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {navTab === "contacts" ? (
            contactsForUi.length === 0 ? (
              <div style={{ padding: 12, color: "#9ca3af" }}>
                Messages will appear here when someone contacts you.
              </div>
            ) : (
              <>
                <div
                  style={{
                    padding: "10px 12px",
                    fontSize: 12,
                    color: "#9ca3af",
                  }}
                >
                  CONTACTS
                </div>
                {contactsForUi.map((c: any) => {
                  const meta = c.meta as ContactMeta | null;
                  const displayName = c.display_name || c.id;
                  const icon = meta?.icon || null;
                  const photoPath = meta?.photo_path || null;
                  const initialsSrc = (displayName || "").trim();
                  const initials =
                    initialsSrc.length > 0
                      ? initialsSrc
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((p) => p.slice(0, 1).toUpperCase())
                          .join("")
                      : c.id.slice(-4);
                  const selected =
                    selectedThreadId === (c.thread_id || c.id) ||
                    selectedThreadId === c.id;
                  const isMuted = !!meta?.muted;
                  return (
                    <div
                      key={c.id}
                      onClick={() => {
                        if (c.thread_id) {
                          loadThreadMessages(c.thread_id);
                        } else {
                          loadThreadMessages(dmNumberFromKey(c.id));
                        }
                      }}
                      style={{
                        padding: 12,
                        borderBottom: "1px solid #1f2937",
                        cursor: "pointer",
                        background: selected ? "#111827" : "transparent",
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        opacity: isMuted ? 0.65 : 1,
                      }}
                    >
                      {contactPhotoUrls[c.id] ? (
                        <img
                          src={contactPhotoUrls[c.id]}
                          alt={displayName}
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 999,
                            border: "1px solid #374151",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 999,
                            background: "#111827",
                            border: "1px solid #374151",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 800,
                          }}
                        >
                          {icon ? icon : initials}
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 700,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {displayName || "Unknown"}
                        </div>
                        <div style={{ fontSize: 12, color: "#9ca3af" }}>
                          {dmNumberFromKey(c.id)}
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          {meta?.favorite ? (
                            <div
                              style={{
                                fontSize: 12,
                                color: "#fbbf24",
                              }}
                            >
                              ★
                            </div>
                          ) : null}
                          {c.unread_count > 0 ? (
                            <div
                              style={{
                                fontSize: 12,
                                padding: "2px 8px",
                                borderRadius: 999,
                                background: "#1f2937",
                                color: "#e5e7eb",
                              }}
                            >
                              {c.unread_count}
                            </div>
                          ) : null}
                        </div>
                        <div style={{ fontSize: 11, color: "#6b7280" }}>
                          {c.last_message_ts ? fmtTime(c.last_message_ts) : ""}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )
          ) : navTab === "groups" ? (
            groupsDerived.length === 0 ? (
              <div style={{ padding: 12, color: "#9ca3af" }}>
                You’re not part of any group conversations yet.
              </div>
            ) : (
              <>
                <div
                  style={{
                    padding: "10px 12px",
                    fontSize: 12,
                    color: "#9ca3af",
                  }}
                >
                  GROUPS
                </div>
                {groupsDerived.map((g) => {
                  const selected = selectedThreadId === g.id;
                  return (
                    <div
                      key={g.id}
                      onClick={() => loadThreadMessages(g.id)}
                      style={{
                        padding: 12,
                        borderBottom: "1px solid #1f2937",
                        cursor: "pointer",
                        background: selected ? "#111827" : "transparent",
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                      }}
                    >
                      <div
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 10,
                          background: "#111827",
                          border: "1px solid #374151",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 800,
                        }}
                      >
                        {g.icon ? g.icon : "👥"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 700,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {g.name}
                        </div>
                        <div style={{ fontSize: 12, color: "#9ca3af" }}>
                          {g.members} members
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          {g.meta?.favorite ? (
                            <div style={{ fontSize: 12, color: "#fbbf24" }}>★</div>
                          ) : null}
                          {g.unread_count > 0 ? (
                            <div
                              style={{
                                fontSize: 12,
                                padding: "2px 8px",
                                borderRadius: 999,
                                background: "#1f2937",
                                color: "#e5e7eb",
                              }}
                            >
                              {g.unread_count}
                            </div>
                          ) : null}
                        </div>
                        <div style={{ fontSize: 11, color: "#6b7280" }}>
                          {g.last_message_ts ? fmtTime(g.last_message_ts) : ""}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )
          ) : // Threads tab (legacy)
          threads.length === 0 ? (
            <div style={{ padding: 12, color: "#9ca3af" }}>No threads.</div>
          ) : (
            threads.map((t) => (
              <div
                key={t.id}
                onClick={() => loadThreadMessages(t.id)}
                style={{
                  padding: 12,
                  borderBottom: "1px solid #1f2937",
                  cursor: "pointer",
                  background:
                    selectedThreadId === t.id ? "#111827" : "transparent",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {getThreadName(t)}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                  {t.unread_count > 0 ? (
                      <div
                        style={{
                          fontSize: 12,
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: "#1f2937",
                          color: "#e5e7eb",
                        }}
                      >
                      {t.unread_count}
                    </div>
                  ) : null}
                </div>
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 12,
                    color: "#9ca3af",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>{fmtTime(t.last_message_timestamp)}</span>
                  <span>{t.message_count} msg</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Aliases (collapsible) */}
        <div style={{ borderTop: "1px solid #1f2937", padding: 12 }}>
          <button
            onClick={() => setAliasesOpen((v) => !v)}
            style={{
              width: "100%",
              textAlign: "left",
              border: "none",
              background: "transparent",
              color: "#e5e7eb",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: 0,
              marginBottom: aliasesOpen ? 8 : 0,
            }}
          >
            <span style={{ fontWeight: 800 }}>Aliases</span>
            <span style={{ fontSize: 12, color: "#9ca3af" }}>
              {aliasesOpen ? "Hide" : "Show"}
            </span>
          </button>

          {aliasesOpen ? (
            <>
          <div style={{ display: "flex", gap: 8 }}>
            <Input
              value={aliasNumber}
              onChange={(e) => setAliasNumber(e.target.value)}
              placeholder="+1202…"
              fullWidth
            />
            <Input
              value={aliasValue}
              onChange={(e) => setAliasValue(e.target.value)}
              placeholder="Alias"
              fullWidth
            />
            <Button
              onClick={setAlias}
              variant="secondary"
              size="sm"
            >
              Set
            </Button>
          </div>
              <div
                style={{
                  marginTop: 8,
                  maxHeight: 110,
                  overflow: "auto",
                  border: "1px solid #1f2937",
                  borderRadius: 8,
                }}
              >
            {Object.keys(aliases).length === 0 ? (
                  <div style={{ padding: 10, color: "#9ca3af", fontSize: 12 }}>
                    No aliases yet.
                  </div>
            ) : (
              Object.entries(aliases).map(([num, al]) => (
                    <div
                      key={num}
                      style={{
                        padding: 10,
                        borderBottom: "1px solid #1f2937",
                        fontSize: 12,
                      }}
                    >
                  <div style={{ color: "#9ca3af" }}>{num}</div>
                  <div>{al}</div>
                </div>
              ))
            )}
          </div>
            </>
          ) : null}
        </div>
      </div>
      {/* Sidebar resizer */}
      <div
        onMouseDown={() => setDragging("sidebar")}
        style={{
          width: 6,
          cursor: "col-resize",
          background: dragging === "sidebar" ? "#1f2937" : "transparent",
        }}
      />

      {/* Main */}
      <div
        style={{
          flex: 1,
          minWidth: 400,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: 12,
            borderBottom: "1px solid #1f2937",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontWeight: 700 }}>
              {selectedThread
                ? getThreadName(selectedThread)
                : "Select a thread"}
            </div>
            {/* Thread IDs are an implementation detail; keep hidden in the primary UI */}
            {selectedThreadId && pendingReplies.length > 0 ? (
              <div
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  color: "#10b981",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: "#064e3b",
                    color: "#d1fae5",
                    fontWeight: 600,
                  }}
                >
                  {pendingReplies.length} draft
                  {pendingReplies.length === 1 ? "" : "s"}
                </span>
                <span>Agent prepared replies available</span>
            </div>
            ) : null}
            {selectedThreadId && failedOutboxForSelected.length > 0 ? (
              <div
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: "#7f1d1d",
                    color: "#fee2e2",
                    fontWeight: 700,
                  }}
                >
                  Send failed
                </span>
                <button
                  onClick={() => retryFailedForSelected()}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 8,
                    border: "1px solid #7f1d1d",
                    background: "#111827",
                    color: "#fee2e2",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  Retry
                </button>
              </div>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={() => refreshThreads()}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #374151",
                background: "#111827",
                color: "#e5e7eb",
                cursor: "pointer",
              }}
            >
              Refresh
            </button>
            <button
              onClick={() => {
                setSettingsOpen(true);
                // default to current contact if contact is selected
                if (selectedThreadId) {
                  if (selectedThreadId.startsWith("group:")) {
                    setSettingsGroupId(selectedThreadId);
                    setSettingsContactId(null);
                  } else {
                    setSettingsContactId(toContactKey(selectedThreadId));
                    setSettingsGroupId(null);
                  }
                }
              }}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #374151",
                background: "#0b0d10",
                color: "#9ca3af",
                cursor: "pointer",
                fontSize: 12,
              }}
              title="Settings"
            >
              ⚙
            </button>
            <button
              onClick={() => setToolsOpen((v) => !v)}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #374151",
                background: toolsOpen ? "#111827" : "#0b0d10",
                color: "#e5e7eb",
                cursor: "pointer",
                fontSize: 12,
              }}
              title="Toggle Tools"
            >
              Tools
            </button>
            {/* Step 4: diagnostics/debug hidden; "More" menu returns in Step 5 (Developer Mode) */}
            {selectedThreadId ? (
              <div style={{ position: "relative" }}>
                <Button
                  onClick={() => setExportMenuOpen((v) => !v)}
                  disabled={exporting}
                  variant="secondary"
                  size="sm"
                  loading={exporting}
                  style={{
                    border: "1px solid #374151",
                    background: exporting ? "#374151" : "#111827",
                    color: "#e5e7eb",
                    cursor: exporting ? "not-allowed" : "pointer",
                    fontSize: 12,
                  }}
                  title="Export thread"
                >
                  {exporting ? "Exporting…" : "Export"}
                </Button>
                {exportMenuOpen ? (
                  <div
                    style={{
                      position: "absolute",
                      top: "105%",
                      right: 0,
                      background: "#0b0d10",
                      border: "1px solid #1f2937",
                      borderRadius: 8,
                      minWidth: 160,
                      boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
                      zIndex: 10,
                      overflow: "hidden",
                    }}
                  >
                    <Button
                      onClick={() => exportThread("txt")}
                      disabled={exporting}
                      variant="ghost"
                      fullWidth
                      style={{ textAlign: "left", justifyContent: "flex-start" }}
                    >
                      Text (.txt)
                    </Button>
                <Button
                  onClick={() => exportThread("json")}
                  disabled={exporting}
                  variant="ghost"
                  fullWidth
                  style={{ textAlign: "left", justifyContent: "flex-start" }}
                >
                  JSON (.json)
                </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {/* Conversation + Tools */}
        <div
          id="main-content"
          tabIndex={-1}
          style={{ flex: 1, display: "flex", minHeight: 0 }}
        >
          <div
            style={{ flex: 1, overflow: "auto", padding: 16, minWidth: 420 }}
          >
            {draftHistory.length > 0 ? (
              <div
                style={{
                  marginBottom: 12,
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ fontSize: 12, color: "#9ca3af" }}>
                  Draft history
                </div>
                <Button
                  onClick={() => {
                    const last = draftHistory[draftHistory.length - 1];
                    if (last) {
                      setComposerText(last.draft);
                      setShowWelcome(false);
                    }
                  }}
                  variant="secondary"
                  size="sm"
                >
                  Restore last draft
                </Button>
              </div>
            ) : null}
            {/* Outbox items are handled via the minimal header indicator (failed only). */}
            {selectedThreadId && pendingReplies.length > 0 ? (
              <div
                style={{
                  marginBottom: 12,
                  padding: 12,
                  borderRadius: 10,
                  border: "1px solid #1f2937",
                  background: "#0f172a",
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    marginBottom: 6,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    color: "#d1fae5",
                  }}
                >
                  <span>Agent drafts</span>
                  <span style={{ fontSize: 12, color: "#9ca3af" }}>
                    {pendingReplies.length} ready
                  </span>
                </div>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  {pendingReplies.map((p) => (
                    <div
                      key={p.message_id}
                      style={{
                        padding: 10,
                        borderRadius: 8,
                        border: "1px solid #1f2937",
                        background: "#111827",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          color: "#9ca3af",
                          marginBottom: 6,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <span>
                          {fmtTime(p.created_at)} • {p.intent}
                        </span>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            onClick={() => useDraft(p)}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 8,
                              border: "1px solid #10b981",
                              background: "#064e3b",
                              color: "#d1fae5",
                              cursor: "pointer",
                              fontSize: 12,
                            }}
                          >
                            Use Draft
                          </button>
                          <button
                            onClick={async () => {
                              await useAndSendDraft(p);
                            }}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 8,
                              border: "1px solid #14b8a6",
                              background: "#0d9488",
                              color: "#ecfeff",
                              cursor: "pointer",
                              fontSize: 12,
                            }}
                          >
                            Use + Send
                          </button>
                          <button
                            onClick={() => dismissDraft(p.message_id)}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 8,
                              border: "1px solid #374151",
                              background: "#1f2937",
                              color: "#e5e7eb",
                              cursor: "pointer",
                              fontSize: 12,
                            }}
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                      <div style={{ whiteSpace: "pre-wrap" }}>{p.draft}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          {selectedThreadId === null ? (
              <div style={{ color: "#9ca3af" }}>
                Choose a thread from the left.
              </div>
          ) : messages.length === 0 ? (
              <div style={{ color: "#9ca3af" }}>
                No messages in this thread.
              </div>
          ) : (
            messages.map((m) => {
              const from = aliases[m.sender] || m.sender;
              const outgoing = m.direction === "Outgoing";
              return (
                <div
                    id={`msg-${m.id}`}
                  key={m.id}
                  style={{
                    maxWidth: "78%",
                    marginLeft: outgoing ? "auto" : 0,
                    marginBottom: 12,
                    padding: 12,
                    borderRadius: 10,
                    background: outgoing ? "#111827" : "#1f2937",
                    border: "1px solid #374151",
                  }}
                >
                    <div
                      style={{
                        fontSize: 12,
                        color: "#9ca3af",
                        marginBottom: 6,
                      }}
                    >
                    {from} • {fmtTime(m.timestamp)}
                  </div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
                </div>
              );
            })
          )}
          </div>

          {toolsOpen ? (
            <>
              <div
                onMouseDown={() => setDragging("tools")}
                style={{
                  width: 6,
                  cursor: "col-resize",
                  background: dragging === "tools" ? "#1f2937" : "transparent",
                }}
              />
              <div
                style={{
                  width: toolsWidth,
                  minWidth: 320,
                  maxWidth: 520,
                  borderLeft: "1px solid #1f2937",
                  padding: 12,
                  overflow: "auto",
                }}
              >
                {fe("ui.panel.tools", true) ? (<ToolsPanel
                  visible={true}
                  selectedThreadId={selectedThreadId}
                  pendingReplies={pendingReplies}
                  messages={messages as any}
                  aiIntent={aiIntent}
                  setAiIntent={setAiIntent}
                  aiConstraints={aiConstraints}
                  setAiConstraints={setAiConstraints}
                  aiOutput={aiOutput}
                  onSummarize={aiSummarize}
                  onDraft={aiDraft}
                  onExport={(format) => exportThread(format)}
                  exportResult={exportResult}
                  onOpenExportFolder={(path) => openExportFolder(path)}
                  receiveLoopState={receiveState}
                  agentEnabled={false}
                  onOpenDiagnostics={() => {}}
                  onJumpToMessage={(messageId) => {
                    const el = document.getElementById(`msg-${messageId}`);
                    if (el)
                      el.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                      });
                  }}
                />) : null}
              </div>
            </>
          ) : null}
        </div>

        {/* Composer + AI */}
        <div
          id="message-composer"
          tabIndex={-1}
          style={{
            borderTop: "1px solid #1f2937",
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            <Input
              value={composerText}
              onChange={(e) => setComposerText(e.target.value)}
              placeholder="Type message…"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              fullWidth
            />
            <Button
              onClick={sendMessage}
              disabled={!selectedThreadId || sending || !composerText.trim()}
              variant="primary"
              loading={sending}
            >
              {sending ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
          </div>

      {/* Step 4: diagnostics/debug hidden; modal returns in Step 5 (Developer Mode) */}
      {fe("ui.modal.settings", true) ? (<SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        contacts={contactsMerged
          .map((c: any) => {
            const meta = c.meta as ContactMeta | undefined;
            const display =
              meta?.display_name ||
              meta?.alias ||
              aliases[c.id] ||
              c.alias ||
              c.id;
            return {
              id: c.id,
              display_name: display,
              number: dmNumberFromKey(c.id),
              unread_count: c.unread_count,
              last_message_ts: c.last_message_ts,
              meta: meta || null,
            };
          })
          .sort((a, b) => (b.last_message_ts || 0) - (a.last_message_ts || 0))}
        groups={groupsDerived
          .map((g: any) => {
            const meta = groupMeta[g.id] as GroupMeta | undefined;
            const display =
              meta?.display_name ||
              meta?.icon ||
              aliases[g.id] ||
              g.name ||
              "Group chat";
            // Try to find members from threads list
            const t = threads.find((tt) => tt.id === g.id);
            const members = (t?.participants || []).slice();
            return {
              id: g.id,
              display_name: display,
              members,
              unread_count: g.unread_count,
              last_message_ts: g.last_message_ts,
              meta: meta || null,
            };
          })
          .sort((a, b) => (b.last_message_ts || 0) - (a.last_message_ts || 0))}
        categories={categories}
        groupCategories={groupCategories}
        selectedContactId={settingsContactId}
        onSelectContact={(id) => setSettingsContactId(id)}
        selectedGroupId={settingsGroupId}
        onSelectGroup={(id) => setSettingsGroupId(id)}
        onCreateContact={async (id) => {
          const key = toContactKey(id);
          const num = dmNumberFromKey(key);
          await createContact(key);
          await loadThreadMessages(num);
        }}
        onSetMuted={async (id, muted) => {
          await setContactMuted(id, muted);
        }}
        onCreateGroup={async (id) => {
          const gid = id.trim();
          await unwrap<GroupMeta>(invoke("set_group_meta", { groupId: gid, patch: {} as any }), "set_group_meta");
          await refreshGroupMeta();
          await refreshGroupCategories();
        }}
        onSetGroupMuted={async (id, muted) => {
          await unwrap<GroupMeta>(invoke("set_group_meta", { groupId: id, patch: { muted } }), "set_group_meta");
          await refreshGroupMeta();
          await refreshGroupCategories();
        }}
        onSaveDraft={async (contactId, draft) => {
          const patch: ContactMetaPatch = {
            display_name: draft.display_name.trim() ? draft.display_name.trim() : null,
            alias: draft.alias.trim() ? draft.alias.trim() : null,
            icon: draft.icon.trim() ? draft.icon.trim() : null,
            categories: (draft.categories || []).map((c) => c.trim()).filter((c) => c),
            favorite: !!draft.favorite,
            muted: !!draft.muted,
            apple_contact_id: draft.apple_contact_id.trim()
              ? draft.apple_contact_id.trim()
              : null,
            custom_fields: (draft.custom_fields || [])
              .filter((f: any) => String(f?.key || "").trim())
              .map((f) => ({
              id: String((f as any).id || ""),
              key: (f.key || "").trim(),
              value: String((f as any).value ?? ""),
              type: String((f as any).type || (f as any).field_type || "text"),
              searchable: !!(((f as any).searchable ?? (f as any).is_searchable) as any),
            })),
          };
          await upsertContactMeta(contactId, patch);
        }}
        onDeleteMeta={async (contactId) => {
          await deleteContactMeta(contactId);
        }}
        onUploadPhoto={async (contactId, bytes, ext) => {
          await uploadContactPhoto(contactId, bytes, ext);
          await ensureContactPhotoCached(contactId);
        }}
        onRemovePhoto={async (contactId) => {
          await removeContactPhoto(contactId);
          setPhotoUrlFor(contactId, null);
        }}
        onLinkAppleStub={async (contactId, appleContactId) => {
          await linkAppleStub(contactId, appleContactId);
        }}
        onUnlinkAppleStub={async (contactId) => {
          await unlinkAppleStub(contactId);
        }}
        onSaveGroupDraft={async (groupId, draft) => {
          const patch: GroupMetaPatch = {
            display_name: draft.display_name?.trim() ? draft.display_name.trim() : null,
            icon: draft.icon?.trim() ? draft.icon.trim() : null,
            categories: (draft.categories || []).map((c: string) => c.trim()).filter((c: string) => c),
            favorite: !!draft.favorite,
            muted: !!draft.muted,
            custom_fields: (draft.custom_fields || [])
              .filter((f: any) => String(f?.key || "").trim())
              .map((f: any) => ({
              id: String(f.id || ""),
              key: (f.key || "").trim(),
              value: String(f.value ?? ""),
              type: String(f.type || f.field_type || "text"),
              searchable: !!(f.searchable ?? f.is_searchable),
            })),
            member_notes: (draft.member_notes || []).map((s: string) => String(s)),
          };
          await unwrap<GroupMeta>(invoke("set_group_meta", { groupId, patch }), "set_group_meta");
          await refreshGroupMeta();
          await refreshGroupCategories();
        }}
        onDeleteGroupMeta={async (groupId) => {
          await unwrap<boolean>(invoke("delete_group_meta", { groupId }), "delete_group_meta");
          await refreshGroupMeta();
          await refreshGroupCategories();
        }}
      />) : null}
      <NewMessageModal
        open={newMessageOpen}
        value={newMessageNumber}
        onChange={setNewMessageNumber}
        onCancel={() => setNewMessageOpen(false)}
        onCreate={async () => {
          const raw = newMessageNumber.trim();
          if (!raw) return;
          const key = toContactKey(raw);
          const num = dmNumberFromKey(key);
          try {
            await createContact(key);
            setNewMessageOpen(false);
            setNavTab("contacts");
            setPeopleQuery("");
            await loadThreadMessages(num);
          } catch (e: any) {
            addLog(String(e?.message || e));
          }
        }}
      />
      {showWelcome ? (
        <WelcomeOverlay
          accounts={accounts}
          selectedAccount={welcomeAccount}
          onSelectAccount={(id) => {
            setWelcomeAccount(id);
            setWelcomeError(null);
          }}
          error={welcomeError}
          onEnter={async () => {
            if (!welcomeAccount) return;
            try {
              await unwrap<boolean>(
                invoke("set_active_account", { accountId: welcomeAccount }),
                "set_active_account"
              );
              setActiveAccount(welcomeAccount);
              setShowWelcome(false);
              addLog(`Activated account ${welcomeAccount} from welcome`);
              
              // Start onboarding tour after welcome
              if (isOnboardingActive) {
                onboardingNextStep(); // Move from account-select to next step
              }
              
              await refreshThreads();
              await refreshAliases();
              await refreshContactMeta();
              await refreshCategories();
              await refreshDiagnostics();
              await refreshReceiveLoopState();
            } catch (e: any) {
              const msg = String(e?.message || e);
              setWelcomeError(msg);
              addLog(msg);
            }
          }}
        />
        ) : null}
      
      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      
      {/* Onboarding Tour */}
      <OnboardingTour />
      
      {/* Outbox Status - Real-time message queue feedback */}
      <FeatureHint
        id="outbox-status"
        title="📤 Message Status"
        description="Watch your messages here! See when they're queued, sending, or sent successfully."
        position="left"
        delay={2000}
      >
        <OutboxStatus show={true} />
      </FeatureHint>
    </div>
  );
}
