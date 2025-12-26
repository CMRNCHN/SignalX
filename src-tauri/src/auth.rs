use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use argon2::password_hash::{rand_core::OsRng, SaltString};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use uuid::Uuid;

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Role {
    Viewer,
    Operator,
    Admin,
}

impl Role {
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "viewer" => Some(Role::Viewer),
            "operator" => Some(Role::Operator),
            "admin" => Some(Role::Admin),
            _ => None,
        }
    }

    pub fn to_str(&self) -> &str {
        match self {
            Role::Viewer => "viewer",
            Role::Operator => "operator",
            Role::Admin => "admin",
        }
    }

    pub fn can_send_messages(&self) -> bool {
        matches!(self, Role::Operator | Role::Admin)
    }

    pub fn can_edit_rules(&self) -> bool {
        matches!(self, Role::Operator | Role::Admin)
    }

    pub fn can_view_diagnostics(&self) -> bool {
        matches!(self, Role::Operator | Role::Admin)
    }

    pub fn can_manage_users(&self) -> bool {
        matches!(self, Role::Admin)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Session {
    pub token: String,
    pub user_id: String,
    pub username: String,
    pub role: String,
    pub created_at: i64,
}

pub struct AuthManager {
    sessions: Arc<Mutex<HashMap<String, Session>>>,
    storage: Arc<crate::storage::Storage>,
}

impl AuthManager {
    pub fn new(storage: Arc<crate::storage::Storage>) -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            storage,
        }
    }

    pub fn hash_password(password: &str) -> Result<String, String> {
        let salt = SaltString::generate(&mut OsRng);
        let argon2 = Argon2::default();
        let password_hash = argon2
            .hash_password(password.as_bytes(), &salt)
            .map_err(|e| format!("Password hashing failed: {}", e))?;
        Ok(password_hash.to_string())
    }

    pub fn verify_password(password: &str, hash: &str) -> Result<bool, String> {
        // For argon2 0.5, parse hash string - try different methods
        let parsed_hash = PasswordHash::parse(hash, argon2::password_hash::Encoding::B64)
            .or_else(|_| PasswordHash::parse(hash, argon2::password_hash::Encoding::B64))
            .map_err(|e| format!("Invalid hash format: {}", e))?;
        let argon2 = Argon2::default();
        match argon2.verify_password(password.as_bytes(), &parsed_hash) {
            Ok(()) => Ok(true),
            Err(_) => Ok(false),
        }
    }

    pub fn create_user(&self, username: &str, password: &str, role: &str) -> Result<String, String> {
        // Check if user exists
        if let Ok(Some(_)) = self.storage.get_user_by_username(username) {
            return Err("User already exists".to_string());
        }

        let user_id = Uuid::new_v4().to_string();
        let pw_hash = Self::hash_password(password)?;
        self.storage
            .create_user(&user_id, username, &pw_hash, role)
            .map_err(|e| format!("Failed to create user: {}", e))?;
        Ok(user_id)
    }

    pub fn login(&self, username: &str, password: &str) -> Result<Session, String> {
        let (user_id, pw_hash, role) = self
            .storage
            .get_user_by_username(username)
            .map_err(|e| format!("Database error: {}", e))?
            .ok_or_else(|| "Invalid username or password".to_string())?;

        let is_valid = Self::verify_password(password, &pw_hash)
            .map_err(|e| format!("Password verification error: {}", e))?;
        if !is_valid {
            return Err("Invalid username or password".to_string());
        }

        let token = Uuid::new_v4().to_string();
        let session = Session {
            token: token.clone(),
            user_id,
            username: username.to_string(),
            role,
            created_at: chrono::Utc::now().timestamp(),
        };

        let mut sessions = self.sessions.lock().map_err(|e| format!("Session mutex poisoned: {}", e))?;
        sessions.insert(token.clone(), session.clone());
        Ok(session)
    }

    pub fn get_session(&self, token: &str) -> Option<Session> {
        let sessions = self.sessions.lock().map_err(|e| format!("Session mutex poisoned: {}", e))?;
        sessions.get(token).cloned()
    }

    pub fn logout(&self, token: &str) {
        let mut sessions = self.sessions.lock().map_err(|e| format!("Session mutex poisoned: {}", e))?;
        sessions.remove(token);
    }

    pub fn ensure_admin_exists(&self) -> Result<(), String> {
        let users = self.storage.list_users().map_err(|e| format!("Failed to list users: {}", e))?;
        if users.is_empty() {
            // Check for environment-provided initial credentials
            let default_username = std::env::var("SIGNALX_INITIAL_ADMIN_USER")
                .unwrap_or_else(|_| "admin".to_string());
            let default_password = std::env::var("SIGNALX_INITIAL_ADMIN_PASSWORD")
                .or_else(|_| std::env::var("SIGNALX_ADMIN_PASSWORD"))
                .map_err(|_| {
                    "No users exist and no initial admin credentials provided. \
                     Set SIGNALX_INITIAL_ADMIN_USER and SIGNALX_INITIAL_ADMIN_PASSWORD \
                     environment variables to create the first admin user.".to_string()
                })?;

            let user_id = self.create_user(&default_username, &default_password, "admin")?;
            eprintln!("Created initial admin user: {} (password set via environment)", default_username);
            Ok(())
        } else {
            Ok(())
        }
    }

    pub fn require_role(&self, token: Option<&str>, min_role: Role) -> Result<Session, String> {
        let session = token
            .and_then(|t| self.get_session(t))
            .ok_or_else(|| "Authentication required".to_string())?;

        let user_role = Role::from_str(&session.role)
            .ok_or_else(|| "Invalid role".to_string())?;

        if user_role < min_role {
            return Err(format!("Insufficient permissions. Required: {:?}", min_role));
        }

        Ok(session)
    }
}

