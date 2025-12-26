use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Rule {
    pub id: String,
    pub account_id: String,
    pub name: String,
    pub enabled: bool,
    pub dsl: Option<String>,
    pub compiled_json: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleAST {
    pub name: String,
    pub when: Vec<Condition>,
    pub then: Vec<Action>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Condition {
    MessageContains(String),
    MessageFrom(String),
    ThreadId(String),
    // TODO: Add more conditions
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Action {
    Draft(String),
    Send(String), // Only if feature flag enabled
    LabelContact(String, String), // TODO: Implement
}

pub struct RulesEngine {
    storage: Arc<crate::storage::Storage>,
}

impl RulesEngine {
    pub fn new(storage: Arc<crate::storage::Storage>) -> Self {
        Self { storage }
    }

    pub fn parse_dsl(&self, dsl: &str) -> Result<RuleAST, String> {
        // Simple line-based parser
        // Format:
        // rule "Name"
        // when message_in contains "text"
        // then draft "response"
        
        let lines: Vec<&str> = dsl.lines().map(|l| l.trim()).filter(|l| !l.is_empty()).collect();
        if lines.is_empty() {
            return Err("Empty rule".to_string());
        }

        let mut name = String::new();
        let mut when_clauses = Vec::new();
        let mut then_clauses = Vec::new();
        let mut in_when = false;
        let mut in_then = false;

        for line in lines {
            if line.starts_with("rule ") {
                // Extract name from: rule "Name"
                if let Some(start) = line.find('"') {
                    if let Some(end) = line[start + 1..].find('"') {
                        name = line[start + 1..start + 1 + end].to_string();
                    }
                }
            } else if line == "when" {
                in_when = true;
                in_then = false;
            } else if line == "then" {
                in_then = true;
                in_when = false;
            } else if in_when {
                // Parse condition: message_in contains "text"
                if line.starts_with("message_in contains ") {
                    if let Some(start) = line.find('"') {
                        if let Some(end) = line[start + 1..].find('"') {
                            let text = line[start + 1..start + 1 + end].to_string();
                            when_clauses.push(Condition::MessageContains(text));
                        }
                    }
                } else if line.starts_with("message_in from ") {
                    if let Some(start) = line.find('"') {
                        if let Some(end) = line[start + 1..].find('"') {
                            let from = line[start + 1..start + 1 + end].to_string();
                            when_clauses.push(Condition::MessageFrom(from));
                        }
                    }
                }
            } else if in_then {
                // Parse action: draft "text" or send "text"
                if line.starts_with("draft ") {
                    if let Some(start) = line.find('"') {
                        if let Some(end) = line[start + 1..].find('"') {
                            let text = line[start + 1..start + 1 + end].to_string();
                            then_clauses.push(Action::Draft(text));
                        }
                    }
                } else if line.starts_with("send ") {
                    if let Some(start) = line.find('"') {
                        if let Some(end) = line[start + 1..].find('"') {
                            let text = line[start + 1..start + 1 + end].to_string();
                            then_clauses.push(Action::Send(text));
                        }
                    }
                }
            }
        }

        if name.is_empty() {
            return Err("Rule name is required".to_string());
        }
        if when_clauses.is_empty() {
            return Err("At least one 'when' condition is required".to_string());
        }
        if then_clauses.is_empty() {
            return Err("At least one 'then' action is required".to_string());
        }

        Ok(RuleAST {
            name,
            when: when_clauses,
            then: then_clauses,
        })
    }

    pub fn compile_rule(&self, dsl: &str) -> Result<Value, String> {
        let ast = self.parse_dsl(dsl)?;
        Ok(serde_json::to_value(&ast).map_err(|e| format!("Serialization error: {}", e))?)
    }

    pub fn evaluate_rule(&self, rule: &Rule, message_body: &str, message_from: &str, thread_id: &str) -> Result<Vec<Action>, String> {
        if !rule.enabled {
            return Ok(Vec::new());
        }

        let ast: RuleAST = if let Some(ref compiled) = rule.compiled_json {
            serde_json::from_value(compiled.clone())
                .map_err(|e| format!("Failed to parse compiled rule: {}", e))?
        } else if let Some(ref dsl) = rule.dsl {
            self.parse_dsl(dsl)?
        } else {
            return Ok(Vec::new());
        };

        // Check conditions
        let mut matches = true;
        for condition in &ast.when {
            match condition {
                Condition::MessageContains(text) => {
                    if !message_body.to_lowercase().contains(&text.to_lowercase()) {
                        matches = false;
                        break;
                    }
                }
                Condition::MessageFrom(from) => {
                    if message_from != from {
                        matches = false;
                        break;
                    }
                }
                Condition::ThreadId(tid) => {
                    if thread_id != tid {
                        matches = false;
                        break;
                    }
                }
            }
        }

        if matches {
            Ok(ast.then.clone())
        } else {
            Ok(Vec::new())
        }
    }

    pub fn run_rules_for_message(&self, account_id: &str, message_body: &str, message_from: &str, thread_id: &str, send_enabled: bool) -> Result<Vec<Action>, String> {
        let rules = self.storage.list_rules(account_id)
            .map_err(|e| format!("Failed to list rules: {}", e))?;
        
        let mut all_actions = Vec::new();
        for (id, name, enabled, dsl, compiled_json) in rules {
            if !enabled {
                continue;
            }

            let rule = Rule {
                id,
                account_id: account_id.to_string(),
                name,
                enabled,
                dsl,
                compiled_json: compiled_json.and_then(|s| serde_json::from_str(&s).ok()),
            };

            let actions = self.evaluate_rule(&rule, message_body, message_from, thread_id)?;
            for action in actions {
                // Filter out Send actions if not enabled
                if let Action::Send(_) = action {
                    if !send_enabled {
                        continue; // Skip send actions if feature flag is off
                    }
                }
                all_actions.push(action);
            }
        }

        Ok(all_actions)
    }
}

