import React, { useState, useEffect } from 'react';
import { Button, Input, Card, Badge, Select } from '../primitives';
import { 
  loadRules, 
  addRule, 
  updateRule, 
  removeRule, 
  toggleRule,
  RULE_TEMPLATES,
  type Rule 
} from '../../../packages/signal_automation_scaffolding/src/automation/index';
import './RuleManagementPanel.css';

interface RuleManagementPanelProps {
  onClose?: () => void;
}

export const RuleManagementPanel: React.FC<RuleManagementPanelProps> = ({ onClose }) => {
  const [rules, setRules] = useState<Rule[]>([]);
  const [selectedRule, setSelectedRule] = useState<Rule | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadRulesFromStorage();
  }, []);

  const loadRulesFromStorage = () => {
    const loaded = loadRules();
    setRules(loaded);
  };

  const handleSave = () => {
    if (selectedRule) {
      try {
        if (selectedRule.id && rules.some(r => r.id === selectedRule.id)) {
          updateRule(selectedRule);
        } else {
          addRule(selectedRule);
        }
        loadRulesFromStorage();
        setIsEditing(false);
        setSelectedRule(null);
      } catch (error) {
        console.error('Failed to save rule:', error);
        alert(`Failed to save rule: ${error}`);
      }
    }
  };

  const handleDelete = (ruleId: string) => {
    if (confirm('Are you sure you want to delete this rule?')) {
      try {
        removeRule(ruleId);
        loadRulesFromStorage();
        if (selectedRule?.id === ruleId) {
          setSelectedRule(null);
          setIsEditing(false);
        }
      } catch (error) {
        console.error('Failed to delete rule:', error);
        alert(`Failed to delete rule: ${error}`);
      }
    }
  };

  const handleToggle = (ruleId: string) => {
    try {
      const updated = toggleRule(ruleId);
      loadRulesFromStorage();
      if (selectedRule?.id === ruleId) {
        setSelectedRule(updated);
      }
    } catch (error) {
      console.error('Failed to toggle rule:', error);
    }
  };

  const handleCreateFromTemplate = (templateName: string) => {
    try {
      if (templateName === 'greeting' && RULE_TEMPLATES.greeting) {
        const newRule = RULE_TEMPLATES.greeting();
        setSelectedRule(newRule);
        setIsEditing(true);
      } else if (templateName === 'question' && RULE_TEMPLATES.question) {
        const newRule = RULE_TEMPLATES.question();
        setSelectedRule(newRule);
        setIsEditing(true);
      } else if (templateName === 'urgent' && RULE_TEMPLATES.urgent) {
        const newRule = RULE_TEMPLATES.urgent();
        setSelectedRule(newRule);
        setIsEditing(true);
      }
    } catch (error) {
      console.error('Failed to create rule from template:', error);
    }
  };

  const filteredRules = rules.filter(rule => {
    const query = searchQuery.toLowerCase();
    return (
      rule.id.toLowerCase().includes(query) ||
      (rule.match?.contains && rule.match.contains.some((c: string) => c.toLowerCase().includes(query))) ||
      (rule.match?.from && rule.match.from.some((f: string) => f.toLowerCase().includes(query)))
    );
  });

  return (
    <div className="rule-management-panel">
      <div className="rule-management-content">
        <div className="rule-list-section">
          <div className="rule-list-header">
            <Input
              placeholder="Search rules..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              fullWidth
            />
            <div className="rule-templates">
              <Select
                placeholder="Create from template..."
                options={[
                  { value: 'greeting', label: 'Greeting Response' },
                  { value: 'question', label: 'Question Acknowledgment' },
                  { value: 'urgent', label: 'Urgent Message' },
                ]}
                onChange={(e) => {
                  if (e.target.value) {
                    handleCreateFromTemplate(e.target.value);
                  }
                }}
                size="sm"
              />
            </div>
          </div>

          <div className="rule-list">
            {filteredRules.length === 0 ? (
              <div className="rule-empty">No rules found</div>
            ) : (
              filteredRules.map(rule => (
                <Card
                  key={rule.id}
                  variant={selectedRule?.id === rule.id ? 'elevated' : 'default'}
                  onClick={() => {
                    setSelectedRule(rule);
                    setIsEditing(false);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="rule-item">
                    <div className="rule-item-header">
                      <span className="rule-id">{rule.id}</span>
                      <Badge variant={rule.enabled ? 'success' : 'default'} size="sm">
                        {rule.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                    <div className="rule-item-actions">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggle(rule.id);
                        }}
                      >
                        {rule.enabled ? 'Disable' : 'Enable'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedRule(rule);
                          setIsEditing(true);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(rule.id);
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>

        <div className="rule-editor-section">
          {selectedRule ? (
            <div className="rule-editor">
              <h3>{isEditing ? 'Edit Rule' : 'Rule Details'}</h3>
              {isEditing ? (
                <div className="rule-editor-form">
                  <Input
                    label="Rule ID"
                    value={selectedRule.id}
                    onChange={(e) => setSelectedRule({ ...selectedRule, id: e.target.value })}
                    fullWidth
                  />
                  <div className="rule-editor-actions">
                    <Button variant="primary" onClick={handleSave}>
                      Save
                    </Button>
                    <Button variant="secondary" onClick={() => {
                      setIsEditing(false);
                      loadRulesFromStorage();
                      const rule = rules.find(r => r.id === selectedRule.id);
                      setSelectedRule(rule || null);
                    }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rule-details">
                  <p><strong>ID:</strong> {selectedRule.id}</p>
                  <p><strong>Enabled:</strong> {selectedRule.enabled ? 'Yes' : 'No'}</p>
                  <p><strong>Action:</strong> {selectedRule.action?.type || 'N/A'}</p>
                  {selectedRule.action?.type === 'DRAFT' && selectedRule.action.template && (
                    <p><strong>Template:</strong> {selectedRule.action.template}</p>
                  )}
                  <div className="rule-details-actions">
                    <Button variant="primary" onClick={() => setIsEditing(true)}>
                      Edit
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => handleToggle(selectedRule.id)}
                    >
                      {selectedRule.enabled ? 'Disable' : 'Enable'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rule-editor-empty">
              <p>Select a rule to view or edit</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RuleManagementPanel;
