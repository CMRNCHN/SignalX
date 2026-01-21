/// Automation rules engine for auto-reply functionality
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc, Timelike, Weekday, Datelike};

// Wrapper for Weekday to make it serializable
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WeekDay {
    Mon,
    Tue,
    Wed,
    Thu,
    Fri,
    Sat,
    Sun,
}

impl From<WeekDay> for Weekday {
    fn from(wd: WeekDay) -> Self {
        match wd {
            WeekDay::Mon => Weekday::Mon,
            WeekDay::Tue => Weekday::Tue,
            WeekDay::Wed => Weekday::Wed,
            WeekDay::Thu => Weekday::Thu,
            WeekDay::Fri => Weekday::Fri,
            WeekDay::Sat => Weekday::Sat,
            WeekDay::Sun => Weekday::Sun,
        }
    }
}

impl From<Weekday> for WeekDay {
    fn from(wd: Weekday) -> Self {
        match wd {
            Weekday::Mon => WeekDay::Mon,
            Weekday::Tue => WeekDay::Tue,
            Weekday::Wed => WeekDay::Wed,
            Weekday::Thu => WeekDay::Thu,
            Weekday::Fri => WeekDay::Fri,
            Weekday::Sat => WeekDay::Sat,
            Weekday::Sun => WeekDay::Sun,
        }
    }
}

/// Automation rule that triggers actions based on conditions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationRule {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub trigger: Trigger,
    pub action: Action,
    #[serde(default)]
    pub priority: u32,
}

/// Trigger conditions for rules
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum Trigger {
    /// Time-based trigger (after hours, weekends, etc.)
    TimeRange {
        start_hour: u32,  // 0-23
        end_hour: u32,    // 0-23
        #[serde(default)]
        days: Vec<WeekDay>,  // Empty = all days
    },
    
    /// Keyword-based trigger
    Keyword {
        keywords: Vec<String>,
        #[serde(default)]
        case_sensitive: bool,
        #[serde(default)]
        match_any: bool,  // true = OR, false = AND
    },
    
    /// Sender-based trigger
    Sender {
        contacts: Vec<String>,  // Phone numbers or thread IDs
        #[serde(default)]
        groups: Vec<String>,
    },
    
    /// Combined trigger (all conditions must match)
    All {
        conditions: Vec<Trigger>,
    },
    
    /// Combined trigger (any condition can match)
    Any {
        conditions: Vec<Trigger>,
    },
}

/// Action to take when rule triggers
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum Action {
    /// Generate AI reply
    GenerateReply {
        intent: String,
        #[serde(default)]
        constraints: Option<String>,
        #[serde(default)]
        auto_send: bool,
        #[serde(default = "default_confidence_threshold")]
        confidence_threshold: f32,
    },
    
    /// Send a pre-defined message
    SendMessage {
        content: String,
    },
    
    /// Mark as read but don't reply
    MarkRead,
    
    /// Send notification
    Notify {
        #[serde(default)]
        urgent: bool,
    },
}

fn default_confidence_threshold() -> f32 {
    80.0
}

/// Rule engine that evaluates and executes automation rules
pub struct AutomationEngine {
    rules: Vec<AutomationRule>,
}

impl AutomationEngine {
    /// Create new rule engine
    pub fn new() -> Self {
        Self { rules: vec![] }
    }

    /// Load rules from storage
    pub fn load_rules(&mut self, rules: Vec<AutomationRule>) {
        self.rules = rules;
        // Sort by priority (higher priority first)
        self.rules.sort_by(|a, b| b.priority.cmp(&a.priority));
    }

    /// Add a rule
    pub fn add_rule(&mut self, rule: AutomationRule) {
        self.rules.push(rule);
        self.rules.sort_by(|a, b| b.priority.cmp(&a.priority));
    }

    /// Remove a rule by ID
    pub fn remove_rule(&mut self, rule_id: &str) -> bool {
        if let Some(index) = self.rules.iter().position(|r| r.id == rule_id) {
            self.rules.remove(index);
            true
        } else {
            false
        }
    }

    /// Find matching rules for a message
    pub fn find_matching_rules(
        &self,
        sender: &str,
        message: &str,
        thread_id: &str,
    ) -> Vec<&AutomationRule> {
        let now = Utc::now();
        
        self.rules
            .iter()
            .filter(|rule| {
                rule.enabled && self.evaluate_trigger(&rule.trigger, sender, message, thread_id, &now)
            })
            .collect()
    }

    /// Evaluate if a trigger matches current conditions
    fn evaluate_trigger(
        &self,
        trigger: &Trigger,
        sender: &str,
        message: &str,
        thread_id: &str,
        now: &DateTime<Utc>,
    ) -> bool {
        match trigger {
            Trigger::TimeRange { start_hour, end_hour, days } => {
                self.check_time_range(*start_hour, *end_hour, days, now)
            }
            
            Trigger::Keyword { keywords, case_sensitive, match_any } => {
                self.check_keywords(message, keywords, *case_sensitive, *match_any)
            }
            
            Trigger::Sender { contacts, groups } => {
                self.check_sender(sender, thread_id, contacts, groups)
            }
            
            Trigger::All { conditions } => {
                conditions.iter().all(|c| {
                    self.evaluate_trigger(c, sender, message, thread_id, now)
                })
            }
            
            Trigger::Any { conditions } => {
                conditions.iter().any(|c| {
                    self.evaluate_trigger(c, sender, message, thread_id, now)
                })
            }
        }
    }

    /// Check if current time is within specified range
    fn check_time_range(
        &self,
        start_hour: u32,
        end_hour: u32,
        days: &[WeekDay],
        now: &DateTime<Utc>,
    ) -> bool {
        let current_hour = now.hour();
        let current_day = now.weekday();

        // Check day of week if specified
        if !days.is_empty() {
            let current_weekday: WeekDay = current_day.into();
            if !days.iter().any(|d| matches!((d, &current_weekday),
                (WeekDay::Mon, WeekDay::Mon) |
                (WeekDay::Tue, WeekDay::Tue) |
                (WeekDay::Wed, WeekDay::Wed) |
                (WeekDay::Thu, WeekDay::Thu) |
                (WeekDay::Fri, WeekDay::Fri) |
                (WeekDay::Sat, WeekDay::Sat) |
                (WeekDay::Sun, WeekDay::Sun)
            )) {
                return false;
            }
        }

        // Check time range
        if start_hour <= end_hour {
            // Normal range (e.g., 9-17)
            current_hour >= start_hour && current_hour < end_hour
        } else {
            // Wraps around midnight (e.g., 18-9)
            current_hour >= start_hour || current_hour < end_hour
        }
    }

    /// Check if message contains keywords
    fn check_keywords(
        &self,
        message: &str,
        keywords: &[String],
        case_sensitive: bool,
        match_any: bool,
    ) -> bool {
        let msg = if case_sensitive {
            message.to_string()
        } else {
            message.to_lowercase()
        };

        let keywords: Vec<String> = keywords
            .iter()
            .map(|k| if case_sensitive { k.clone() } else { k.to_lowercase() })
            .collect();

        if match_any {
            // OR logic - any keyword matches
            keywords.iter().any(|k| msg.contains(k))
        } else {
            // AND logic - all keywords must match
            keywords.iter().all(|k| msg.contains(k))
        }
    }

    /// Check if sender matches criteria
    fn check_sender(
        &self,
        sender: &str,
        thread_id: &str,
        contacts: &[String],
        groups: &[String],
    ) -> bool {
        // Check if sender is in contact list
        if contacts.iter().any(|c| sender.contains(c)) {
            return true;
        }

        // Check if thread is in group list
        if groups.iter().any(|g| thread_id.contains(g)) {
            return true;
        }

        false
    }

    /// Get all rules
    pub fn get_rules(&self) -> &[AutomationRule] {
        &self.rules
    }

    /// Get enabled rules count
    pub fn enabled_count(&self) -> usize {
        self.rules.iter().filter(|r| r.enabled).count()
    }
}

/// Helper to create common rule templates
pub mod templates {
    use super::*;

    /// Out of office rule (after hours)
    pub fn out_of_office(auto_send: bool) -> AutomationRule {
        AutomationRule {
            id: uuid::Uuid::new_v4().to_string(),
            name: "Out of Office".to_string(),
            enabled: true,
            priority: 10,
            trigger: Trigger::TimeRange {
                start_hour: 18,  // 6 PM
                end_hour: 9,     // 9 AM
                days: vec![
                    WeekDay::Mon,
                    WeekDay::Tue,
                    WeekDay::Wed,
                    WeekDay::Thu,
                    WeekDay::Fri,
                ],
            },
            action: Action::GenerateReply {
                intent: "acknowledge".to_string(),
                constraints: Some("Mention you're offline and will respond tomorrow".to_string()),
                auto_send,
                confidence_threshold: 80.0,
            },
        }
    }

    /// Urgent message rule
    pub fn urgent_message(contacts: Vec<String>) -> AutomationRule {
        AutomationRule {
            id: uuid::Uuid::new_v4().to_string(),
            name: "Urgent Messages".to_string(),
            enabled: true,
            priority: 100,  // High priority
            trigger: Trigger::All {
                conditions: vec![
                    Trigger::Keyword {
                        keywords: vec![
                            "urgent".to_string(),
                            "emergency".to_string(),
                            "asap".to_string(),
                            "critical".to_string(),
                        ],
                        case_sensitive: false,
                        match_any: true,
                    },
                    Trigger::Sender {
                        contacts,
                        groups: vec![],
                    },
                ],
            },
            action: Action::Notify {
                urgent: true,
            },
        }
    }

    /// VIP contact auto-reply
    pub fn vip_auto_reply(contacts: Vec<String>) -> AutomationRule {
        AutomationRule {
            id: uuid::Uuid::new_v4().to_string(),
            name: "VIP Auto Reply".to_string(),
            enabled: true,
            priority: 50,
            trigger: Trigger::Sender {
                contacts,
                groups: vec![],
            },
            action: Action::GenerateReply {
                intent: "reply".to_string(),
                constraints: Some("Be professional and timely".to_string()),
                auto_send: false,  // Review before sending
                confidence_threshold: 85.0,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn test_time_range_check() {
        let engine = AutomationEngine::new();
        
        // Test 9-17 (business hours)
        let time = Utc.with_ymd_and_hms(2024, 1, 15, 14, 0, 0).unwrap();  // 2 PM
        assert!(engine.check_time_range(9, 17, &[], &time));
        
        let time = Utc.with_ymd_and_hms(2024, 1, 15, 8, 0, 0).unwrap();  // 8 AM
        assert!(!engine.check_time_range(9, 17, &[], &time));
        
        // Test 18-9 (after hours)
        let time = Utc.with_ymd_and_hms(2024, 1, 15, 20, 0, 0).unwrap();  // 8 PM
        assert!(engine.check_time_range(18, 9, &[], &time));
        
        let time = Utc.with_ymd_and_hms(2024, 1, 15, 7, 0, 0).unwrap();  // 7 AM
        assert!(engine.check_time_range(18, 9, &[], &time));
    }

    #[test]
    fn test_keyword_matching() {
        let engine = AutomationEngine::new();
        
        // Match any (OR)
        assert!(engine.check_keywords(
            "This is urgent!",
            &["urgent".to_string(), "emergency".to_string()],
            false,
            true
        ));
        
        // Match all (AND)
        assert!(!engine.check_keywords(
            "This is urgent!",
            &["urgent".to_string(), "emergency".to_string()],
            false,
            false
        ));
        
        assert!(engine.check_keywords(
            "This is an urgent emergency!",
            &["urgent".to_string(), "emergency".to_string()],
            false,
            false
        ));
        
        // Case sensitive
        assert!(!engine.check_keywords(
            "This is URGENT!",
            &["urgent".to_string()],
            true,
            true
        ));
    }

    #[test]
    fn test_sender_matching() {
        let engine = AutomationEngine::new();
        
        assert!(engine.check_sender(
            "+1234567890",
            "dm:+1234567890",
            &["+1234567890".to_string()],
            &[]
        ));
        
        assert!(!engine.check_sender(
            "+0987654321",
            "dm:+0987654321",
            &["+1234567890".to_string()],
            &[]
        ));
        
        assert!(engine.check_sender(
            "+0987654321",
            "group:abc123",
            &[],
            &["group:abc123".to_string()]
        ));
    }
}
