use serde::{Deserialize, Serialize};
use serde_json::json;

/// Application error types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AppError {
    /// Database operation failed
    Database(String),
    /// File system operation failed
    FileSystem(String),
    /// Signal CLI operation failed
    SignalCli(String),
    /// Invalid input or configuration
    InvalidInput(String),
    /// Network or I/O error
    Io(String),
    /// Authentication/authorization error
    Auth(String),
    /// Feature not available
    FeatureDisabled(String),
    /// Generic error
    Generic(String),
}

impl AppError {
    /// Convert error to user-friendly message
    pub fn user_message(&self) -> String {
        match self {
            AppError::Database(msg) => format!("Database error: {}", msg),
            AppError::FileSystem(msg) => format!("File system error: {}", msg),
            AppError::SignalCli(msg) => format!("Signal CLI error: {}", msg),
            AppError::InvalidInput(msg) => format!("Invalid input: {}", msg),
            AppError::Io(msg) => format!("I/O error: {}", msg),
            AppError::Auth(msg) => format!("Authentication error: {}", msg),
            AppError::FeatureDisabled(feature) => {
                format!("Feature '{}' is not enabled", feature)
            }
            AppError::Generic(msg) => msg.clone(),
        }
    }

    /// Convert error to JSON response format
    pub fn to_json(&self) -> serde_json::Value {
        json!({
            "success": false,
            "error": self.user_message(),
            "error_type": self.error_type(),
        })
    }

    /// Get error type string
    pub fn error_type(&self) -> &str {
        match self {
            AppError::Database(_) => "database",
            AppError::FileSystem(_) => "filesystem",
            AppError::SignalCli(_) => "signal_cli",
            AppError::InvalidInput(_) => "invalid_input",
            AppError::Io(_) => "io",
            AppError::Auth(_) => "auth",
            AppError::FeatureDisabled(_) => "feature_disabled",
            AppError::Generic(_) => "generic",
        }
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.user_message())
    }
}

impl std::error::Error for AppError {}

/// Result type alias for application operations
pub type AppResult<T> = Result<T, AppError>;

/// Helper to convert Result to JSON response
pub fn result_to_json<T: serde::Serialize>(result: AppResult<T>) -> serde_json::Value {
    match result {
        Ok(data) => json!({
            "success": true,
            "data": data
        }),
        Err(err) => err.to_json(),
    }
}

/// Helper to convert standard Result to AppResult
pub fn map_io_error<T>(result: Result<T, std::io::Error>) -> AppResult<T> {
    result.map_err(|e| AppError::Io(e.to_string()))
}

/// Helper to convert database errors
pub fn map_db_error<T>(result: Result<T, rusqlite::Error>) -> AppResult<T> {
    result.map_err(|e| AppError::Database(e.to_string()))
}

/// Helper to convert serde_json errors
pub fn map_json_error<T>(result: Result<T, serde_json::Error>) -> AppResult<T> {
    result.map_err(|e| AppError::InvalidInput(format!("JSON error: {}", e)))
}
