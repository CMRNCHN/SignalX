use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};

use tauri::Emitter;
use uuid::Uuid;

pub(crate) const RECEIVE_TIMEOUT_SECS: &str = "2";
pub(crate) const RECEIVE_MAX_MESSAGES: &str = "50";

const MAX_BACKOFF_MS: u64 = 5000;
const COOLDOWN_MS_AFTER_SELF_HEAL: u64 = 30_000;
const SELF_HEAL_FAILURE_THRESHOLD: u32 = 10;
const DEFAULT_AGENT_INTENT: &str = "prepare but do not send";
const DEFAULT_AGENT_CONSTRAINTS: &str = "concise, actionable, do not auto-send";
pub(crate) const DEFAULT_AGENT_LAST_N: u32 = 50;

// --------------------
// ENV LOADING (portable)
// --------------------
#[allow(dead_code)]
#[derive(Clone, Debug, Serialize)]
pub(crate) struct EnvResolve {
  pub(crate) env_path: Option<String>,
  pub(crate) config_path: Option<String>,
  pub(crate) number: Option<String>,
  pub(crate) signal_cli_bin: String,
}

pub(crate) fn load_env() -> Result<Option<PathBuf>, String> {
  // 1) SIGNALX_ENV_PATH if set
  if let Ok(p) = std::env::var("SIGNALX_ENV_PATH") {
    let pb = PathBuf::from(&p);
    if pb.is_file() {
      dotenv::from_path(&pb).map_err(|e| format!("Failed to load SIGNALX_ENV_PATH {:?}: {}", pb, e))?;
      eprintln!("Loaded env from {:?}", pb);
      return Ok(Some(pb));
    } else {
      return Err(format!("SIGNALX_ENV_PATH set but file does not exist: {:?}", pb));
    }
  }

  let mut candidates: Vec<PathBuf> = Vec::new();

  if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
    let manifest_path = PathBuf::from(manifest_dir);
    if let Some(parent) = manifest_path.parent() {
      candidates.push(parent.join(".signalx.env"));
    }
  }

  if let Ok(cwd) = std::env::current_dir() {
    candidates.push(cwd.join(".signalx.env"));
  }

  if let Some(config_dir) = dirs_next::config_dir() {
    candidates.push(config_dir.join("SignalX").join(".signalx.env"));
    candidates.push(config_dir.join(".signalx.env"));
  }

  for p in candidates.iter().filter(|p| p.is_file()) {
    dotenv::from_path(p).map_err(|e| format!("Failed to load .signalx.env from {:?}: {}", p, e))?;
    eprintln!("Loaded env from {:?}", p);
    return Ok(Some(p.clone()));
  }

  Ok(None)
}

pub(crate) fn get_signal_config() -> Option<String> {
  std::env::var("SIGNALX_SIGNALCLI_CONFIG").ok()
}

pub(crate) fn get_signal_number() -> Option<String> {
  std::env::var("SIGNALX_NUMBER").ok()
}

// Priority: SIGNALX_SIGNALCLI_BIN > /opt/homebrew/bin/signal-cli > signal-cli
pub(crate) fn get_signal_cli_path() -> String {
  if let Ok(bin) = std::env::var("SIGNALX_SIGNALCLI_BIN") {
    return bin;
  }
  let default_path = "/opt/homebrew/bin/signal-cli";
  if Path::new(default_path).exists() {
    return default_path.to_string();
  }
  "signal-cli".to_string()
}

#[derive(Clone, Debug, Serialize)]
pub(crate) struct SignalCliInfo {
  pub(crate) bin: String,
  pub(crate) is_usable: bool,
  pub(crate) version: Option<String>,
  pub(crate) last_error: Option<String>,
}

pub(crate) fn probe_signal_cli(bin: &str) -> SignalCliInfo {
  // Try to run: signal-cli --version
  match Command::new(bin).arg("--version").output() {
    Ok(out) if out.status.success() => {
      let v = String::from_utf8_lossy(&out.stdout).trim().to_string();
      SignalCliInfo { bin: bin.to_string(), is_usable: true, version: Some(v), last_error: None }
    }
    Ok(out) => {
      let e = String::from_utf8_lossy(&out.stderr).trim().to_string();
      SignalCliInfo { bin: bin.to_string(), is_usable: false, version: None, last_error: Some(e) }
    }
    Err(e) => SignalCliInfo { bin: bin.to_string(), is_usable: false, version: None, last_error: Some(format!("{}", e)) },
  }
}

pub(crate) fn build_signal_command(config: &str, number: Option<&str>) -> Command {
  let signal_cli = get_signal_cli_path();
  let mut cmd = Command::new(&signal_cli);

  // Always pass --config
  cmd.arg("--config").arg(config);

  // Output format for signal-cli 0.13.22
  cmd.arg("-o").arg("json");

  // Always pass -u if number is provided (required for send/receive/thread listing in many cases)
  if let Some(num) = number {
    cmd.arg("-u").arg(num);
  }

  cmd
}

// --------------------
// Models
// --------------------
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "PascalCase")]
pub(crate) enum Direction {
  Incoming,
  Outgoing,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "PascalCase")]
pub(crate) enum OutboxStatus {
  Pending,
  Sending,
  Failed,
  Sent,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct Message {
  pub(crate) id: String,
  pub(crate) thread_id: String,
  pub(crate) timestamp: i64,
  pub(crate) sender: String,
  pub(crate) recipient: Option<String>,
  pub(crate) content: String,
  pub(crate) direction: Direction,
  pub(crate) raw_json: Option<Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct ThreadSummary {
  pub(crate) id: String,
  pub(crate) participants: Vec<String>,
  pub(crate) last_message_timestamp: i64,
  pub(crate) unread_count: u32,
  pub(crate) message_count: u32,
  pub(crate) outbox_count: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct ThreadData {
  pub(crate) id: String,
  pub(crate) participants: Vec<String>,
  pub(crate) last_message_timestamp: i64,
  pub(crate) unread_count: u32,
  pub(crate) messages: Vec<Message>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct PendingReply {
  pub(crate) message_id: String,
  pub(crate) thread_id: String,
  pub(crate) draft: String,
  pub(crate) intent: String,
  pub(crate) created_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct OutboxEntry {
  pub(crate) id: String,
  pub(crate) thread_id: String,
  pub(crate) recipient: String,
  pub(crate) content: String,
  pub(crate) created_at: i64,
  pub(crate) last_attempt_at: Option<i64>,
  pub(crate) next_attempt_at: i64,
  pub(crate) attempt_count: u32,
  pub(crate) status: OutboxStatus,
  pub(crate) last_error: Option<String>,
}

// --------------------
// New Outbox (v1, per-account persisted)
// --------------------
#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct OutboxData {
  pub(crate) version: u32,
  pub(crate) items: Vec<OutboxItem>,
}

impl OutboxData {
  pub(crate) fn v1() -> Self {
    Self { version: 1, items: vec![] }
  }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct OutboxItem {
  pub(crate) id: String,
  pub(crate) account_id: String,
  pub(crate) thread_id: String,
  pub(crate) recipient: String,
  pub(crate) content: String,
  pub(crate) created_at: i64,
  pub(crate) last_attempt_at: Option<i64>,
  pub(crate) attempt_count: u32,
  pub(crate) state: String, // "queued" | "sending" | "sent" | "failed"
  pub(crate) last_error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct OutboxSummary {
  pub(crate) queued: u32,
  pub(crate) sending: u32,
  pub(crate) failed: u32,
}

impl OutboxSummary {
  pub(crate) fn empty() -> Self {
    Self { queued: 0, sending: 0, failed: 0 }
  }
}

#[derive(Clone)]
pub(crate) struct OutboxStore {
  pub(crate) dir: PathBuf, // {app_data_dir}/outbox
  pub(crate) data: Arc<Mutex<HashMap<String, OutboxData>>>, // account_id -> data
  pub(crate) save_mutexes: Arc<Mutex<HashMap<String, Arc<Mutex<()>>>>>, // account_id -> mutex
}

impl OutboxStore {
  pub(crate) fn new(dir: PathBuf) -> Self {
    Self { dir, data: Arc::new(Mutex::new(HashMap::new())), save_mutexes: Arc::new(Mutex::new(HashMap::new())) }
  }

  fn path_for(&self, account_id: &str) -> PathBuf {
    // Hard constraint: {app_data_dir}/outbox/{account_id}.json
    self.dir.join(format!("{}.json", account_id))
  }

  fn account_save_lock(&self, account_id: &str) -> Result<Arc<Mutex<()>>, String> {
    let mut m = self.save_mutexes.lock().map_err(|e| format!("Save mutexes poisoned: {}", e))?;
    Ok(m.entry(account_id.to_string()).or_insert_with(|| Arc::new(Mutex::new(()))).clone())
  }

  async fn ensure_loaded_async(&self, account_id: &str) -> Result<(), String> {
    let data_guard = self.data.lock().map_err(|e| format!("Data mutex poisoned: {}", e))?;
    if data_guard.contains_key(account_id) {
      return Ok(());
    }
    let account_id_s = account_id.to_string();
    let dir = self.dir.clone();
    let path = self.path_for(account_id);
    let loaded: OutboxData = tokio::task::spawn_blocking(move || -> Result<OutboxData, String> {
      let _ = std::fs::create_dir_all(&dir);
      if !path.is_file() {
        return Ok(OutboxData::v1());
      }
      let s = std::fs::read_to_string(&path).map_err(|e| format!("outbox read failed: {}", e))?;
      let mut parsed: OutboxData = serde_json::from_str(&s).unwrap_or_else(|_| OutboxData::v1());
      if parsed.version != 1 {
        parsed = OutboxData::v1();
      }
      // If we crashed/restarted while "sending", revert to queued.
      for it in parsed.items.iter_mut() {
        if it.state == "sending" {
          it.state = "queued".to_string();
        }
      }
      Ok(parsed)
    })
    .await
    .map_err(|e| format!("outbox load join error: {}", e))??;

    let mut data_guard = self.data.lock().map_err(|e| format!("Data mutex poisoned: {}", e))?;
    data_guard.insert(account_id_s, loaded);
    Ok(())
  }

  pub(crate) fn ensure_loaded(&self, account_id: &str) -> Result<(), String> {
    tauri::async_runtime::block_on(self.ensure_loaded_async(account_id))
  }

  pub(crate) async fn save_account_atomic_async(&self, account_id: &str) -> Result<(), String> {
    self.ensure_loaded_async(account_id).await?;
    let save_lock = self.account_save_lock(account_id)?;
    let path = self.path_for(account_id);
    let dir = self.dir.clone();
    let snapshot = {
      let d = self.data.lock().map_err(|e| format!("Data mutex poisoned: {}", e))?;
      let data = d.get(account_id).cloned().unwrap_or_else(OutboxData::v1);
      serde_json::to_string_pretty(&data).map_err(|e| format!("outbox serialize error: {}", e))?
    };

    let save_lock2 = save_lock.clone();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
      let _guard = save_lock2.lock().map_err(|e| format!("Save lock poisoned: {}", e))?;
      let _ = std::fs::create_dir_all(&dir);
      let tmp_path = path.with_extension("json.tmp");
      std::fs::write(&tmp_path, snapshot.as_bytes()).map_err(|e| format!("outbox write failed: {}", e))?;
      std::fs::rename(&tmp_path, &path).map_err(|e| format!("outbox rename failed: {}", e))?;
      Ok(())
    })
    .await
    .map_err(|e| format!("outbox save join error: {}", e))?
  }

  pub(crate) fn save_account_atomic(&self, account_id: &str) -> Result<(), String> {
    tauri::async_runtime::block_on(self.save_account_atomic_async(account_id))
  }

  pub(crate) fn list(&self, account_id: &str, thread_id: Option<&str>) -> Result<Vec<OutboxItem>, String> {
    self.ensure_loaded(account_id)?;
    let d = self.data.lock().map_err(|e| format!("Data mutex poisoned: {}", e))?;
    let data = d.get(account_id).cloned().unwrap_or_else(OutboxData::v1);
    let mut items = data.items;
    if let Some(tid) = thread_id {
      items.retain(|i| i.thread_id == tid);
    }
    items.sort_by_key(|i| i.created_at);
    Ok(items)
  }

  pub(crate) fn summary(&self, account_id: &str) -> Result<OutboxSummary, String> {
    self.ensure_loaded(account_id)?;
    let d = self.data.lock().map_err(|e| format!("Data mutex poisoned: {}", e))?;
    let data = d.get(account_id).cloned().unwrap_or_else(OutboxData::v1);
    let mut s = OutboxSummary::empty();
    for it in data.items.iter() {
      match it.state.as_str() {
        "queued" => s.queued += 1,
        "sending" => s.sending += 1,
        "failed" => s.failed += 1,
        _ => {}
      }
    }
    Ok(s)
  }

  pub(crate) async fn list_async(&self, account_id: &str, thread_id: Option<&str>) -> Result<Vec<OutboxItem>, String> {
    self.ensure_loaded_async(account_id).await?;
    let d = self.data.lock().map_err(|e| format!("Data mutex poisoned: {}", e))?;
    let data = d.get(account_id).cloned().unwrap_or_else(OutboxData::v1);
    let mut items = data.items;
    if let Some(tid) = thread_id {
      items.retain(|i| i.thread_id == tid);
    }
    items.sort_by_key(|i| i.created_at);
    Ok(items)
  }

  pub(crate) async fn summary_async(&self, account_id: &str) -> Result<OutboxSummary, String> {
    self.ensure_loaded_async(account_id).await?;
    let d = self.data.lock().map_err(|e| format!("Data mutex poisoned: {}", e))?;
    let data = d.get(account_id).cloned().unwrap_or_else(OutboxData::v1);
    let mut s = OutboxSummary::empty();
    for it in data.items.iter() {
      match it.state.as_str() {
        "queued" => s.queued += 1,
        "sending" => s.sending += 1,
        "failed" => s.failed += 1,
        _ => {}
      }
    }
    Ok(s)
  }

  pub(crate) fn add_item(&self, item: OutboxItem) -> Result<OutboxItem, String> {
    self.ensure_loaded(&item.account_id)?;
    {
      let mut d = self.data.lock().map_err(|e| format!("Data mutex poisoned: {}", e))?;
      let data = d.entry(item.account_id.clone()).or_insert_with(OutboxData::v1);
      data.items.push(item.clone());
      data.items.sort_by_key(|i| i.created_at);
    }
    self.save_account_atomic(&item.account_id)?;
    Ok(item)
  }

  pub(crate) async fn add_item_async(&self, item: OutboxItem) -> Result<OutboxItem, String> {
    self.ensure_loaded_async(&item.account_id).await?;
    {
      let mut d = self.data.lock().map_err(|e| format!("Data mutex poisoned: {}", e))?;
      let data = d.entry(item.account_id.clone()).or_insert_with(OutboxData::v1);
      data.items.push(item.clone());
      data.items.sort_by_key(|i| i.created_at);
    }
    self.save_account_atomic_async(&item.account_id).await?;
    Ok(item)
  }

  pub(crate) fn update_item(&self, account_id: &str, updated: OutboxItem) -> Result<OutboxItem, String> {
    self.ensure_loaded(account_id)?;
    {
      let mut d = self.data.lock().map_err(|e| format!("Data mutex poisoned: {}", e))?;
      let data = d.entry(account_id.to_string()).or_insert_with(OutboxData::v1);
      if let Some(existing) = data.items.iter_mut().find(|i| i.id == updated.id) {
        *existing = updated.clone();
      } else {
        return Err("Outbox item not found".to_string());
      }
    }
    self.save_account_atomic(account_id)?;
    Ok(updated)
  }

  pub(crate) async fn update_item_async(&self, account_id: &str, updated: OutboxItem) -> Result<OutboxItem, String> {
    self.ensure_loaded_async(account_id).await?;
    {
      let mut d = self.data.lock().map_err(|e| format!("Data mutex poisoned: {}", e))?;
      let data = d.entry(account_id.to_string()).or_insert_with(OutboxData::v1);
      if let Some(existing) = data.items.iter_mut().find(|i| i.id == updated.id) {
        *existing = updated.clone();
      } else {
        return Err("Outbox item not found".to_string());
      }
    }
    self.save_account_atomic_async(account_id).await?;
    Ok(updated)
  }

  pub(crate) fn delete_item(&self, account_id: &str, id: &str) -> Result<bool, String> {
    self.ensure_loaded(account_id)?;
    let mut removed = false;
    {
      let mut d = self.data.lock().unwrap();
      let data = d.entry(account_id.to_string()).or_insert_with(OutboxData::v1);
      let before = data.items.len();
      data.items.retain(|i| i.id != id);
      removed = data.items.len() != before;
    }
    if removed {
      self.save_account_atomic(account_id)?;
    }
    Ok(removed)
  }

  pub(crate) async fn delete_item_async(&self, account_id: &str, id: &str) -> Result<bool, String> {
    self.ensure_loaded_async(account_id).await?;
    let mut removed = false;
    {
      let mut d = self.data.lock().unwrap();
      let data = d.entry(account_id.to_string()).or_insert_with(OutboxData::v1);
      let before = data.items.len();
      data.items.retain(|i| i.id != id);
      removed = data.items.len() != before;
    }
    if removed {
      self.save_account_atomic_async(account_id).await?;
    }
    Ok(removed)
  }

  pub(crate) fn find_by_id(&self, account_id: &str, id: &str) -> Result<Option<OutboxItem>, String> {
    self.ensure_loaded(account_id)?;
    let d = self.data.lock().unwrap();
    let data = d.get(account_id).cloned().unwrap_or_else(OutboxData::v1);
    Ok(data.items.into_iter().find(|i| i.id == id))
  }

  pub(crate) fn claim_next_for_send(&self, account_id: &str) -> Result<Option<OutboxItem>, String> {
    self.ensure_loaded(account_id)?;
    let now = now_ms();
    let mut claimed: Option<OutboxItem> = None;
    {
      let mut d = self.data.lock().unwrap();
      let data = d.entry(account_id.to_string()).or_insert_with(OutboxData::v1);

      // Find the next eligible item by created_at.
      let mut idx: Option<usize> = None;
      for (i, it) in data.items.iter().enumerate() {
        if it.state == "sent" {
          continue;
        }
        if it.state != "queued" && it.state != "failed" {
          continue;
        }
        if it.state == "failed" {
          if let Some(last) = it.last_attempt_at {
            let wait = compute_backoff_ms(it.attempt_count);
            if last + wait > now {
              continue;
            }
          }
        }
        idx = Some(i);
        break;
      }

      if let Some(i) = idx {
        let it = &mut data.items[i];
        it.state = "sending".to_string();
        it.last_attempt_at = Some(now_ms());
        it.attempt_count = it.attempt_count.saturating_add(1);
        it.last_error = None;
        claimed = Some(it.clone());
      }
    }
    if claimed.is_some() {
      self.save_account_atomic(account_id)?;
    }
    Ok(claimed)
  }

  pub(crate) async fn claim_next_for_send_async(&self, account_id: &str) -> Result<Option<OutboxItem>, String> {
    self.ensure_loaded_async(account_id).await?;
    let now = now_ms();
    let mut claimed: Option<OutboxItem> = None;
    {
      let mut d = self.data.lock().unwrap();
      let data = d.entry(account_id.to_string()).or_insert_with(OutboxData::v1);

      // Find the next eligible item by created_at.
      let mut idx: Option<usize> = None;
      for (i, it) in data.items.iter().enumerate() {
        if it.state == "sent" {
          continue;
        }
        if it.state != "queued" && it.state != "failed" {
          continue;
        }
        if it.state == "failed" {
          if let Some(last) = it.last_attempt_at {
            let wait = compute_backoff_ms(it.attempt_count);
            if last + wait > now {
              continue;
            }
          }
        }
        idx = Some(i);
        break;
      }

      if let Some(i) = idx {
        let it = &mut data.items[i];
        it.state = "sending".to_string();
        it.last_attempt_at = Some(now_ms());
        it.attempt_count = it.attempt_count.saturating_add(1);
        it.last_error = None;
        claimed = Some(it.clone());
      }
    }
    if claimed.is_some() {
      self.save_account_atomic_async(account_id).await?;
    }
    Ok(claimed)
  }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct ThreadStateData {
  pub(crate) version: u32,
  pub(crate) threads: HashMap<String, ThreadData>,
  #[serde(default)]
  pub(crate) pending_replies: HashMap<String, Vec<PendingReply>>,
  #[serde(default)]
  pub(crate) draft_history: HashMap<String, Vec<PendingReply>>,
  #[serde(default)]
  pub(crate) outbox: HashMap<String, Vec<OutboxEntry>>,
}

impl ThreadStateData {
  pub(crate) fn v2() -> Self {
    Self { version: 2, threads: HashMap::new(), pending_replies: HashMap::new(), draft_history: HashMap::new(), outbox: HashMap::new() }
  }
}

#[derive(Clone)]
pub(crate) struct ThreadState {
  pub(crate) account_id: String,
  pub(crate) data: Arc<Mutex<ThreadStateData>>,
  pub(crate) save_mutex: Arc<Mutex<()>>,
  pub(crate) storage_path: PathBuf,
  pub(crate) last_save_ok_at: Arc<Mutex<Option<i64>>>,
  pub(crate) last_save_error: Arc<Mutex<Option<String>>>,
}

impl ThreadState {
  pub(crate) fn new(account_id: String, storage_path: PathBuf) -> Self {
    Self {
      account_id,
      data: Arc::new(Mutex::new(ThreadStateData::v2())),
      save_mutex: Arc::new(Mutex::new(())),
      storage_path,
      last_save_ok_at: Arc::new(Mutex::new(None)),
      last_save_error: Arc::new(Mutex::new(None)),
    }
  }

  pub(crate) fn load(&self) {
    let path = self.storage_path.clone();
    if !path.is_file() {
      return;
    }
    match std::fs::read_to_string(&path) {
      Ok(s) => match serde_json::from_str::<ThreadStateData>(&s) {
        Ok(parsed) => {
          if let Ok(mut d) = self.data.lock() {
            *d = parsed;
          }
        }
        Err(e) => {
          eprintln!("ThreadState load: invalid JSON, starting fresh: {}", e);
          if let Ok(mut d) = self.data.lock() {
            *d = ThreadStateData::v2();
          }
        }
      },
      Err(e) => eprintln!("ThreadState load error: {}", e),
    }
  }

  pub(crate) fn save_atomic(&self) {
    let _guard = self.save_mutex.lock().unwrap();

    let tmp_path = self.storage_path.with_extension("json.tmp");
    let final_path = self.storage_path.clone();

    let data_snapshot = {
      let d = self.data.lock().unwrap();
      serde_json::to_string_pretty(&*d).unwrap_or_else(|_| "{}".to_string())
    };

    if let Some(parent) = final_path.parent() {
      let _ = std::fs::create_dir_all(parent);
    }

    let write_res = std::fs::write(&tmp_path, data_snapshot.as_bytes());
    if let Err(e) = write_res {
      *self.last_save_error.lock().unwrap() = Some(format!("{}", e));
      return;
    }

    // atomic-ish rename
    let rename_res = std::fs::rename(&tmp_path, &final_path);
    match rename_res {
      Ok(_) => {
        *self.last_save_ok_at.lock().unwrap() = Some(now_ms());
        *self.last_save_error.lock().unwrap() = None;
      }
      Err(e) => {
        *self.last_save_error.lock().unwrap() = Some(format!("{}", e));
      }
    }
  }

  pub(crate) fn add_message(&self, msg: Message, participants: Vec<String>) {
    let mut d = self.data.lock().unwrap();
    let entry = d.threads.entry(msg.thread_id.clone()).or_insert(ThreadData {
      id: msg.thread_id.clone(),
      participants: vec![],
      last_message_timestamp: 0,
      unread_count: 0,
      messages: vec![],
    });

    // participants merge
    let mut set: HashSet<String> = entry.participants.iter().cloned().collect();
    for p in participants {
      set.insert(p);
    }
    entry.participants = set.into_iter().collect();
    entry.participants.sort();

    // dedupe by id
    let exists = entry.messages.iter().any(|m| m.id == msg.id);
    if !exists {
      if msg.direction == Direction::Incoming {
        entry.unread_count = entry.unread_count.saturating_add(1);
      }
      entry.last_message_timestamp = std::cmp::max(entry.last_message_timestamp, msg.timestamp);
      entry.messages.push(msg);
      entry.messages.sort_by_key(|m| m.timestamp);
    }

    drop(d);
    self.save_atomic();
  }

  pub(crate) fn add_pending_reply(&self, thread_id: &str, pending: PendingReply) {
    let mut d = self.data.lock().unwrap();
    let entry = d.pending_replies.entry(thread_id.to_string()).or_insert_with(Vec::new);

    // dedupe by message_id to avoid piling up duplicates
    if let Some(existing) = entry.iter_mut().find(|p| p.message_id == pending.message_id) {
      *existing = pending;
    } else {
      entry.push(pending);
      // maintain deterministic order (newest last)
      entry.sort_by_key(|p| p.created_at);
    }

    drop(d);
    self.save_atomic();
  }

  pub(crate) fn get_pending_replies(&self, thread_id: &str) -> Vec<PendingReply> {
    let d = self.data.lock().unwrap();
    d.pending_replies.get(thread_id).cloned().unwrap_or_else(Vec::new)
  }

  pub(crate) fn consume_pending_reply(&self, thread_id: &str, message_id: &str) -> bool {
    let (changed, removed, should_remove) = {
      let mut d = self.data.lock().unwrap();
      if let Some(list) = d.pending_replies.get_mut(thread_id) {
        let before = list.len();
        let mut removed: Vec<PendingReply> = vec![];
        list.retain(|p| {
          if p.message_id == message_id {
            removed.push(p.clone());
            false
          } else {
            true
          }
        });
        let changed = list.len() != before;
        let should_remove = list.is_empty();
        (changed, removed, should_remove)
      } else {
        (false, Vec::new(), false)
      }
    };

    if should_remove {
      let mut d = self.data.lock().unwrap();
      d.pending_replies.remove(thread_id);
    }

    if changed {
      for r in removed {
        self.push_draft_history(thread_id, r);
      }
      self.save_atomic();
    }
    changed
  }

  pub(crate) fn push_draft_history(&self, thread_id: &str, entry: PendingReply) {
    let mut d = self.data.lock().unwrap();
    let hist = d.draft_history.entry(thread_id.to_string()).or_insert_with(Vec::new);
    hist.push(entry);
    if hist.len() > 5 {
      let excess = hist.len() - 5;
      hist.drain(0..excess);
    }
    drop(d);
    self.save_atomic();
  }

  pub(crate) fn get_draft_history(&self, thread_id: &str) -> Vec<PendingReply> {
    let d = self.data.lock().unwrap();
    d.draft_history.get(thread_id).cloned().unwrap_or_else(Vec::new)
  }

  pub(crate) fn clear_pending_replies_for_thread(&self, thread_id: &str) {
    let mut d = self.data.lock().unwrap();
    d.pending_replies.remove(thread_id);
    drop(d);
    self.save_atomic();
  }

  pub(crate) fn enqueue_outbox(&self, item: OutboxEntry) {
    let mut d = self.data.lock().unwrap();
    let list = d.outbox.entry(item.thread_id.clone()).or_insert_with(Vec::new);
    list.push(item);
    list.sort_by_key(|o| o.created_at);
    drop(d);
    self.save_atomic();
  }

  pub(crate) fn update_outbox_item(&self, thread_id: &str, item: OutboxEntry) {
    let mut d = self.data.lock().unwrap();
    if let Some(list) = d.outbox.get_mut(thread_id) {
      if let Some(pos) = list.iter().position(|o| o.id == item.id) {
        list[pos] = item;
        list.sort_by_key(|o| o.created_at);
      }
    }
    drop(d);
    self.save_atomic();
  }

  pub(crate) fn remove_outbox_item(&self, thread_id: &str, outbox_id: &str) {
    let mut d = self.data.lock().unwrap();
    if let Some(list) = d.outbox.get_mut(thread_id) {
      list.retain(|o| o.id != outbox_id);
      if list.is_empty() {
        d.outbox.remove(thread_id);
      }
    }
    drop(d);
    self.save_atomic();
  }

  pub(crate) fn list_outbox(&self, thread_id: Option<&str>) -> Vec<OutboxEntry> {
    let d = self.data.lock().unwrap();
    if let Some(tid) = thread_id {
      return d.outbox.get(tid).cloned().unwrap_or_else(Vec::new);
    }
    let mut all: Vec<OutboxEntry> = vec![];
    for list in d.outbox.values() {
      all.extend(list.clone());
    }
    all.sort_by_key(|o| o.created_at);
    all
  }

  pub(crate) fn outbox_pending_count(&self, thread_id: &str) -> usize {
    let d = self.data.lock().unwrap();
    d.outbox
      .get(thread_id)
      .map(|list| list.iter().filter(|o| o.status != OutboxStatus::Sent).count())
      .unwrap_or(0)
  }

  pub(crate) fn mark_thread_read(&self, thread_id: &str) -> bool {
    let mut d = self.data.lock().unwrap();
    if let Some(t) = d.threads.get_mut(thread_id) {
      t.unread_count = 0;
      drop(d);
      self.save_atomic();
      true
    } else {
      false
    }
  }

  pub(crate) fn get_threads(&self) -> Vec<ThreadSummary> {
    let d = self.data.lock().unwrap();
    let mut out: Vec<ThreadSummary> = d
      .threads
      .values()
      .map(|t| ThreadSummary {
        id: t.id.clone(),
        participants: t.participants.clone(),
        last_message_timestamp: t.last_message_timestamp,
        unread_count: t.unread_count,
        message_count: t.messages.len() as u32,
        outbox_count: d
          .outbox
          .get(&t.id)
          .map(|list| list.iter().filter(|o| o.status != OutboxStatus::Sent).count() as u32)
          .unwrap_or(0),
      })
      .collect();

    out.sort_by(|a, b| b.last_message_timestamp.cmp(&a.last_message_timestamp));
    out
  }

  pub(crate) fn get_thread_messages(&self, thread_id: &str) -> Vec<Message> {
    let d = self.data.lock().unwrap();
    d.threads
      .get(thread_id)
      .map(|t| t.messages.clone())
      .unwrap_or_else(Vec::new)
  }
}

// --------------------
// Alias manager (per account)
// --------------------
#[derive(Clone)]
pub(crate) struct AliasManager {
  pub(crate) dir: PathBuf,
  pub(crate) data: Arc<Mutex<HashMap<String, HashMap<String, String>>>>, // account -> (number->alias)
}

impl AliasManager {
  pub(crate) fn new(dir: PathBuf) -> Self {
    Self { dir, data: Arc::new(Mutex::new(HashMap::new())) }
  }

  fn path_for(&self, account_id: &str) -> PathBuf {
    self.dir.join(format!("{}.json", sanitize_filename(account_id)))
  }

  pub(crate) fn load_account(&self, account_id: &str) {
    let path = self.path_for(account_id);
    if !path.is_file() {
      return;
    }
    if let Ok(s) = std::fs::read_to_string(&path) {
      if let Ok(map) = serde_json::from_str::<HashMap<String, String>>(&s) {
        self.data.lock().unwrap().insert(account_id.to_string(), map);
      }
    }
  }

  fn save_account(&self, account_id: &str) {
    let path = self.path_for(account_id);
    if let Some(parent) = path.parent() {
      let _ = std::fs::create_dir_all(parent);
    }
    let map = self
      .data
      .lock()
      .unwrap()
      .get(account_id)
      .cloned()
      .unwrap_or_else(HashMap::new);

    let tmp = path.with_extension("json.tmp");
    if let Ok(s) = serde_json::to_string_pretty(&map) {
      if std::fs::write(&tmp, s.as_bytes()).is_ok() {
        let _ = std::fs::rename(&tmp, &path);
      }
    }
  }

  pub(crate) fn list_aliases(&self, account_id: &str) -> HashMap<String, String> {
    self.data
      .lock()
      .unwrap()
      .get(account_id)
      .cloned()
      .unwrap_or_else(HashMap::new)
  }

  pub(crate) fn set_alias(&self, account_id: &str, number: &str, alias: &str) {
    let mut d = self.data.lock().unwrap();
    let entry = d.entry(account_id.to_string()).or_insert_with(HashMap::new);
    entry.insert(number.to_string(), alias.to_string());
    drop(d);
    self.save_account(account_id);
  }

  pub(crate) fn get_alias(&self, account_id: &str, number: &str) -> Option<String> {
    self.data
      .lock()
      .unwrap()
      .get(account_id)
      .and_then(|m| m.get(number).cloned())
  }
}

// --------------------
// Contacts meta store (per account)
// --------------------
#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct ContactMetaData {
  pub(crate) version: u32, // v1
  pub(crate) contacts: HashMap<String, ContactMeta>, // key = contact_id
}

// --------------------
// Groups meta store (per account)
// --------------------
#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct GroupMetaData {
  pub(crate) version: u32, // v1
  pub(crate) groups: HashMap<String, GroupMeta>, // key = group_id (e.g. "group:XYZ")
}

impl GroupMetaData {
  pub(crate) fn v1() -> Self {
    Self { version: 1, groups: HashMap::new() }
  }
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub(crate) struct GroupMeta {
  pub(crate) group_id: String, // "group:XYZ"
  pub(crate) display_name: Option<String>,
  pub(crate) categories: Vec<String>,
  pub(crate) favorite: bool,
  pub(crate) muted: bool,
  pub(crate) icon: Option<String>,
  pub(crate) custom_fields: Vec<CustomField>,
  pub(crate) member_notes: Vec<String>, // optional (non-binding)
  pub(crate) updated_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct GroupMetaPatch {
  pub(crate) display_name: Option<Option<String>>,
  pub(crate) categories: Option<Vec<String>>,
  pub(crate) favorite: Option<bool>,
  pub(crate) muted: Option<bool>,
  pub(crate) icon: Option<Option<String>>,
  pub(crate) custom_fields: Option<Vec<CustomField>>,
  pub(crate) member_notes: Option<Vec<String>>,
}

pub(crate) fn normalize_group_id(input: &str) -> String {
  let s = input.trim();
  if s.starts_with("group:") {
    return s.to_string();
  }
  format!("group:{}", s)
}

#[derive(Clone)]
pub(crate) struct GroupStore {
  pub(crate) dir: PathBuf, // {app_data_dir}/groups
  pub(crate) data: Arc<Mutex<HashMap<String, GroupMetaData>>>, // account -> data
  pub(crate) save_mutex: Arc<Mutex<()>>,
}

impl GroupStore {
  pub(crate) fn new(dir: PathBuf) -> Self {
    Self {
      dir,
      data: Arc::new(Mutex::new(HashMap::new())),
      save_mutex: Arc::new(Mutex::new(())),
    }
  }

  fn path_for(&self, account_id: &str) -> PathBuf {
    self.dir.join(format!("{}.json", sanitize_filename(account_id)))
  }

  fn ensure_loaded(&self, account_id: &str) {
    if self.data.lock().unwrap().contains_key(account_id) {
      return;
    }
    self.load_account(account_id);
  }

  pub(crate) fn load_account(&self, account_id: &str) {
    let path = self.path_for(account_id);
    let mut data = GroupMetaData::v1();
    if path.is_file() {
      if let Ok(s) = std::fs::read_to_string(&path) {
        if let Ok(parsed) = serde_json::from_str::<GroupMetaData>(&s) {
          data = parsed;
        }
      }
    }
    let mut changed = false;
    // Migration: ensure all keys have group: prefix
    if data.version == 1 {
      let mut migrated: HashMap<String, GroupMeta> = HashMap::new();
      for (k, mut v) in data.groups.into_iter() {
        let nk = normalize_group_id(&k);
        v.group_id = nk.clone();
        if migrate_custom_fields_lenient(&mut v.custom_fields) {
          changed = true;
        }
        migrated.insert(nk, v);
      }
      data.groups = migrated;
      changed = true;
    }
    self.data.lock().unwrap().insert(account_id.to_string(), data);
    if changed {
      let _ = self.save_account_atomic(account_id);
    }
  }

  fn save_account_atomic(&self, account_id: &str) -> Result<(), String> {
    let _guard = self.save_mutex.lock().unwrap();
    let path = self.path_for(account_id);
    if let Some(parent) = path.parent() {
      std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let data = self
      .data
      .lock()
      .unwrap()
      .get(account_id)
      .cloned()
      .unwrap_or_else(GroupMetaData::v1);

    let tmp = path.with_extension("json.tmp");
    let s = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    std::fs::write(&tmp, s.as_bytes()).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
  }

  pub(crate) fn list(&self, account_id: &str) -> Vec<GroupMeta> {
    self.ensure_loaded(account_id);
    let d = self.data.lock().unwrap();
    let mut out: Vec<GroupMeta> = d
      .get(account_id)
      .map(|m| m.groups.values().cloned().collect())
      .unwrap_or_else(Vec::new);
    out.sort_by_key(|g| g.group_id.clone());
    out
  }

  pub(crate) fn get(&self, account_id: &str, group_id: &str) -> Option<GroupMeta> {
    self.ensure_loaded(account_id);
    let gid = normalize_group_id(group_id);
    let d = self.data.lock().unwrap();
    d.get(account_id).and_then(|m| m.groups.get(&gid).cloned())
  }

  pub(crate) fn upsert_patch(&self, account_id: &str, group_id: &str, patch: GroupMetaPatch) -> Result<GroupMeta, String> {
    self.ensure_loaded(account_id);
    let gid = normalize_group_id(group_id);
    let mut d = self.data.lock().unwrap();
    let m = d.entry(account_id.to_string()).or_insert_with(GroupMetaData::v1);
    let entry = m.groups.entry(gid.clone()).or_insert_with(|| GroupMeta {
      group_id: gid.clone(),
      ..Default::default()
    });

    if let Some(v) = patch.display_name { entry.display_name = v; }
    if let Some(v) = patch.categories { entry.categories = v; }
    if let Some(v) = patch.favorite { entry.favorite = v; }
    if let Some(v) = patch.muted { entry.muted = v; }
    if let Some(v) = patch.icon { entry.icon = v; }
    if let Some(v) = patch.custom_fields { entry.custom_fields = v; }
    if let Some(v) = patch.member_notes { entry.member_notes = v; }
    entry.updated_at = now_ms();

    let out = entry.clone();
    drop(d);
    self.save_account_atomic(account_id)?;
    Ok(out)
  }

  pub(crate) fn delete(&self, account_id: &str, group_id: &str) -> Result<bool, String> {
    self.ensure_loaded(account_id);
    let gid = normalize_group_id(group_id);
    let mut d = self.data.lock().unwrap();
    let mut changed = false;
    if let Some(m) = d.get_mut(account_id) {
      changed = m.groups.remove(&gid).is_some();
    }
    drop(d);
    if changed {
      self.save_account_atomic(account_id)?;
    }
    Ok(changed)
  }

  pub(crate) fn list_categories(&self, account_id: &str) -> Vec<String> {
    self.ensure_loaded(account_id);
    let d = self.data.lock().unwrap();
    let mut set: HashSet<String> = HashSet::new();
    if let Some(m) = d.get(account_id) {
      for g in m.groups.values() {
        for cat in g.categories.iter() {
          let s = cat.trim();
          if !s.is_empty() {
            set.insert(s.to_string());
          }
        }
      }
    }
    let mut out: Vec<String> = set.into_iter().collect();
    out.sort();
    out
  }
}

impl ContactMetaData {
  pub(crate) fn v1() -> Self {
    Self { version: 1, contacts: HashMap::new() }
  }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum CustomFieldType {
  Text,
  Number,
  Bool,
  Date,
  Tag,
}

impl Default for CustomFieldType {
  fn default() -> Self {
    CustomFieldType::Text
  }
}

impl Serialize for CustomFieldType {
  fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
  where
    S: serde::Serializer,
  {
    let s = match self {
      CustomFieldType::Text => "text",
      CustomFieldType::Number => "number",
      CustomFieldType::Bool => "bool",
      CustomFieldType::Date => "date",
      CustomFieldType::Tag => "tag",
    };
    serializer.serialize_str(s)
  }
}

impl<'de> Deserialize<'de> for CustomFieldType {
  fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
  where
    D: serde::Deserializer<'de>,
  {
    let raw = String::deserialize(deserializer)?;
    let s = raw.trim().to_lowercase();
    // Back-compat: older UI allowed "url" which is now treated as text.
    let out = match s.as_str() {
      "text" => CustomFieldType::Text,
      "number" => CustomFieldType::Number,
      "bool" => CustomFieldType::Bool,
      "date" => CustomFieldType::Date,
      "tag" => CustomFieldType::Tag,
      "url" => CustomFieldType::Text,
      _ => {
        return Err(serde::de::Error::custom(format!(
          "invalid CustomField.type (expected text|number|bool|date|tag)"
        )))
      }
    };
    Ok(out)
  }
}

fn new_custom_field_id() -> String {
  Uuid::new_v4().to_string()
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct CustomField {
  #[serde(default = "new_custom_field_id")]
  pub(crate) id: String, // stable uuid
  #[serde(default)]
  pub(crate) key: String,
  #[serde(rename = "type", alias = "field_type", default)]
  pub(crate) field_type: CustomFieldType,
  #[serde(rename = "searchable", alias = "is_searchable", default)]
  pub(crate) searchable: bool,
  #[serde(default)]
  pub(crate) value: String, // normalized string form
}

fn normalize_custom_field_value(field_type: &CustomFieldType, raw_value: &str) -> Result<String, String> {
  let v = raw_value.trim();
  match field_type {
    CustomFieldType::Text | CustomFieldType::Tag => Ok(v.to_string()),
    CustomFieldType::Number => {
      if v.is_empty() {
        return Ok("".to_string());
      }
      if let Ok(i) = v.parse::<i64>() {
        return Ok(i.to_string());
      }
      let f = v.parse::<f64>().map_err(|_| "invalid number".to_string())?;
      if !f.is_finite() {
        return Err("invalid number".to_string());
      }
      Ok(f.to_string())
    }
    CustomFieldType::Bool => {
      if v.is_empty() {
        return Ok("".to_string());
      }
      let lc = v.to_lowercase();
      let b = match lc.as_str() {
        "true" | "1" | "yes" | "y" | "on" => true,
        "false" | "0" | "no" | "n" | "off" => false,
        _ => return Err("invalid bool (use true/false)".to_string()),
      };
      Ok(if b { "true" } else { "false" }.to_string())
    }
    CustomFieldType::Date => {
      if v.is_empty() {
        return Ok("".to_string());
      }
      // Preferred: YYYY-MM-DD. Also accept RFC3339 and normalize to YYYY-MM-DD.
      if let Ok(d) = chrono::NaiveDate::parse_from_str(v, "%Y-%m-%d") {
        return Ok(d.format("%Y-%m-%d").to_string());
      }
      if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(v) {
        return Ok(dt.date_naive().format("%Y-%m-%d").to_string());
      }
      Err("invalid date (use YYYY-MM-DD)".to_string())
    }
  }
}

fn validate_and_normalize_custom_fields(fields: Vec<CustomField>) -> Result<Vec<CustomField>, String> {
  let mut out: Vec<CustomField> = Vec::with_capacity(fields.len());
  for mut f in fields.into_iter() {
    if f.id.trim().is_empty() {
      f.id = new_custom_field_id();
    }
    let k = f.key.trim().to_string();
    if k.is_empty() {
      return Err("custom field key cannot be empty".to_string());
    }
    f.key = k;
    f.value = normalize_custom_field_value(&f.field_type, &f.value)?;
    out.push(f);
  }
  Ok(out)
}

// Lenient migration for on-disk meta: never fail loading; instead best-effort normalize and drop clearly invalid entries.
fn migrate_custom_fields_lenient(fields: &mut Vec<CustomField>) -> bool {
  let mut changed = false;
  let mut out: Vec<CustomField> = Vec::with_capacity(fields.len());
  for mut f in fields.drain(..) {
    if f.id.trim().is_empty() {
      f.id = new_custom_field_id();
      changed = true;
    }
    let k = f.key.trim().to_string();
    if k.is_empty() {
      // Drop invalid historical rows rather than failing account load.
      changed = true;
      continue;
    }
    if k != f.key {
      f.key = k;
      changed = true;
    }
    let trimmed = f.value.trim().to_string();
    if trimmed != f.value {
      f.value = trimmed;
      changed = true;
    }
    if let Ok(norm) = normalize_custom_field_value(&f.field_type, &f.value) {
      if norm != f.value {
        f.value = norm;
        changed = true;
      }
    }
    out.push(f);
  }
  *fields = out;
  changed
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub(crate) struct ContactMeta {
  pub(crate) contact_id: String, // "+1202..."
  pub(crate) display_name: Option<String>,
  pub(crate) alias: Option<String>,
  pub(crate) categories: Vec<String>,
  pub(crate) favorite: bool,
  pub(crate) muted: bool,
  pub(crate) icon: Option<String>,
  pub(crate) photo_path: Option<String>, // relative under app_data_dir preferred
  pub(crate) apple_contact_id: Option<String>, // stub only for now
  pub(crate) custom_fields: Vec<CustomField>,
  pub(crate) updated_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct ContactMetaPatch {
  // Use Option<Option<T>> so we can distinguish "unset" vs explicit null
  pub(crate) display_name: Option<Option<String>>,
  pub(crate) alias: Option<Option<String>>,
  pub(crate) categories: Option<Vec<String>>,
  pub(crate) favorite: Option<bool>,
  pub(crate) muted: Option<bool>,
  pub(crate) icon: Option<Option<String>>,
  pub(crate) apple_contact_id: Option<Option<String>>,
  pub(crate) custom_fields: Option<Vec<CustomField>>,
}

#[derive(Clone)]
pub(crate) struct ContactStore {
  pub(crate) dir: PathBuf, // {app_data_dir}/contacts
  pub(crate) data: Arc<Mutex<HashMap<String, ContactMetaData>>>, // account -> data
  pub(crate) save_mutex: Arc<Mutex<()>>,
}

pub(crate) fn normalize_contact_id(input: &str) -> String {
  let s = input.trim();
  if s.starts_with("dm:") || s.starts_with("group:") {
    return s.to_string();
  }
  // Back-compat: raw phone numbers become dm:+E164
  if s.starts_with('+') || s.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false) {
    return format!("dm:{}", s);
  }
  s.to_string()
}

impl ContactStore {
  pub(crate) fn new(dir: PathBuf) -> Self {
    Self {
      dir,
      data: Arc::new(Mutex::new(HashMap::new())),
      save_mutex: Arc::new(Mutex::new(())),
    }
  }

  fn path_for(&self, account_id: &str) -> PathBuf {
    self.dir.join(format!("{}.json", sanitize_filename(account_id)))
  }

  fn photos_dir_for(&self, account_id: &str) -> PathBuf {
    self.dir
      .join("photos")
      .join(sanitize_filename(account_id))
  }

  pub(crate) fn ensure_loaded(&self, account_id: &str) {
    if self.data.lock().unwrap().contains_key(account_id) {
      return;
    }
    self.load_account(account_id);
  }

  pub(crate) fn load_account(&self, account_id: &str) {
    let path = self.path_for(account_id);
    let mut data = ContactMetaData::v1();
    if path.is_file() {
      if let Ok(s) = std::fs::read_to_string(&path) {
        if let Ok(parsed) = serde_json::from_str::<ContactMetaData>(&s) {
          data = parsed;
        }
      }
    }
    let mut changed = false;
    // Migration: old keys like "+1202..." -> "dm:+1202..."
    if data.version == 1 {
      let mut migrated: HashMap<String, ContactMeta> = HashMap::new();
      for (k, mut v) in data.contacts.into_iter() {
        let nk = normalize_contact_id(&k);
        v.contact_id = nk.clone();
        if migrate_custom_fields_lenient(&mut v.custom_fields) {
          changed = true;
        }
        migrated.insert(nk, v);
      }
      data.contacts = migrated;
      // ensure any on-disk migration is persisted
      changed = true;
    }
    // Best-effort: normalize custom fields for already-normalized keys as well.
    if data.version != 1 {
      for v in data.contacts.values_mut() {
        if migrate_custom_fields_lenient(&mut v.custom_fields) {
          changed = true;
        }
      }
    }
    self.data.lock().unwrap().insert(account_id.to_string(), data);
    if changed {
      let _ = self.save_account_atomic(account_id);
    }
  }

  fn save_account_atomic(&self, account_id: &str) -> Result<(), String> {
    let _guard = self.save_mutex.lock().unwrap();
    let path = self.path_for(account_id);
    if let Some(parent) = path.parent() {
      std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let data = self
      .data
      .lock()
      .unwrap()
      .get(account_id)
      .cloned()
      .unwrap_or_else(ContactMetaData::v1);

    let tmp = path.with_extension("json.tmp");
    let s = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    std::fs::write(&tmp, s.as_bytes()).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
  }

  pub(crate) fn list(&self, account_id: &str) -> Vec<ContactMeta> {
    self.ensure_loaded(account_id);
    let d = self.data.lock().unwrap();
    let mut out: Vec<ContactMeta> = d
      .get(account_id)
      .map(|m| m.contacts.values().cloned().collect())
      .unwrap_or_else(Vec::new);
    out.sort_by_key(|c| c.contact_id.clone());
    out
  }

  pub(crate) fn get(&self, account_id: &str, contact_id: &str) -> Option<ContactMeta> {
    self.ensure_loaded(account_id);
    let cid = normalize_contact_id(contact_id);
    let d = self.data.lock().unwrap();
    d.get(account_id).and_then(|m| m.contacts.get(&cid).cloned())
  }

  pub(crate) fn upsert_patch(&self, account_id: &str, contact_id: &str, patch: ContactMetaPatch) -> Result<ContactMeta, String> {
    self.ensure_loaded(account_id);
    let cid = normalize_contact_id(contact_id);
    let mut d = self.data.lock().unwrap();
    let m = d.entry(account_id.to_string()).or_insert_with(ContactMetaData::v1);
    let entry = m.contacts.entry(cid.clone()).or_insert_with(|| ContactMeta {
      contact_id: cid.clone(),
      ..Default::default()
    });

    if let Some(v) = patch.display_name { entry.display_name = v; }
    if let Some(v) = patch.alias { entry.alias = v; }
    if let Some(v) = patch.categories { entry.categories = v; }
    if let Some(v) = patch.favorite { entry.favorite = v; }
    if let Some(v) = patch.muted { entry.muted = v; }
    if let Some(v) = patch.icon { entry.icon = v; }
    if let Some(v) = patch.apple_contact_id { entry.apple_contact_id = v; }
    if let Some(v) = patch.custom_fields {
      entry.custom_fields = validate_and_normalize_custom_fields(v)?;
    }
    entry.updated_at = now_ms();

    let out = entry.clone();
    drop(d);
    self.save_account_atomic(account_id)?;
    Ok(out)
  }

  pub(crate) fn delete(&self, account_id: &str, contact_id: &str) -> Result<bool, String> {
    self.ensure_loaded(account_id);
    let cid = normalize_contact_id(contact_id);
    let mut d = self.data.lock().unwrap();
    let mut changed = false;
    if let Some(m) = d.get_mut(account_id) {
      changed = m.contacts.remove(&cid).is_some();
    }
    drop(d);
    if changed {
      self.save_account_atomic(account_id)?;
    }
    Ok(changed)
  }

  pub(crate) fn list_categories(&self, account_id: &str) -> Vec<String> {
    self.ensure_loaded(account_id);
    let d = self.data.lock().unwrap();
    let mut set: HashSet<String> = HashSet::new();
    if let Some(m) = d.get(account_id) {
      for c in m.contacts.values() {
        for cat in c.categories.iter() {
          let s = cat.trim();
          if !s.is_empty() {
            set.insert(s.to_string());
          }
        }
      }
    }
    let mut out: Vec<String> = set.into_iter().collect();
    out.sort();
    out
  }

  pub(crate) fn set_photo(&self, app_data_dir: &Path, account_id: &str, contact_id: &str, bytes: Vec<u8>, ext: &str) -> Result<ContactMeta, String> {
    let cid = normalize_contact_id(contact_id);
    let ext_lc = ext.trim().trim_start_matches('.').to_lowercase();
    let ext_norm = match ext_lc.as_str() {
      "png" => "png",
      "jpg" => "jpg",
      "jpeg" => "jpg",
      _ => return Err("unsupported photo extension (use png/jpg)".to_string()),
    };

    let photos_dir = self.photos_dir_for(account_id);
    std::fs::create_dir_all(&photos_dir).map_err(|e| e.to_string())?;

    let fname = format!("{}.{}", sanitize_filename(&cid), ext_norm);
    let full = photos_dir.join(fname);
    std::fs::write(&full, bytes).map_err(|e| e.to_string())?;

    // store relative path under app_data_dir (preferred)
    let rel = full
      .strip_prefix(app_data_dir)
      .unwrap_or(&full)
      .to_string_lossy()
      .to_string();

    // update meta.photo_path
    let patch = ContactMetaPatch {
      display_name: None,
      alias: None,
      categories: None,
      favorite: None,
      muted: None,
      icon: None,
      apple_contact_id: None,
      custom_fields: None,
    };
    self.ensure_loaded(account_id);
    let mut d = self.data.lock().unwrap();
    let m = d.entry(account_id.to_string()).or_insert_with(ContactMetaData::v1);
    let entry = m.contacts.entry(cid.clone()).or_insert_with(|| ContactMeta {
      contact_id: cid.clone(),
      ..Default::default()
    });
    let _ = patch; // keep patch struct for future expansion; currently unused
    entry.photo_path = Some(rel);
    entry.updated_at = now_ms();
    let out = entry.clone();
    drop(d);
    self.save_account_atomic(account_id)?;
    Ok(out)
  }

  pub(crate) fn clear_photo(&self, app_data_dir: &Path, account_id: &str, contact_id: &str) -> Result<ContactMeta, String> {
    self.ensure_loaded(account_id);
    let cid = normalize_contact_id(contact_id);
    let mut d = self.data.lock().unwrap();
    let m = d.entry(account_id.to_string()).or_insert_with(ContactMetaData::v1);
    let entry = m.contacts.entry(cid.clone()).or_insert_with(|| ContactMeta {
      contact_id: cid.clone(),
      ..Default::default()
    });

    if let Some(rel) = entry.photo_path.clone() {
      // best-effort delete of existing photo file if it's under app_data_dir
      let p = app_data_dir.join(rel.clone());
      let _ = std::fs::remove_file(p);
    }
    entry.photo_path = None;
    entry.updated_at = now_ms();
    let out = entry.clone();
    drop(d);
    self.save_account_atomic(account_id)?;
    Ok(out)
  }
}

// --------------------
// Search (simple in-memory scan, backend source-of-truth)
// --------------------
#[derive(Clone, Debug, Serialize)]
pub(crate) struct SearchResult {
  pub(crate) message_id: String,
  pub(crate) thread_id: String,
  pub(crate) timestamp: i64,
  pub(crate) sender: String,
  pub(crate) snippet: String,
  pub(crate) offset: usize,
}

pub(crate) fn search_in_messages(messages: &[Message], q: &str, limit: usize, sender: Option<&str>, after_ts: Option<i64>, before_ts: Option<i64>) -> Vec<SearchResult> {
  let qq = q.to_lowercase();
  let sender_lc = sender.map(|s| s.to_lowercase());
  let mut out: Vec<SearchResult> = vec![];

  for m in messages.iter() {
    if let Some(after) = after_ts {
      if m.timestamp < after {
        continue;
      }
    }
    if let Some(before) = before_ts {
      if m.timestamp > before {
        continue;
      }
    }
    if let Some(sfilter) = sender_lc.as_ref() {
      if m.sender.to_lowercase() != *sfilter {
        continue;
      }
    }
    let hay = m.content.to_lowercase();
    if let Some(idx) = hay.find(&qq) {
      let snippet = make_snippet(&m.content, &qq, 120);
      out.push(SearchResult {
        message_id: m.id.clone(),
        thread_id: m.thread_id.clone(),
        timestamp: m.timestamp,
        sender: m.sender.clone(),
        snippet,
        offset: idx,
      });
      if out.len() >= limit {
        break;
      }
    }
  }

  // naive ranking: newest first
  out.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
  out.truncate(limit);
  out
}

fn make_snippet(text: &str, _q: &str, max_len: usize) -> String {
  if text.len() <= max_len {
    return text.to_string();
  }
  let mut s = text[..max_len].to_string();
  s.push('…');
  s
}

// --------------------
// AI tools (Ollama optional; never auto-send)
// --------------------
fn run_ollama(model: &str, prompt: &str) -> Result<String, String> {
  // Requires `ollama` in PATH
  let out = Command::new("ollama")
    .arg("run")
    .arg(model)
    .arg(prompt)
    .output()
    .map_err(|e| format!("ollama exec error: {}", e))?;

  if !out.status.success() {
    let e = String::from_utf8_lossy(&out.stderr).to_string();
    return Err(format!("ollama error: {}", e));
  }
  Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

pub(crate) fn ai_enabled() -> bool {
  std::env::var("SIGNALX_OLLAMA_MODEL").ok().map(|s| !s.trim().is_empty()).unwrap_or(false)
}

pub(crate) fn collect_recent_messages(ts: &ThreadState, thread_id: &str, last_n: usize) -> Vec<Message> {
  let mut msgs = ts.get_thread_messages(thread_id);
  msgs.sort_by_key(|m| m.timestamp);
  if msgs.len() > last_n {
    msgs = msgs[msgs.len() - last_n..].to_vec();
  }
  msgs
}

pub(crate) fn draft_reply_for_thread(
  ts: &ThreadState,
  thread_id: &str,
  intent: &str,
  constraints: Option<&str>,
  last_n: Option<u32>,
) -> Result<String, String> {
  if !ai_enabled() {
    return Err("AI not configured. Set SIGNALX_OLLAMA_MODEL and ensure `ollama` is installed.".to_string());
  }

  let n = last_n.unwrap_or(DEFAULT_AGENT_LAST_N).max(1).min(200) as usize;
  let msgs = collect_recent_messages(ts, thread_id, n);
  let ctx = msgs
    .iter()
    .map(|m| format!("[{}] {}: {}", m.timestamp, m.sender, m.content))
    .collect::<Vec<_>>()
    .join("\n");

  let model = std::env::var("SIGNALX_OLLAMA_MODEL").unwrap();
  let c = constraints.unwrap_or("short, clear");
  let prompt = format!(
    "Draft a reply to this Signal thread.\nIntent: {}\nConstraints: {}\nRules: Do not mention these rules. Return only the reply text.\n\nTHREAD:\n{}",
    intent, c, ctx
  );

  let out = std::thread::spawn(move || run_ollama(&model, &prompt)).join().unwrap_or_else(|_| Err("AI thread join failed".to_string()));
  out.map(|s| s.trim().to_string())
}

// --------------------
// Receive loop monitor
// --------------------
#[derive(Clone, Debug, Serialize)]
pub(crate) struct ReceiveLoopState {
  pub(crate) last_receive_ok_at: Option<i64>,
  pub(crate) last_receive_error: Option<String>,
  pub(crate) consecutive_failures: u32,
  pub(crate) backoff_ms: u64,
  pub(crate) cooldown_until: Option<i64>,
}

#[derive(Clone)]
pub(crate) struct ReceiveLoopMonitor {
  pub(crate) state: Arc<Mutex<ReceiveLoopState>>,
}

impl ReceiveLoopMonitor {
  pub(crate) fn new() -> Self {
    Self {
      state: Arc::new(Mutex::new(ReceiveLoopState {
        last_receive_ok_at: None,
        last_receive_error: None,
        consecutive_failures: 0,
        backoff_ms: 0,
        cooldown_until: None,
      })),
    }
  }

  pub(crate) fn on_success(&self) {
    let mut s = self.state.lock().unwrap();
    s.last_receive_ok_at = Some(now_ms());
    s.last_receive_error = None;
    s.consecutive_failures = 0;
    s.backoff_ms = 0;
    s.cooldown_until = None;
  }

  pub(crate) fn on_error(&self, e: String) {
    let mut s = self.state.lock().unwrap();
    s.last_receive_error = Some(e);
    s.consecutive_failures = s.consecutive_failures.saturating_add(1);
    let next = if s.backoff_ms == 0 { 250 } else { (s.backoff_ms * 2).min(MAX_BACKOFF_MS) };
    s.backoff_ms = next;

    // self-heal cooldown if too many consecutive failures
    if s.consecutive_failures >= SELF_HEAL_FAILURE_THRESHOLD {
      s.cooldown_until = Some(now_ms() + COOLDOWN_MS_AFTER_SELF_HEAL as i64);
      s.consecutive_failures = 0;
      s.backoff_ms = 0;
    }
  }

  pub(crate) fn snapshot(&self) -> ReceiveLoopState {
    self.state.lock().unwrap().clone()
  }
}

#[derive(Clone)]
pub(crate) struct AgentModeConfig {
  pub(crate) enabled: bool,
  pub(crate) intent: String,
  pub(crate) constraints: String,
  pub(crate) last_n: u32,
}

impl AgentModeConfig {
  pub(crate) fn enabled_default() -> Self {
    Self {
      enabled: true,
      intent: DEFAULT_AGENT_INTENT.to_string(),
      constraints: DEFAULT_AGENT_CONSTRAINTS.to_string(),
      last_n: DEFAULT_AGENT_LAST_N,
    }
  }
}

// --------------------
// Account manager
// --------------------
#[derive(Clone)]
pub(crate) struct AccountManager {
  pub(crate) base_threads_dir: PathBuf,
  pub(crate) active_account: Arc<Mutex<Option<String>>>,
  pub(crate) states: Arc<Mutex<HashMap<String, ThreadState>>>,
}

impl AccountManager {
  pub(crate) fn new(base_threads_dir: PathBuf) -> Self {
    Self {
      base_threads_dir,
      active_account: Arc::new(Mutex::new(None)),
      states: Arc::new(Mutex::new(HashMap::new())),
    }
  }

  fn storage_path_for(&self, account_id: &str) -> PathBuf {
    self.base_threads_dir.join(format!("{}.json", sanitize_filename(account_id)))
  }

  pub(crate) fn get_or_create(&self, account_id: &str) -> ThreadState {
    let mut map = self.states.lock().unwrap();
    if let Some(ts) = map.get(account_id) {
      return ts.clone();
    }
    let ts = ThreadState::new(account_id.to_string(), self.storage_path_for(account_id));
    ts.load();
    map.insert(account_id.to_string(), ts.clone());
    ts
  }

  pub(crate) fn list_accounts(&self) -> Vec<String> {
    let mut out: Vec<String> = vec![];

    // from in-memory known accounts
    {
      let map = self.states.lock().unwrap();
      for k in map.keys() {
        out.push(k.clone());
      }
    }

    // from disk files
    if let Ok(entries) = std::fs::read_dir(&self.base_threads_dir) {
      for e in entries.flatten() {
        let p = e.path();
        if p.extension().and_then(|s| s.to_str()) == Some("json") {
          if let Some(stem) = p.file_stem().and_then(|s| s.to_str()) {
            out.push(stem.to_string());
          }
        }
      }
    }

    // from env (fresh installs won't have thread files yet)
    if let Some(n) = get_signal_number() {
      out.push(n);
    }

    out.sort();
    out.dedup();
    out
  }

  pub(crate) fn get_active(&self) -> Option<String> {
    self.active_account.lock().unwrap().clone()
  }

  pub(crate) fn set_active(&self, account_id: String) {
    *self.active_account.lock().unwrap() = Some(account_id);
  }
}

// --------------------
// Normalization
// --------------------
pub(crate) fn normalize_incoming_message(my_number: &str, v: &Value) -> Option<(Message, Vec<String>)> {
  let env = v.get("envelope")?;
  let ts = env.get("timestamp").and_then(|x| x.as_i64()).unwrap_or_else(now_ms);
  let source = env.get("source").or_else(|| env.get("sourceNumber")).and_then(|x| x.as_str()).unwrap_or("unknown");
  let source_device = env.get("sourceDevice").and_then(|x| x.as_i64()).unwrap_or(0);

  let data_msg = env.get("dataMessage").unwrap_or(&Value::Null);
  let content = data_msg
    .get("message")
    .and_then(|x| x.as_str())
    .map(|s| s.to_string())
    .unwrap_or_else(|| {
      // fallback
      v.to_string()
    });

  // group detection (best-effort)
  let mut thread_id = source.to_string();
  if let Some(group) = data_msg.get("groupInfo") {
    if let Some(gid) = group.get("groupId").and_then(|x| x.as_str()) {
      thread_id = format!("group:{}", gid);
    } else if let Some(gid) = group.get("groupId").and_then(|x| x.as_array()) {
      // sometimes bytes array; stringify
      thread_id = format!("group:{:?}", gid);
    }
  }

  let id = format!("incoming-{}-{}-{}", source, ts, source_device);

  let msg = Message {
    id,
    thread_id: thread_id.clone(),
    timestamp: ts,
    sender: source.to_string(),
    recipient: Some(my_number.to_string()),
    content,
    direction: Direction::Incoming,
    raw_json: Some(v.clone()),
  };

  // participants best-effort
  let mut participants: Vec<String> = vec![];
  if thread_id.starts_with("group:") {
    // if we can find members, include them; otherwise include sender + me
    if let Some(group) = data_msg.get("groupInfo") {
      if let Some(members) = group.get("members").and_then(|x| x.as_array()) {
        for m in members.iter().filter_map(|x| x.as_str()) {
          participants.push(m.to_string());
        }
      }
    }
    if participants.is_empty() {
      participants.push(source.to_string());
      participants.push(my_number.to_string());
    }
  } else {
    participants.push(source.to_string());
    participants.push(my_number.to_string());
  }

  Some((msg, participants))
}

pub(crate) fn normalize_outgoing_message(my_number: &str, thread_id: &str, recipient: &str, content: &str) -> (Message, Vec<String>) {
  let ts = now_ms();
  let id = format!("outgoing-{}-{}", recipient, ts);
  let msg = Message {
    id,
    thread_id: thread_id.to_string(),
    timestamp: ts,
    sender: my_number.to_string(),
    recipient: Some(recipient.to_string()),
    content: content.to_string(),
    direction: Direction::Outgoing,
    raw_json: None,
  };
  (msg, vec![my_number.to_string(), recipient.to_string()])
}

pub(crate) fn now_ms() -> i64 {
  use std::time::{SystemTime, UNIX_EPOCH};
  SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64
}

pub(crate) fn sanitize_filename(s: &str) -> String {
  s.chars()
    .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
    .collect()
}

fn compute_backoff_ms(attempt: u32) -> i64 {
  let base = 1000i64;
  let cap = 30_000i64;
  let exp = 2i64.saturating_pow(attempt.min(10));
  let jitter = (now_ms() % 300) as i64;
  (base * exp).min(cap) + jitter
}

pub(crate) fn make_outbox_item_id(account_id: &str, thread_id: &str) -> String {
  format!("outbox-{}-{}-{}", sanitize_filename(account_id), sanitize_filename(thread_id), now_ms())
}

pub(crate) fn recipient_from_thread_id(thread_id: &str) -> (String, String) {
  let tid = thread_id.trim();
  if let Some(rest) = tid.strip_prefix("dm:") {
    return ("dm".to_string(), rest.trim().to_string());
  }
  if let Some(rest) = tid.strip_prefix("group:") {
    return ("group".to_string(), rest.trim().to_string());
  }
  ("dm".to_string(), tid.to_string())
}

pub(crate) fn emit_outbox_updated(app: &tauri::AppHandle, account_id: &str, thread_id: Option<&str>, summary: OutboxSummary) {
  let payload = match thread_id {
    Some(tid) => json!({ "account_id": account_id, "thread_id": tid, "summary": summary }),
    None => json!({ "account_id": account_id, "summary": summary }),
  };
  let _ = app.emit("outbox-updated", payload);
}

pub(crate) fn emit_outbox_item_updated(app: &tauri::AppHandle, item: &OutboxItem) {
  let _ = app.emit("outbox-item-updated", item.clone());
}

// --------------------
// Contact/Group search (meta + custom fields)
// --------------------
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub(crate) struct PeopleSearchFilters {
  #[serde(default)]
  pub(crate) favorites_only: bool,
  #[serde(default)]
  pub(crate) has_photo: bool,
  #[serde(default)]
  pub(crate) apple_linked: bool,
  #[serde(default)]
  pub(crate) category: Option<String>,
  #[serde(default)]
  pub(crate) include_muted: bool,
  #[serde(default)]
  pub(crate) field_key: Option<String>,
  #[serde(default)]
  pub(crate) field_value: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub(crate) struct ContactHit {
  pub(crate) id: String,
  pub(crate) display_name: String,
  pub(crate) secondary: String,
  pub(crate) matched_fields: Vec<String>,
  pub(crate) score: i32,
}

#[derive(Clone, Debug, Serialize)]
pub(crate) struct GroupHit {
  pub(crate) id: String,
  pub(crate) display_name: String,
  pub(crate) secondary: String,
  pub(crate) matched_fields: Vec<String>,
  pub(crate) score: i32,
}

pub(crate) fn lc(s: &str) -> String {
  s.to_lowercase()
}

pub(crate) fn contact_secondary_from_id(contact_id: &str) -> String {
  if contact_id.starts_with("dm:") {
    contact_id[3..].to_string()
  } else {
    contact_id.to_string()
  }
}

pub(crate) fn field_filter_match(fields: &[CustomField], fk: &Option<String>, fv: &Option<String>) -> bool {
  let fk = fk.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()).map(lc);
  let fv = fv.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()).map(lc);
  if fk.is_none() && fv.is_none() {
    return true;
  }
  for f in fields {
    let key_lc = lc(&f.key);
    let val_lc = lc(&f.value);
    let ok_k = fk.as_ref().map(|k| key_lc.contains(k)).unwrap_or(true);
    let ok_v = fv.as_ref().map(|v| val_lc.contains(v)).unwrap_or(true);
    if ok_k && ok_v {
      return true;
    }
  }
  false
}

pub(crate) fn search_match_score_and_fields(
  query_lc: &str,
  meta_fields: &[(&str, &str)],
  cats: &[String],
  searchable_custom: &[CustomField],
) -> (i32, Vec<String>) {
  if query_lc.is_empty() {
    return (0, vec![]);
  }
  let mut score: i32 = 0;
  let mut matched: Vec<String> = vec![];

  for (label, value) in meta_fields {
    let v = lc(value);
    if !v.is_empty() && v.contains(query_lc) {
      score += 3;
      matched.push(label.to_string());
    }
  }

  for c in cats {
    let v = lc(c);
    if !v.is_empty() && v.contains(query_lc) {
      score += 2;
      matched.push(format!("category:{}", c));
    }
  }

  for f in searchable_custom {
    let k = lc(&f.key);
    let v = lc(&f.value);
    if !k.is_empty() && k.contains(query_lc) {
      score += 1;
      matched.push(format!("field:key:{}", f.key));
    }
    if !v.is_empty() && v.contains(query_lc) {
      score += 2;
      matched.push(format!("field:value:{}", f.key));
    }
  }

  (score, matched)
}

pub(crate) fn fmt_time_export(ts: i64) -> String {
  use chrono::DateTime;
  let secs = ts / 1000;
  let nanos = ((ts % 1000) * 1_000_000) as u32;
  match DateTime::from_timestamp(secs, nanos) {
    Some(dt) => dt.format("%Y-%m-%d %H:%M:%S").to_string(),
    None => ts.to_string(),
  }
}
