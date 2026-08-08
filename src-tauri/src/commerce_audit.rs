//! Thin append-only commerce audit (orders / stock / quote-invoice sends).

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CommerceAuditEvent {
  pub id: String,
  pub kind: String,
  pub summary: String,
  #[serde(default)]
  pub order_id: Option<String>,
  #[serde(default)]
  pub product_id: Option<String>,
  #[serde(default)]
  pub thread_id: Option<String>,
  pub created_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
struct AuditFile {
  version: u32,
  events: Vec<CommerceAuditEvent>,
}

#[derive(Clone)]
pub struct CommerceAuditStore {
  path: PathBuf,
  events: Arc<Mutex<Vec<CommerceAuditEvent>>>,
}

impl CommerceAuditStore {
  pub fn new(app_data_dir: &Path) -> Self {
    let dir = app_data_dir.join("commerce");
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join("audit.json");
    let events = if path.is_file() {
      std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str::<AuditFile>(&s).ok())
        .map(|f| f.events)
        .unwrap_or_default()
    } else {
      Vec::new()
    };
    Self {
      path,
      events: Arc::new(Mutex::new(events)),
    }
  }

  fn persist(&self) -> Result<(), String> {
    let events = self.events.lock().unwrap().clone();
    let file = AuditFile { version: 1, events };
    let json = serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?;
    std::fs::write(&self.path, json).map_err(|e| e.to_string())
  }

  pub fn record(
    &self,
    kind: &str,
    summary: &str,
    order_id: Option<String>,
    product_id: Option<String>,
    thread_id: Option<String>,
    now: i64,
  ) {
    let ev = CommerceAuditEvent {
      id: Uuid::new_v4().to_string(),
      kind: kind.to_string(),
      summary: summary.to_string(),
      order_id,
      product_id,
      thread_id,
      created_at: now,
    };
    {
      let mut list = self.events.lock().unwrap();
      list.push(ev);
      // Cap growth
      if list.len() > 2000 {
        let drain = list.len() - 2000;
        list.drain(0..drain);
      }
    }
    let _ = self.persist();
  }

  pub fn list(&self, limit: usize) -> Vec<CommerceAuditEvent> {
    let mut v = self.events.lock().unwrap().clone();
    v.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    v.into_iter().take(limit.max(1)).collect()
  }
}
