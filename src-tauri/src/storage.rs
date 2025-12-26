use rusqlite::{Connection, Result as SqlResult, params};
use serde_json::Value;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

pub struct Storage {
    conn: Arc<Mutex<Connection>>,
}

impl Storage {
    pub fn new(db_path: PathBuf) -> Result<Self, String> {
        let conn = Connection::open(db_path).map_err(|e| format!("Failed to open database: {}", e))?;
        let storage = Storage {
            conn: Arc::new(Mutex::new(conn)),
        };
        storage.init_db()?;
        Ok(storage)
    }

    fn init_db(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Database mutex poisoned: {}", e))?;
        
        // Accounts
        conn.execute(
            "CREATE TABLE IF NOT EXISTS accounts (
                id TEXT PRIMARY KEY,
                display_name TEXT,
                phone_number TEXT UNIQUE NOT NULL,
                created_at INTEGER NOT NULL
            )",
            [],
        )?;

        // Threads
        conn.execute(
            "CREATE TABLE IF NOT EXISTS threads (
                id TEXT PRIMARY KEY,
                account_id TEXT NOT NULL,
                title TEXT,
                last_message_ts INTEGER,
                unread_count INTEGER DEFAULT 0,
                FOREIGN KEY (account_id) REFERENCES accounts(id)
            )",
            [],
        )?;

        // Messages
        conn.execute(
            "CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                thread_id TEXT NOT NULL,
                account_id TEXT NOT NULL,
                direction TEXT NOT NULL,
                sender TEXT,
                body TEXT,
                ts INTEGER NOT NULL,
                status TEXT,
                FOREIGN KEY (thread_id) REFERENCES threads(id),
                FOREIGN KEY (account_id) REFERENCES accounts(id)
            )",
            [],
        )?;

        // Contacts
        conn.execute(
            "CREATE TABLE IF NOT EXISTS contacts (
                id TEXT PRIMARY KEY,
                account_id TEXT NOT NULL,
                name TEXT,
                phone_number TEXT NOT NULL,
                labels TEXT,
                FOREIGN KEY (account_id) REFERENCES accounts(id)
            )",
            [],
        )?;

        // Rules
        conn.execute(
            "CREATE TABLE IF NOT EXISTS rules (
                id TEXT PRIMARY KEY,
                account_id TEXT NOT NULL,
                name TEXT NOT NULL,
                enabled INTEGER DEFAULT 0,
                dsl TEXT,
                compiled_json TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY (account_id) REFERENCES accounts(id)
            )",
            [],
        )?;

        // Sessions/Users (for auth)
        conn.execute(
            "CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                pw_hash TEXT NOT NULL,
                role TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )",
            [],
        )?;

        // Audit log
        conn.execute(
            "CREATE TABLE IF NOT EXISTS audit_log (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                action TEXT NOT NULL,
                entity_type TEXT,
                entity_id TEXT,
                ts INTEGER NOT NULL,
                meta TEXT,
                FOREIGN KEY (user_id) REFERENCES users(user_id)
            )",
            [],
        )?;

        // Indexes
        conn.execute("CREATE INDEX IF NOT EXISTS idx_threads_account ON threads(account_id)", [])?;
        conn.execute("CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id)", [])?;
        conn.execute("CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(ts)", [])?;
        conn.execute("CREATE INDEX IF NOT EXISTS idx_contacts_account ON contacts(account_id)", [])?;
        conn.execute("CREATE INDEX IF NOT EXISTS idx_rules_account ON rules(account_id)", [])?;
        conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id)", [])?;
        conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts)", [])?;

        Ok(())
    }

    // Account operations
    pub fn upsert_account(&self, id: &str, display_name: Option<&str>, phone_number: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Database mutex poisoned: {}", e))?;
        let now = chrono::Utc::now().timestamp();
        conn.execute(
            "INSERT INTO accounts (id, display_name, phone_number, created_at)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(id) DO UPDATE SET display_name = ?2, phone_number = ?3",
            params![id, display_name, phone_number, now],
        ).map_err(|e| format!("Failed to upsert account: {}", e))?;
        Ok(())
    }

    pub fn list_accounts(&self) -> Result<Vec<(String, Option<String>, String)>, String> {
        let conn = self.conn.lock().map_err(|e| format!("Database mutex poisoned: {}", e))?;
        let mut stmt = conn.prepare("SELECT id, display_name, phone_number FROM accounts")
            .map_err(|e| format!("Failed to prepare accounts query: {}", e))?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        }).map_err(|e| format!("Failed to query accounts: {}", e))?;
        let mut accounts = Vec::new();
        for row in rows {
            accounts.push(row.map_err(|e| format!("Failed to read account row: {}", e))?);
        }
        Ok(accounts)
    }

    // Thread operations
    pub fn upsert_thread(&self, id: &str, account_id: &str, title: Option<&str>, last_message_ts: Option<i64>, unread_count: u32) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO threads (id, account_id, title, last_message_ts, unread_count)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET title = ?3, last_message_ts = ?4, unread_count = ?5",
            params![id, account_id, title, last_message_ts, unread_count],
        )?;
        Ok(())
    }

    pub fn list_threads(&self, account_id: &str) -> SqlResult<Vec<(String, Option<String>, Option<i64>, u32)>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, title, last_message_ts, unread_count FROM threads WHERE account_id = ?1 ORDER BY last_message_ts DESC")?;
        let rows = stmt.query_map(params![account_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get::<_, i32>(3)? as u32))
        })?;
        let mut threads = Vec::new();
        for row in rows {
            threads.push(row?);
        }
        Ok(threads)
    }

    // Message operations
    pub fn insert_message(&self, id: &str, thread_id: &str, account_id: &str, direction: &str, sender: Option<&str>, body: &str, ts: i64, status: Option<&str>) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO messages (id, thread_id, account_id, direction, sender, body, ts, status)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![id, thread_id, account_id, direction, sender, body, ts, status],
        )?;
        Ok(())
    }

    pub fn list_messages(&self, thread_id: &str, limit: Option<i32>) -> SqlResult<Vec<(String, String, Option<String>, String, i64, Option<String>)>> {
        let conn = self.conn.lock().unwrap();
        let limit_val = limit.unwrap_or(100);
        let mut stmt = conn.prepare(
            "SELECT id, direction, sender, body, ts, status FROM messages 
             WHERE thread_id = ?1 ORDER BY ts DESC LIMIT ?2"
        )?;
        let rows = stmt.query_map(params![thread_id, limit_val], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?))
        })?;
        let mut messages = Vec::new();
        for row in rows {
            messages.push(row?);
        }
        Ok(messages)
    }

    // Contact operations
    pub fn upsert_contact(&self, id: &str, account_id: &str, name: Option<&str>, phone_number: &str, labels: Option<&str>) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO contacts (id, account_id, name, phone_number, labels)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET name = ?3, phone_number = ?4, labels = ?5",
            params![id, account_id, name, phone_number, labels],
        )?;
        Ok(())
    }

    pub fn list_contacts(&self, account_id: &str) -> SqlResult<Vec<(String, Option<String>, String, Option<String>)>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, name, phone_number, labels FROM contacts WHERE account_id = ?1")?;
        let rows = stmt.query_map(params![account_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })?;
        let mut contacts = Vec::new();
        for row in rows {
            contacts.push(row?);
        }
        Ok(contacts)
    }

    // Rule operations
    pub fn upsert_rule(&self, id: &str, account_id: &str, name: &str, enabled: bool, dsl: Option<&str>, compiled_json: Option<&str>) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().timestamp();
        let enabled_int = if enabled { 1 } else { 0 };
        conn.execute(
            "INSERT INTO rules (id, account_id, name, enabled, dsl, compiled_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(id) DO UPDATE SET name = ?3, enabled = ?4, dsl = ?5, compiled_json = ?6, updated_at = ?8",
            params![id, account_id, name, enabled_int, dsl, compiled_json, now, now],
        )?;
        Ok(())
    }

    pub fn list_rules(&self, account_id: &str) -> SqlResult<Vec<(String, String, bool, Option<String>, Option<String>)>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, name, enabled, dsl, compiled_json FROM rules WHERE account_id = ?1")?;
        let rows = stmt.query_map(params![account_id], |row| {
            let enabled_int: i32 = row.get(2)?;
            Ok((row.get(0)?, row.get(1)?, enabled_int != 0, row.get(3)?, row.get(4)?))
        })?;
        let mut rules = Vec::new();
        for row in rows {
            rules.push(row?);
        }
        Ok(rules)
    }

    pub fn toggle_rule(&self, id: &str, enabled: bool) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        let enabled_int = if enabled { 1 } else { 0 };
        conn.execute("UPDATE rules SET enabled = ?1 WHERE id = ?2", params![enabled_int, id])?;
        Ok(())
    }

    // User/Auth operations
    pub fn create_user(&self, user_id: &str, username: &str, pw_hash: &str, role: &str) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().timestamp();
        conn.execute(
            "INSERT INTO users (user_id, username, pw_hash, role, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![user_id, username, pw_hash, role, now],
        )?;
        Ok(())
    }

    pub fn get_user_by_username(&self, username: &str) -> SqlResult<Option<(String, String, String)>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT user_id, pw_hash, role FROM users WHERE username = ?1")?;
        let mut rows = stmt.query_map(params![username], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })?;
        if let Some(row) = rows.next() {
            Ok(Some(row?))
        } else {
            Ok(None)
        }
    }

    pub fn list_users(&self) -> SqlResult<Vec<(String, String, String)>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT user_id, username, role FROM users")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })?;
        let mut users = Vec::new();
        for row in rows {
            users.push(row?);
        }
        Ok(users)
    }

    // Audit log
    pub fn log_audit(&self, id: &str, user_id: Option<&str>, action: &str, entity_type: Option<&str>, entity_id: Option<&str>, meta: Option<&str>) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        let ts = chrono::Utc::now().timestamp();
        conn.execute(
            "INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, ts, meta)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, user_id, action, entity_type, entity_id, ts, meta],
        )?;
        Ok(())
    }
}

