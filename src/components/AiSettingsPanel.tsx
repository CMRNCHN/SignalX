import React, { useState, useEffect } from "react";
import { AiClient, AutomationClient, AiHelpers, AutomationRule, AutomationTemplate } from "./ai-client";
import "./AiSettingsPanel.css";

interface AiSettingsPanelProps {
  onClose: () => void;
}

export const AiSettingsPanel: React.FC<AiSettingsPanelProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<"status" | "rules" | "templates">("status");
  const [ollamaHealthy, setOllamaHealthy] = useState<boolean | null>(null);
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [templates, setTemplates] = useState<AutomationTemplate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkHealth();
    loadRules();
    loadTemplates();
  }, []);

  const checkHealth = async () => {
    setLoading(true);
    const healthy = await AiClient.healthCheck();
    setOllamaHealthy(healthy);
    setLoading(false);
  };

  const loadRules = async () => {
    const loadedRules = await AutomationClient.listRules();
    setRules(loadedRules);
  };

  const loadTemplates = async () => {
    const loadedTemplates = await AutomationClient.getTemplates();
    setTemplates(loadedTemplates);
  };

  const handleRemoveRule = async (ruleId: string) => {
    const success = await AutomationClient.removeRule(ruleId);
    if (success) {
      setRules(rules.filter((r) => r.id !== ruleId));
    }
  };

  const handleCreateFromTemplate = async (templateType: string) => {
    const success = await AutomationClient.createFromTemplate(templateType, false);
    if (success) {
      await loadRules();
    }
  };

  return (
    <div className="ai-settings-overlay" onClick={onClose}>
      <div className="ai-settings-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="ai-settings-header">
          <h2>AI & Automation Settings</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="ai-settings-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === "status"}
            className={activeTab === "status" ? "active" : ""}
            onClick={() => setActiveTab("status")}
          >
            Status
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "rules"}
            className={activeTab === "rules" ? "active" : ""}
            onClick={() => setActiveTab("rules")}
          >
            Rules ({rules.filter((r) => r.enabled).length})
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "templates"}
            className={activeTab === "templates" ? "active" : ""}
            onClick={() => setActiveTab("templates")}
          >
            Templates
          </button>
        </div>

        {/* Tab Content */}
        <div className="ai-settings-content">
          {/* Status Tab */}
          {activeTab === "status" && (
            <div className="status-tab" role="tabpanel">
              <div className="status-section">
                <h3>Ollama Connection</h3>
                <div className="status-indicator">
                  {ollamaHealthy === null && (
                    <div className="status-checking">
                      <span className="spinner" />
                      <span>Checking connection...</span>
                    </div>
                  )}
                  {ollamaHealthy === true && (
                    <div className="status-healthy">
                      <span className="status-dot healthy" />
                      <span>Connected and ready</span>
                    </div>
                  )}
                  {ollamaHealthy === false && (
                    <div className="status-unhealthy">
                      <span className="status-dot unhealthy" />
                      <span>Not connected</span>
                    </div>
                  )}
                </div>
                <button className="btn-secondary" onClick={checkHealth} disabled={loading}>
                  {loading ? "Checking..." : "Check Connection"}
                </button>
              </div>

              <div className="status-section">
                <h3>Configuration</h3>
                <div className="config-info">
                  <div className="config-row">
                    <span className="config-label">Ollama URL:</span>
                    <code>http://localhost:11434</code>
                  </div>
                  <div className="config-row">
                    <span className="config-label">Model:</span>
                    <code>llama2</code>
                  </div>
                  <div className="config-hint">
                    Set <code>SIGNALX_OLLAMA_URL</code> and <code>SIGNALX_OLLAMA_MODEL</code> in
                    .signalx.env to customize
                  </div>
                </div>
              </div>

              <div className="status-section">
                <h3>Active Rules</h3>
                <p className="stats-text">
                  {rules.filter((r) => r.enabled).length} of {rules.length} rules active
                </p>
              </div>
            </div>
          )}

          {/* Rules Tab */}
          {activeTab === "rules" && (
            <div className="rules-tab" role="tabpanel">
              {rules.length === 0 ? (
                <div className="empty-state">
                  <p>No automation rules configured yet.</p>
                  <p>Switch to the Templates tab to get started.</p>
                </div>
              ) : (
                <div className="rules-list">
                  {rules.map((rule) => (
                    <div key={rule.id} className="rule-card">
                      <div className="rule-header">
                        <div className="rule-title">
                          <span className={`status-badge ${rule.enabled ? "enabled" : "disabled"}`}>
                            {rule.enabled ? "Active" : "Disabled"}
                          </span>
                          <h4>{rule.name}</h4>
                        </div>
                        <button
                          className="btn-danger-small"
                          onClick={() => handleRemoveRule(rule.id)}
                          aria-label={`Remove ${rule.name}`}
                        >
                          Remove
                        </button>
                      </div>
                      <div className="rule-details">
                        <div className="rule-detail-row">
                          <span className="label">Priority:</span>
                          <span>{rule.priority || 0}</span>
                        </div>
                        <div className="rule-detail-row">
                          <span className="label">Trigger:</span>
                          <span>{rule.trigger.type}</span>
                        </div>
                        <div className="rule-detail-row">
                          <span className="label">Action:</span>
                          <span>{rule.action.type}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Templates Tab */}
          {activeTab === "templates" && (
            <div className="templates-tab" role="tabpanel">
              <p className="templates-hint">
                Quick-start templates for common automation scenarios. Click to add to your rules.
              </p>
              <div className="templates-list">
                {templates.map((template) => (
                  <div key={template.type} className="template-card">
                    <h4>{template.name}</h4>
                    <p>{template.description}</p>
                    <button
                      className="btn-primary"
                      onClick={() => handleCreateFromTemplate(template.type)}
                    >
                      Add Rule
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="ai-settings-footer">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

