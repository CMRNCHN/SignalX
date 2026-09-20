//! Append-only event log used by IVR interactions and outbox send failures.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SimpleAuditEntry {
  pub id: String,
  pub thread_id: String,
  pub created_at: i64,
  pub summary: String,
  pub outcome: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
struct AuditFile {
  version: u32,
  entries: Vec<SimpleAuditEntry>,
}

#[derive(Clone)]
pub struct SimpleAuditStore {
  path: Arc<Mutex<PathBuf>>,
  entries: Arc<Mutex<Vec<SimpleAuditEntry>>>,
}

impl SimpleAuditStore {
  pub fn new(path: PathBuf) -> Self {
    if let Some(parent) = path.parent() {
      let _ = std::fs::create_dir_all(parent);
    }
    let entries = if path.is_file() {
      std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str::<AuditFile>(&s).ok())
        .map(|f| f.entries)
        .unwrap_or_default()
    } else {
      Vec::new()
    };
    Self {
      path: Arc::new(Mutex::new(path)),
      entries: Arc::new(Mutex::new(entries)),
    }
  }

  pub fn at_account(account_data_dir: &Path, rel: &str) -> Self {
    Self::new(account_data_dir.join(rel))
  }

  pub fn reload_from(&self, account_data_dir: &Path, rel: &str) {
    let fresh = Self::at_account(account_data_dir, rel);
    *self.path.lock().unwrap() = fresh.path.lock().unwrap().clone();
    *self.entries.lock().unwrap() = fresh.entries.lock().unwrap().clone();
  }

  fn persist(&self) -> Result<(), String> {
    let entries = self.entries.lock().unwrap().clone();
    let file = AuditFile { version: 1, entries };
    let json = serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?;
    let path = self.path.lock().unwrap().clone();
    if let Some(parent) = path.parent() {
      std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, json).map_err(|e| e.to_string())
  }

  pub fn record(&self, thread_id: &str, summary: &str, outcome: &str, now: i64) {
    let ev = SimpleAuditEntry {
      id: Uuid::new_v4().to_string(),
      thread_id: thread_id.to_string(),
      created_at: now,
      summary: summary.to_string(),
      outcome: outcome.to_string(),
    };
    {
      let mut list = self.entries.lock().unwrap();
      list.push(ev);
      if list.len() > 2000 {
        let drain = list.len() - 2000;
        list.drain(0..drain);
      }
    }
    if let Err(e) = self.persist() {
      eprintln!("SimpleAuditStore: failed to persist: {}", e);
    }
  }

  pub fn list(&self, limit: usize) -> Vec<SimpleAuditEntry> {
    let mut v = self.entries.lock().unwrap().clone();
    v.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    v.into_iter().take(limit.max(1)).collect()
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn records_and_lists_newest_first() {
    let dir = std::env::temp_dir().join(format!("signalx-audit-{}", Uuid::new_v4()));
    let store = SimpleAuditStore::at_account(&dir, "ivr/audit.json");
    store.record("dm:+1", "Entered buyer menu", "ok", 10);
    store.record("dm:+1", "Digit 2", "ok", 20);
    let list = store.list(10);
    assert_eq!(list.len(), 2);
    assert_eq!(list[0].summary, "Digit 2");
    let _ = std::fs::remove_dir_all(&dir);
  }
}
