import React, { useState } from "react";
import { invoke } from "../utils/tauri";

interface LoginModalProps {
  onLogin: (session: any) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onLogin }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await invoke<any>("auth_login", { username, password });
      if (response.success) {
        onLogin(response.data);
      } else {
        setError(response.error || "Login failed");
      }
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: "#1f2937",
          border: "1px solid #374151",
          borderRadius: 12,
          padding: 24,
          width: 400,
          maxWidth: "90%",
        }}
      >
        <h2 style={{ margin: "0 0 20px 0", color: "#e5e7eb" }}>Login</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: "block",
                marginBottom: 8,
                color: "#9ca3af",
                fontSize: 14,
              }}
            >
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                border: "1px solid #374151",
                background: "#111827",
                color: "#e5e7eb",
              }}
              autoFocus
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label
              style={{
                display: "block",
                marginBottom: 8,
                color: "#9ca3af",
                fontSize: 14,
              }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                border: "1px solid #374151",
                background: "#111827",
                color: "#e5e7eb",
              }}
            />
          </div>
          {error && (
            <div
              style={{
                marginBottom: 16,
                padding: 10,
                background: "#7f1d1d",
                border: "1px solid #991b1b",
                borderRadius: 8,
                color: "#fca5a5",
                fontSize: 14,
              }}
            >
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading || !username || !password}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 8,
              border: "none",
              background: loading ? "#374151" : "#3b82f6",
              color: "#ffffff",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 600,
            }}
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
        <div
          style={{
            marginTop: 16,
            padding: 12,
            background: "#0f172a",
            border: "1px solid #1e293b",
            borderRadius: 8,
            fontSize: 12,
            color: "#9ca3af",
          }}
        >
          <strong>Dev mode:</strong> Default credentials: admin / admin
        </div>
      </div>
    </div>
  );
};

