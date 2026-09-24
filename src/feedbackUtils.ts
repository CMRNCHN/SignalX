import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "./runtime";

interface FeedbackEntry {
  timestamp: string;
  feedback: string;
  userAgent: string;
  url: string;
}

export async function saveFeedback(entry: FeedbackEntry): Promise<void> {
  if (!isTauriRuntime()) {
    console.log("💬 Feedback (browser):", entry);
    return;
  }

  try {
    await invoke<void>("save_feedback", {
      feedback: entry.feedback,
      timestamp: entry.timestamp,
      userAgent: entry.userAgent,
      url: entry.url,
    });
  } catch (err) {
    console.error("Failed to save feedback:", err);
    throw err;
  }
}
