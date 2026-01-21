// AI integration with Ollama for smart replies
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Ollama API client configuration
#[derive(Debug, Clone)]
pub struct OllamaConfig {
    pub url: String,
    pub model: String,
    pub timeout: Duration,
}

impl Default for OllamaConfig {
    fn default() -> Self {
        Self {
            url: std::env::var("SIGNALX_OLLAMA_URL")
                .unwrap_or_else(|_| "http://localhost:11434".to_string()),
            model: std::env::var("SIGNALX_OLLAMA_MODEL")
                .unwrap_or_else(|_| "llama2".to_string()),
            timeout: Duration::from_secs(30),
        }
    }
}

/// Request to Ollama API
#[derive(Debug, Serialize)]
struct OllamaRequest {
    model: String,
    prompt: String,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    options: Option<OllamaOptions>,
}

/// Ollama generation options
#[derive(Debug, Serialize)]
struct OllamaOptions {
    temperature: f32,
    top_p: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    num_predict: Option<u32>,
}

/// Response from Ollama API
#[derive(Debug, Deserialize)]
struct OllamaResponse {
    model: String,
    response: String,
    done: bool,
    #[serde(default)]
    total_duration: u64,
}

/// AI reply generation client
pub struct OllamaClient {
    config: OllamaConfig,
    client: reqwest::Client,
}

impl OllamaClient {
    /// Create new Ollama client with default config
    pub fn new() -> Self {
        Self::with_config(OllamaConfig::default())
    }

    /// Create new Ollama client with custom config
    pub fn with_config(config: OllamaConfig) -> Self {
        let client = reqwest::Client::builder()
            .timeout(config.timeout)
            .build()
            .expect("Failed to create HTTP client");

        Self { config, client }
    }

    /// Check if Ollama is available
    pub async fn health_check(&self) -> Result<bool, Box<dyn std::error::Error>> {
        let url = format!("{}/api/version", self.config.url);
        match self.client.get(&url).send().await {
            Ok(response) => Ok(response.status().is_success()),
            Err(_) => Ok(false),
        }
    }

    /// Generate a reply based on conversation context
    pub async fn generate_reply(
        &self,
        messages: &[String],
        intent: &str,
        constraints: Option<&str>,
    ) -> Result<String, Box<dyn std::error::Error>> {
        let system_prompt = Self::build_system_prompt(intent, constraints);
        let user_prompt = Self::build_user_prompt(messages);

        let request = OllamaRequest {
            model: self.config.model.clone(),
            prompt: user_prompt,
            stream: false,
            system: Some(system_prompt),
            options: Some(OllamaOptions {
                temperature: 0.7,
                top_p: 0.9,
                num_predict: Some(150),
            }),
        };

        let url = format!("{}/api/generate", self.config.url);
        let response = self
            .client
            .post(&url)
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(format!("Ollama API error: {}", response.status()).into());
        }

        let ollama_response: OllamaResponse = response.json().await?;
        Ok(ollama_response.response.trim().to_string())
    }

    /// Summarize a conversation thread
    pub async fn summarize_thread(
        &self,
        messages: &[String],
        length: SummaryLength,
    ) -> Result<String, Box<dyn std::error::Error>> {
        let system_prompt = format!(
            "You are a helpful assistant that summarizes Signal message conversations. \
             Provide a {} summary that captures the key points and action items.",
            match length {
                SummaryLength::Brief => "brief (1-2 sentences)",
                SummaryLength::Normal => "concise (1 paragraph)",
                SummaryLength::Detailed => "detailed (key points with bullet points)",
            }
        );

        let user_prompt = format!(
            "Summarize this conversation:\n\n{}",
            messages.join("\n")
        );

        let request = OllamaRequest {
            model: self.config.model.clone(),
            prompt: user_prompt,
            stream: false,
            system: Some(system_prompt),
            options: Some(OllamaOptions {
                temperature: 0.5,
                top_p: 0.9,
                num_predict: match length {
                    SummaryLength::Brief => Some(50),
                    SummaryLength::Normal => Some(150),
                    SummaryLength::Detailed => Some(300),
                },
            }),
        };

        let url = format!("{}/api/generate", self.config.url);
        let response = self.client.post(&url).json(&request).send().await?;

        if !response.status().is_success() {
            return Err(format!("Ollama API error: {}", response.status()).into());
        }

        let ollama_response: OllamaResponse = response.json().await?;
        Ok(ollama_response.response.trim().to_string())
    }

    /// Build system prompt based on intent
    fn build_system_prompt(intent: &str, constraints: Option<&str>) -> String {
        let base_prompt = match intent {
            "reply" => "You are a helpful assistant generating replies to Signal messages. \
                       Generate natural, concise replies that match the conversation tone.",
            "confirm" => "You are a helpful assistant generating confirmation messages. \
                         Generate brief, friendly confirmations.",
            "decline" => "You are a helpful assistant generating polite decline messages. \
                         Be respectful and provide a brief reason if appropriate.",
            "acknowledge" => "You are a helpful assistant generating acknowledgment messages. \
                            Generate brief, professional acknowledgments.",
            "ask" => "You are a helpful assistant generating follow-up questions. \
                     Ask clear, relevant questions based on the context.",
            _ => "You are a helpful assistant generating replies to Signal messages.",
        };

        if let Some(c) = constraints {
            format!("{} Additional constraints: {}", base_prompt, c)
        } else {
            base_prompt.to_string()
        }
    }

    /// Build user prompt from message history
    fn build_user_prompt(messages: &[String]) -> String {
        if messages.is_empty() {
            return "Generate a greeting message.".to_string();
        }

        // Use last 5 messages for context
        let context_messages: Vec<String> = messages
            .iter()
            .rev()
            .take(5)
            .rev()
            .cloned()
            .collect();

        format!(
            "Recent conversation:\n{}\n\nGenerate an appropriate reply to the most recent message.",
            context_messages.join("\n")
        )
    }

    /// Calculate confidence score for generated reply
    pub fn calculate_confidence(&self, reply: &str, context: &[String]) -> f32 {
        let mut score = 50.0; // Base score

        // Length check (reasonable replies are 10-200 chars)
        let len = reply.len();
        if len >= 10 && len <= 200 {
            score += 20.0;
        } else if len < 10 {
            score -= 20.0;
        }

        // Context relevance (simple keyword matching)
        if !context.is_empty() {
            let last_message = &context[context.len() - 1];
            let last_words: Vec<&str> = last_message.split_whitespace().collect();
            let reply_words: Vec<&str> = reply.split_whitespace().collect();
            
            let common_words = last_words
                .iter()
                .filter(|w| reply_words.contains(w) && w.len() > 3)
                .count();
            
            score += (common_words as f32 * 5.0).min(20.0);
        }

        // Question detection (lower confidence for questions back)
        if reply.contains('?') {
            score -= 10.0;
        }

        // Politeness indicators
        if reply.to_lowercase().contains("thank") || 
           reply.to_lowercase().contains("please") {
            score += 10.0;
        }

        // Clamp to 0-100
        score.max(0.0).min(100.0)
    }
}

/// Summary length options
#[derive(Debug, Clone, Copy)]
pub enum SummaryLength {
    Brief,
    Normal,
    Detailed,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_system_prompt_building() {
        let prompt = OllamaClient::build_system_prompt("reply", None);
        assert!(prompt.contains("replies to Signal messages"));

        let prompt_with_constraints = OllamaClient::build_system_prompt(
            "reply",
            Some("Keep it brief and professional")
        );
        assert!(prompt_with_constraints.contains("Additional constraints"));
    }

    #[test]
    fn test_confidence_scoring() {
        let client = OllamaClient::new();
        let context = vec!["How are you?".to_string()];
        
        // Good reply
        let score = client.calculate_confidence("I'm doing well, thank you!", &context);
        assert!(score > 50.0);
        
        // Too short
        let score = client.calculate_confidence("Ok", &context);
        assert!(score < 50.0);
        
        // Question back (lower confidence)
        let score = client.calculate_confidence("How about you?", &context);
        assert!(score < 70.0);
    }
}

