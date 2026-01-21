// AI Auto-Reply System TypeScript Interfaces and API Client
import { invoke } from "./utils/tauri";

/**
 * AI Health Check Response
 */
export interface AiHealthResponse {
  success: boolean;
  data?: {
    healthy: boolean;
  };
  error?: string;
}

/**
 * AI Generate Reply Request
 */
export interface AiGenerateReplyRequest {
  thread_id: string;
  intent: string;
  constraints?: string;
}

/**
 * AI Generate Reply Response
 */
export interface AiGenerateReplyResponse {
  success: boolean;
  data?: {
    reply: string;
    confidence: number;
    thread_id: string;
  };
  error?: string;
}

/**
 * AI Summarize Thread Request
 */
export interface AiSummarizeThreadRequest {
  thread_id: string;
  length: "brief" | "normal" | "detailed";
}

/**
 * AI Summarize Thread Response
 */
export interface AiSummarizeThreadResponse {
  success: boolean;
  data?: {
    summary: string;
    thread_id: string;
    message_count: number;
  };
  error?: string;
}

/**
 * Automation Rule Trigger Types
 */
export type AutomationTrigger =
  | {
      type: "TimeRange";
      start_hour: number;
      end_hour: number;
      days?: string[];
    }
  | {
      type: "Keyword";
      keywords: string[];
      case_sensitive?: boolean;
      match_any?: boolean;
    }
  | {
      type: "Sender";
      contacts: string[];
      groups?: string[];
    }
  | {
      type: "All";
      conditions: AutomationTrigger[];
    }
  | {
      type: "Any";
      conditions: AutomationTrigger[];
    };

/**
 * Automation Rule Action Types
 */
export type AutomationAction =
  | {
      type: "GenerateReply";
      intent: string;
      constraints?: string;
      auto_send?: boolean;
      confidence_threshold?: number;
    }
  | {
      type: "SendMessage";
      content: string;
    }
  | {
      type: "MarkRead";
    }
  | {
      type: "Notify";
      urgent?: boolean;
    };

/**
 * Automation Rule
 */
export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  action: AutomationAction;
  priority?: number;
}

/**
 * Automation Rule Template
 */
export interface AutomationTemplate {
  type: string;
  name: string;
  description: string;
}

/**
 * AI Client for interacting with Ollama-powered auto-reply system
 */
export class AiClient {
  /**
   * Check if Ollama is running and accessible
   */
  static async healthCheck(): Promise<boolean> {
    try {
      const response: AiHealthResponse = await invoke("ai_health_check");
      return response.success && response.data?.healthy === true;
    } catch (error) {
      console.error("AI health check failed:", error);
      return false;
    }
  }

  /**
   * Generate an AI-powered reply for a thread
   */
  static async generateReply(
    threadId: string,
    intent: string = "reply",
    constraints?: string
  ): Promise<AiGenerateReplyResponse> {
    return invoke("ai_generate_reply", {
      thread_id: threadId,
      intent,
      constraints,
    });
  }

  /**
   * Generate a summary of a thread
   */
  static async summarizeThread(
    threadId: string,
    length: "brief" | "normal" | "detailed" = "normal"
  ): Promise<AiSummarizeThreadResponse> {
    return invoke("ai_summarize_thread", {
      thread_id: threadId,
      length,
    });
  }
}

/**
 * Automation Rules Client
 */
export class AutomationClient {
  /**
   * List all automation rules
   */
  static async listRules(): Promise<AutomationRule[]> {
    const response: any = await invoke("automation_list_rules");
    return response.success ? response.data : [];
  }

  /**
   * Add a new automation rule
   */
  static async addRule(rule: AutomationRule): Promise<boolean> {
    const response: any = await invoke("automation_add_rule", { rule });
    return response.success;
  }

  /**
   * Remove an automation rule
   */
  static async removeRule(ruleId: string): Promise<boolean> {
    const response: any = await invoke("automation_remove_rule", {
      rule_id: ruleId,
    });
    return response.success;
  }

  /**
   * Find rules that match current message context
   */
  static async findMatchingRules(
    sender: string,
    message: string,
    threadId: string
  ): Promise<AutomationRule[]> {
    const response: any = await invoke("automation_find_matching", {
      sender,
      message,
      thread_id: threadId,
    });
    return response.success ? response.data : [];
  }

  /**
   * Get available rule templates
   */
  static async getTemplates(): Promise<AutomationTemplate[]> {
    const response: any = await invoke("automation_get_templates");
    return response.success ? response.data : [];
  }

  /**
   * Create a rule from a template
   */
  static async createFromTemplate(
    templateType: string,
    autoSend?: boolean,
    contacts?: string[]
  ): Promise<boolean> {
    const response: any = await invoke("automation_create_from_template", {
      template_type: templateType,
      auto_send: autoSend,
      contacts,
    });
    return response.success;
  }
}

/**
 * Helper functions for working with AI and automation
 */
export const AiHelpers = {
  /**
   * Common reply intents
   */
  INTENTS: {
    REPLY: "reply",
    CONFIRM: "confirm",
    DECLINE: "decline",
    ACKNOWLEDGE: "acknowledge",
    ASK: "ask",
  } as const,

  /**
   * Format confidence score as percentage
   */
  formatConfidence(score: number): string {
    return `${Math.round(score)}%`;
  },

  /**
   * Get confidence level description
   */
  getConfidenceLevel(score: number): "low" | "medium" | "high" {
    if (score >= 80) return "high";
    if (score >= 60) return "medium";
    return "low";
  },

  /**
   * Check if confidence score is acceptable
   */
  isConfidenceAcceptable(score: number, threshold: number = 80): boolean {
    return score >= threshold;
  },

  /**
   * Get color for confidence level
   */
  getConfidenceColor(score: number): string {
    if (score >= 80) return "var(--sx-good)";
    if (score >= 60) return "var(--sx-warn)";
    return "var(--sx-bad)";
  },
};

/**
 * Example usage in React component:
 * 
 * ```tsx
 * import { AiClient, AutomationClient, AiHelpers } from './ai-client';
 * 
 * function ChatPanel() {
 *   const [aiReply, setAiReply] = useState<string>("");
 *   const [confidence, setConfidence] = useState<number>(0);
 * 
 *   const handleGenerateReply = async () => {
 *     const result = await AiClient.generateReply(
 *       currentThreadId,
 *       AiHelpers.INTENTS.REPLY,
 *       "Keep it brief and professional"
 *     );
 * 
 *     if (result.success && result.data) {
 *       setAiReply(result.data.reply);
 *       setConfidence(result.data.confidence);
 *     }
 *   };
 * 
 *   return (
 *     <div>
 *       <button onClick={handleGenerateReply}>Generate AI Reply</button>
 *       {aiReply && (
 *         <div>
 *           <p>{aiReply}</p>
 *           <span style={{ color: AiHelpers.getConfidenceColor(confidence) }}>
 *             Confidence: {AiHelpers.formatConfidence(confidence)}
 *           </span>
 *         </div>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */

