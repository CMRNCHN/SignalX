use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex, OnceLock};
use base64::Engine;
use uuid::Uuid;

use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Mutex as AsyncMutex;
use chrono::Timelike;

mod ivr;
mod commerce;
mod orders;
mod link;
use ivr::{thread_allowed, IvrSettings, IvrStore};
use commerce::{format_catalog_list, CommerceStore, Customer, Product};
use orders::{format_invoice, Order, OrderLineInput, OrderStore};
use link::{DeviceLinkManager, DeviceLinkStatus};

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

fn set_app_handle(handle: AppHandle) {
  let _ = APP_HANDLE.set(handle);
}

fn emit_event<S: Serialize + Clone>(event: &str, payload: S) {
  if let Some(app) = APP_HANDLE.get() {
    let _ = app.emit(event, payload);
  }
}

fn tokio_block_on<F: std::future::Future>(f: F) -> F::Output {
  tokio::runtime::Builder::new_multi_thread()
    .enable_all()
    .build()
    .expect("failed to start Tokio runtime")
    .block_on(f)
}


const RECEIVE_TIMEOUT_SECS: &str = "2";
const RECEIVE_MAX_MESSAGES: &str = "50";

const MAX_BACKOFF_MS: u64 = 5000;
const COOLDOWN_MS_AFTER_SELF_HEAL: u64 = 30_000;
const SELF_HEAL_FAILURE_THRESHOLD: u32 = 10;
const DEFAULT_AGENT_INTENT: &str = "prepare but do not send";
const DEFAULT_AGENT_CONSTRAINTS: &str = "concise, actionable, do not auto-send";
const DEFAULT_AGENT_LAST_N: u32 = 50;
const DEFAULT_OLLAMA_URL: &str = "http://localhost:11434";
const DEFAULT_OLLAMA_TIMEOUT_SECS: u64 = 120;
const OLLAMA_PROBE_TIMEOUT_SECS: u64 = 3;

// --------------------
// API helpers
// --------------------
fn ok(data: Value) -> Value {
  json!({ "success": true, "data": data })
}
fn ok_t<T: Serialize>(data: T) -> Value {
  json!({ "success": true, "data": data })
}
fn err(msg: String) -> Value {
  json!({ "success": false, "error": msg })
}

// --------------------
// ENV LOADING (portable)
// --------------------
#[derive(Clone, Debug, Serialize)]
struct EnvResolve {
  env_path: Option<String>,
  config_path: Option<String>,
  number: Option<String>,
  signal_cli_bin: String,
}

fn load_env() -> Result<Option<PathBuf>, String> {
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

fn get_signal_config() -> Option<String> {
  std::env::var("SIGNALX_SIGNALCLI_CONFIG").ok()
}

fn get_signal_number() -> Option<String> {
  std::env::var("SIGNALX_NUMBER")
    .ok()
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
}

// Priority: SIGNALX_SIGNALCLI_BIN > /opt/homebrew/bin/signal-cli > signal-cli
fn get_signal_cli_path() -> String {
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
struct SignalCliInfo {
  bin: String,
  is_usable: bool,
  version: Option<String>,
  last_error: Option<String>,
}

fn probe_signal_cli(bin: &str) -> SignalCliInfo {
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

fn build_signal_command(config: &str, number: Option<&str>) -> Command {
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
enum Direction {
  Incoming,
  Outgoing,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "PascalCase")]
enum OutboxStatus {
  Pending,
  Sending,
  Failed,
  Sent,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct Message {
  id: String,
  thread_id: String,
  timestamp: i64,
  sender: String,
  recipient: Option<String>,
  content: String,
  direction: Direction,
  raw_json: Option<Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct ThreadSummary {
  id: String,
  participants: Vec<String>,
  last_message_timestamp: i64,
  unread_count: u32,
  message_count: u32,
  outbox_count: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct ThreadData {
  id: String,
  participants: Vec<String>,
  last_message_timestamp: i64,
  unread_count: u32,
  messages: Vec<Message>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct PendingReply {
  message_id: String,
  thread_id: String,
  draft: String,
  intent: String,
  created_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct OutboxEntry {
  id: String,
  thread_id: String,
  recipient: String,
  content: String,
  created_at: i64,
  last_attempt_at: Option<i64>,
  next_attempt_at: i64,
  attempt_count: u32,
  status: OutboxStatus,
  last_error: Option<String>,
}

// --------------------
// New Outbox (v1, per-account persisted)
// --------------------
#[derive(Clone, Debug, Serialize, Deserialize)]
struct OutboxData {
  version: u32,
  items: Vec<OutboxItem>,
}

impl OutboxData {
  fn v1() -> Self {
    Self { version: 1, items: vec![] }
  }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct OutboxItem {
  id: String,
  account_id: String,
  thread_id: String,
  recipient: String,
  content: String,
  created_at: i64,
  last_attempt_at: Option<i64>,
  attempt_count: u32,
  state: String, // "queued" | "sending" | "sent" | "failed"
  last_error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct OutboxSummary {
  queued: u32,
  sending: u32,
  failed: u32,
}

impl OutboxSummary {
  fn empty() -> Self {
    Self { queued: 0, sending: 0, failed: 0 }
  }
}

#[derive(Clone)]
struct OutboxStore {
  dir: PathBuf, // {app_data_dir}/outbox
  data: Arc<Mutex<HashMap<String, OutboxData>>>, // account_id -> data
  save_mutexes: Arc<Mutex<HashMap<String, Arc<Mutex<()>>>>>, // account_id -> mutex
}

impl OutboxStore {
  fn new(dir: PathBuf) -> Self {
    Self { dir, data: Arc::new(Mutex::new(HashMap::new())), save_mutexes: Arc::new(Mutex::new(HashMap::new())) }
  }

  fn path_for(&self, account_id: &str) -> PathBuf {
    // Hard constraint: {app_data_dir}/outbox/{sanitized_account_id}.json
    outbox_path_for(&self.dir, account_id)
  }

  fn account_save_lock(&self, account_id: &str) -> Arc<Mutex<()>> {
    let mut m = self.save_mutexes.lock().unwrap();
    m.entry(account_id.to_string()).or_insert_with(|| Arc::new(Mutex::new(()))).clone()
  }

  async fn ensure_loaded_async(&self, account_id: &str) -> Result<(), String> {
    if self.data.lock().unwrap().contains_key(account_id) {
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

    self.data.lock().unwrap().insert(account_id_s, loaded);
    Ok(())
  }

  fn ensure_loaded(&self, account_id: &str) -> Result<(), String> {
    tokio_block_on(self.ensure_loaded_async(account_id))
  }

  async fn save_account_atomic_async(&self, account_id: &str) -> Result<(), String> {
    self.ensure_loaded_async(account_id).await?;
    let save_lock = self.account_save_lock(account_id);
    let path = self.path_for(account_id);
    let dir = self.dir.clone();
    let snapshot = {
      let d = self.data.lock().unwrap();
      let data = d.get(account_id).cloned().unwrap_or_else(OutboxData::v1);
      serde_json::to_string_pretty(&data).map_err(|e| format!("outbox serialize error: {}", e))?
    };

    let save_lock2 = save_lock.clone();
    tokio::task::spawn_blocking(move || {
      let _guard = save_lock2.lock().unwrap();
      let _ = std::fs::create_dir_all(&dir);
      let tmp_path = path.with_extension("json.tmp");
      std::fs::write(&tmp_path, snapshot.as_bytes()).map_err(|e| format!("outbox write failed: {}", e))?;
      std::fs::rename(&tmp_path, &path).map_err(|e| format!("outbox rename failed: {}", e))?;
      Ok(())
    })
    .await
    .map_err(|e| format!("outbox save join error: {}", e))?
  }

  fn save_account_atomic(&self, account_id: &str) -> Result<(), String> {
    tokio_block_on(self.save_account_atomic_async(account_id))
  }

  fn list(&self, account_id: &str, thread_id: Option<&str>) -> Result<Vec<OutboxItem>, String> {
    self.ensure_loaded(account_id)?;
    let d = self.data.lock().unwrap();
    let data = d.get(account_id).cloned().unwrap_or_else(OutboxData::v1);
    let mut items = data.items;
    if let Some(tid) = thread_id {
      items.retain(|i| i.thread_id == tid);
    }
    items.sort_by_key(|i| i.created_at);
    Ok(items)
  }

  fn summary(&self, account_id: &str) -> Result<OutboxSummary, String> {
    self.ensure_loaded(account_id)?;
    let d = self.data.lock().unwrap();
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

  async fn list_async(&self, account_id: &str, thread_id: Option<&str>) -> Result<Vec<OutboxItem>, String> {
    self.ensure_loaded_async(account_id).await?;
    let d = self.data.lock().unwrap();
    let data = d.get(account_id).cloned().unwrap_or_else(OutboxData::v1);
    let mut items = data.items;
    if let Some(tid) = thread_id {
      items.retain(|i| i.thread_id == tid);
    }
    items.sort_by_key(|i| i.created_at);
    Ok(items)
  }

  async fn summary_async(&self, account_id: &str) -> Result<OutboxSummary, String> {
    self.ensure_loaded_async(account_id).await?;
    let d = self.data.lock().unwrap();
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

  fn add_item(&self, item: OutboxItem) -> Result<OutboxItem, String> {
    self.ensure_loaded(&item.account_id)?;
    {
      let mut d = self.data.lock().unwrap();
      let data = d.entry(item.account_id.clone()).or_insert_with(OutboxData::v1);
      data.items.push(item.clone());
      data.items.sort_by_key(|i| i.created_at);
    }
    self.save_account_atomic(&item.account_id)?;
    Ok(item)
  }

  async fn add_item_async(&self, item: OutboxItem) -> Result<OutboxItem, String> {
    self.ensure_loaded_async(&item.account_id).await?;
    {
      let mut d = self.data.lock().unwrap();
      let data = d.entry(item.account_id.clone()).or_insert_with(OutboxData::v1);
      data.items.push(item.clone());
      data.items.sort_by_key(|i| i.created_at);
    }
    self.save_account_atomic_async(&item.account_id).await?;
    Ok(item)
  }

  fn update_item(&self, account_id: &str, updated: OutboxItem) -> Result<OutboxItem, String> {
    self.ensure_loaded(account_id)?;
    {
      let mut d = self.data.lock().unwrap();
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

  async fn update_item_async(&self, account_id: &str, updated: OutboxItem) -> Result<OutboxItem, String> {
    self.ensure_loaded_async(account_id).await?;
    {
      let mut d = self.data.lock().unwrap();
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

  fn delete_item(&self, account_id: &str, id: &str) -> Result<bool, String> {
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

  async fn delete_item_async(&self, account_id: &str, id: &str) -> Result<bool, String> {
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

  fn find_by_id(&self, account_id: &str, id: &str) -> Result<Option<OutboxItem>, String> {
    self.ensure_loaded(account_id)?;
    let d = self.data.lock().unwrap();
    let data = d.get(account_id).cloned().unwrap_or_else(OutboxData::v1);
    Ok(data.items.into_iter().find(|i| i.id == id))
  }

  fn claim_next_for_send(&self, account_id: &str) -> Result<Option<OutboxItem>, String> {
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

  async fn claim_next_for_send_async(&self, account_id: &str) -> Result<Option<OutboxItem>, String> {
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
struct ThreadStateData {
  version: u32,
  threads: HashMap<String, ThreadData>,
  #[serde(default)]
  pending_replies: HashMap<String, Vec<PendingReply>>,
  #[serde(default)]
  draft_history: HashMap<String, Vec<PendingReply>>,
  #[serde(default)]
  outbox: HashMap<String, Vec<OutboxEntry>>,
}

impl ThreadStateData {
  fn v2() -> Self {
    Self { version: 2, threads: HashMap::new(), pending_replies: HashMap::new(), draft_history: HashMap::new(), outbox: HashMap::new() }
  }
}

#[derive(Clone)]
struct ThreadState {
  account_id: String,
  data: Arc<Mutex<ThreadStateData>>,
  save_mutex: Arc<Mutex<()>>,
  storage_path: PathBuf,
  last_save_ok_at: Arc<Mutex<Option<i64>>>,
  last_save_error: Arc<Mutex<Option<String>>>,
}

impl ThreadState {
  fn new(account_id: String, storage_path: PathBuf) -> Self {
    Self {
      account_id,
      data: Arc::new(Mutex::new(ThreadStateData::v2())),
      save_mutex: Arc::new(Mutex::new(())),
      storage_path,
      last_save_ok_at: Arc::new(Mutex::new(None)),
      last_save_error: Arc::new(Mutex::new(None)),
    }
  }

  fn load(&self) {
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

  fn save_atomic(&self) {
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

  fn add_message(&self, msg: Message, participants: Vec<String>) {
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

  fn add_pending_reply(&self, thread_id: &str, pending: PendingReply) {
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

  fn get_pending_replies(&self, thread_id: &str) -> Vec<PendingReply> {
    let d = self.data.lock().unwrap();
    d.pending_replies.get(thread_id).cloned().unwrap_or_else(Vec::new)
  }

  fn consume_pending_reply(&self, thread_id: &str, message_id: &str) -> bool {
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

  fn push_draft_history(&self, thread_id: &str, entry: PendingReply) {
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

  fn get_draft_history(&self, thread_id: &str) -> Vec<PendingReply> {
    let d = self.data.lock().unwrap();
    d.draft_history.get(thread_id).cloned().unwrap_or_else(Vec::new)
  }

  fn clear_pending_replies_for_thread(&self, thread_id: &str) {
    let mut d = self.data.lock().unwrap();
    d.pending_replies.remove(thread_id);
    drop(d);
    self.save_atomic();
  }

  fn enqueue_outbox(&self, item: OutboxEntry) {
    let mut d = self.data.lock().unwrap();
    let list = d.outbox.entry(item.thread_id.clone()).or_insert_with(Vec::new);
    list.push(item);
    list.sort_by_key(|o| o.created_at);
    drop(d);
    self.save_atomic();
  }

  fn update_outbox_item(&self, thread_id: &str, item: OutboxEntry) {
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

  fn remove_outbox_item(&self, thread_id: &str, outbox_id: &str) {
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

  fn list_outbox(&self, thread_id: Option<&str>) -> Vec<OutboxEntry> {
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

  fn outbox_pending_count(&self, thread_id: &str) -> usize {
    let d = self.data.lock().unwrap();
    d.outbox
      .get(thread_id)
      .map(|list| list.iter().filter(|o| o.status != OutboxStatus::Sent).count())
      .unwrap_or(0)
  }

  fn mark_thread_read(&self, thread_id: &str) -> bool {
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

  fn get_threads(&self) -> Vec<ThreadSummary> {
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

  fn get_thread_messages(&self, thread_id: &str) -> Vec<Message> {
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
struct AliasManager {
  dir: PathBuf,
  data: Arc<Mutex<HashMap<String, HashMap<String, String>>>>, // account -> (number->alias)
}

impl AliasManager {
  fn new(dir: PathBuf) -> Self {
    Self { dir, data: Arc::new(Mutex::new(HashMap::new())) }
  }

  fn path_for(&self, account_id: &str) -> PathBuf {
    self.dir.join(format!("{}.json", sanitize_filename(account_id)))
  }

  fn load_account(&self, account_id: &str) {
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

  fn list_aliases(&self, account_id: &str) -> HashMap<String, String> {
    self.data
      .lock()
      .unwrap()
      .get(account_id)
      .cloned()
      .unwrap_or_else(HashMap::new)
  }

  fn set_alias(&self, account_id: &str, number: &str, alias: &str) {
    let mut d = self.data.lock().unwrap();
    let entry = d.entry(account_id.to_string()).or_insert_with(HashMap::new);
    entry.insert(number.to_string(), alias.to_string());
    drop(d);
    self.save_account(account_id);
  }

  fn get_alias(&self, account_id: &str, number: &str) -> Option<String> {
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
struct ContactMetaData {
  version: u32, // v1
  contacts: HashMap<String, ContactMeta>, // key = contact_id
}

// --------------------
// Groups meta store (per account)
// --------------------
#[derive(Clone, Debug, Serialize, Deserialize)]
struct GroupMetaData {
  version: u32, // v1
  groups: HashMap<String, GroupMeta>, // key = group_id (e.g. "group:XYZ")
}

impl GroupMetaData {
  fn v1() -> Self {
    Self { version: 1, groups: HashMap::new() }
  }
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
struct GroupMeta {
  group_id: String, // "group:XYZ"
  display_name: Option<String>,
  categories: Vec<String>,
  favorite: bool,
  muted: bool,
  icon: Option<String>,
  custom_fields: Vec<CustomField>,
  member_notes: Vec<String>, // optional (non-binding)
  /// Opt-in auto-reply for this group. Off by default; groups stay off unless explicitly enabled.
  #[serde(default)]
  auto_reply_enabled: bool,
  updated_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct GroupMetaPatch {
  display_name: Option<Option<String>>,
  categories: Option<Vec<String>>,
  favorite: Option<bool>,
  muted: Option<bool>,
  icon: Option<Option<String>>,
  custom_fields: Option<Vec<CustomField>>,
  member_notes: Option<Vec<String>>,
  auto_reply_enabled: Option<bool>,
}

fn normalize_group_id(input: &str) -> String {
  let s = input.trim();
  if s.starts_with("group:") {
    return s.to_string();
  }
  format!("group:{}", s)
}

#[derive(Clone)]
struct GroupStore {
  dir: PathBuf, // {app_data_dir}/groups
  data: Arc<Mutex<HashMap<String, GroupMetaData>>>, // account -> data
  save_mutex: Arc<Mutex<()>>,
}

impl GroupStore {
  fn new(dir: PathBuf) -> Self {
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

  fn load_account(&self, account_id: &str) {
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

  fn list(&self, account_id: &str) -> Vec<GroupMeta> {
    self.ensure_loaded(account_id);
    let d = self.data.lock().unwrap();
    let mut out: Vec<GroupMeta> = d
      .get(account_id)
      .map(|m| m.groups.values().cloned().collect())
      .unwrap_or_else(Vec::new);
    out.sort_by_key(|g| g.group_id.clone());
    out
  }

  fn get(&self, account_id: &str, group_id: &str) -> Option<GroupMeta> {
    self.ensure_loaded(account_id);
    let gid = normalize_group_id(group_id);
    let d = self.data.lock().unwrap();
    d.get(account_id).and_then(|m| m.groups.get(&gid).cloned())
  }

  fn upsert_patch(&self, account_id: &str, group_id: &str, patch: GroupMetaPatch) -> Result<GroupMeta, String> {
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
    if let Some(v) = patch.auto_reply_enabled { entry.auto_reply_enabled = v; }
    entry.updated_at = now_ms();

    let out = entry.clone();
    drop(d);
    self.save_account_atomic(account_id)?;
    Ok(out)
  }

  fn delete(&self, account_id: &str, group_id: &str) -> Result<bool, String> {
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

  fn list_categories(&self, account_id: &str) -> Vec<String> {
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
  fn v1() -> Self {
    Self { version: 1, contacts: HashMap::new() }
  }
}

#[derive(Clone, Debug, PartialEq, Eq)]
enum CustomFieldType {
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
struct CustomField {
  #[serde(default = "new_custom_field_id")]
  id: String, // stable uuid
  #[serde(default)]
  key: String,
  #[serde(rename = "type", alias = "field_type", default)]
  field_type: CustomFieldType,
  #[serde(rename = "searchable", alias = "is_searchable", default)]
  searchable: bool,
  #[serde(default)]
  value: String, // normalized string form
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
struct ContactMeta {
  contact_id: String, // "+1202..."
  display_name: Option<String>,
  alias: Option<String>,
  categories: Vec<String>,
  favorite: bool,
  muted: bool,
  icon: Option<String>,
  photo_path: Option<String>, // relative under app_data_dir preferred
  apple_contact_id: Option<String>, // stub only for now
  custom_fields: Vec<CustomField>,
  /// Per-thread opt-in for auto-reply. Off by default.
  #[serde(default)]
  auto_reply_enabled: bool,
  updated_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct ContactMetaPatch {
  // Use Option<Option<T>> so we can distinguish "unset" vs explicit null
  display_name: Option<Option<String>>,
  alias: Option<Option<String>>,
  categories: Option<Vec<String>>,
  favorite: Option<bool>,
  muted: Option<bool>,
  icon: Option<Option<String>>,
  apple_contact_id: Option<Option<String>>,
  custom_fields: Option<Vec<CustomField>>,
  auto_reply_enabled: Option<bool>,
}

#[derive(Clone)]
struct ContactStore {
  dir: PathBuf, // {app_data_dir}/contacts
  data: Arc<Mutex<HashMap<String, ContactMetaData>>>, // account -> data
  save_mutex: Arc<Mutex<()>>,
}

fn normalize_contact_id(input: &str) -> String {
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
  fn new(dir: PathBuf) -> Self {
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

  fn ensure_loaded(&self, account_id: &str) {
    if self.data.lock().unwrap().contains_key(account_id) {
      return;
    }
    self.load_account(account_id);
  }

  fn load_account(&self, account_id: &str) {
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

  fn list(&self, account_id: &str) -> Vec<ContactMeta> {
    self.ensure_loaded(account_id);
    let d = self.data.lock().unwrap();
    let mut out: Vec<ContactMeta> = d
      .get(account_id)
      .map(|m| m.contacts.values().cloned().collect())
      .unwrap_or_else(Vec::new);
    out.sort_by_key(|c| c.contact_id.clone());
    out
  }

  fn get(&self, account_id: &str, contact_id: &str) -> Option<ContactMeta> {
    self.ensure_loaded(account_id);
    let cid = normalize_contact_id(contact_id);
    let d = self.data.lock().unwrap();
    d.get(account_id).and_then(|m| m.contacts.get(&cid).cloned())
  }

  fn upsert_patch(&self, account_id: &str, contact_id: &str, patch: ContactMetaPatch) -> Result<ContactMeta, String> {
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
    if let Some(v) = patch.auto_reply_enabled { entry.auto_reply_enabled = v; }
    entry.updated_at = now_ms();

    let out = entry.clone();
    drop(d);
    self.save_account_atomic(account_id)?;
    Ok(out)
  }

  fn delete(&self, account_id: &str, contact_id: &str) -> Result<bool, String> {
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

  fn list_categories(&self, account_id: &str) -> Vec<String> {
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

  fn set_photo(&self, app_data_dir: &Path, account_id: &str, contact_id: &str, bytes: Vec<u8>, ext: &str) -> Result<ContactMeta, String> {
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
      auto_reply_enabled: None,
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

  fn clear_photo(&self, app_data_dir: &Path, account_id: &str, contact_id: &str) -> Result<ContactMeta, String> {
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
struct SearchResult {
  message_id: String,
  thread_id: String,
  timestamp: i64,
  sender: String,
  snippet: String,
  offset: usize,
}

fn search_in_messages(messages: &[Message], q: &str, limit: usize, sender: Option<&str>, after_ts: Option<i64>, before_ts: Option<i64>) -> Vec<SearchResult> {
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
// AI tools (Ollama local HTTP API — data never leaves the machine)
// --------------------
fn ollama_base_url() -> String {
  std::env::var("SIGNALX_OLLAMA_URL")
    .unwrap_or_else(|_| DEFAULT_OLLAMA_URL.to_string())
    .trim_end_matches('/')
    .to_string()
}

fn ollama_timeout() -> std::time::Duration {
  let secs = std::env::var("SIGNALX_OLLAMA_TIMEOUT_SECS")
    .ok()
    .and_then(|s| s.parse().ok())
    .unwrap_or(DEFAULT_OLLAMA_TIMEOUT_SECS);
  std::time::Duration::from_secs(secs)
}

fn ai_not_configured_msg() -> String {
  format!(
    "AI not configured. Set SIGNALX_OLLAMA_MODEL in .signalx.env and ensure Ollama is running at {}.",
    ollama_base_url()
  )
}

fn map_ollama_http_error(e: ureq::Error, base_url: &str) -> String {
  match e {
    ureq::Error::Status(code, resp) => {
      let body = resp.into_string().unwrap_or_default();
      if let Ok(v) = serde_json::from_str::<Value>(&body) {
        if let Some(err) = v.get("error").and_then(|e| e.as_str()) {
          if err.contains("not found") {
            return format!("Ollama model not found: {}. Run `ollama pull <model>`.", err);
          }
          return format!("Ollama error (HTTP {}): {}", code, err);
        }
      }
      let detail = body.trim();
      if detail.is_empty() {
        format!("Ollama HTTP error (status {})", code)
      } else {
        format!("Ollama HTTP error (status {}): {}", code, detail)
      }
    }
    ureq::Error::Transport(t) => {
      let msg = t.to_string();
      if msg.contains("Connection refused") || msg.contains("connect") || msg.contains("failed to connect") {
        format!(
          "Cannot reach Ollama at {}. Start the server with `ollama serve`.",
          base_url
        )
      } else if msg.contains("timed out") || msg.contains("timeout") {
        "Ollama request timed out. Try a smaller model or increase SIGNALX_OLLAMA_TIMEOUT_SECS.".to_string()
      } else {
        format!("Ollama connection error: {}", msg)
      }
    }
  }
}

fn build_ollama_chat_body(model: &str, messages: Vec<Value>) -> Value {
  let mut body = json!({
    "model": model,
    "messages": messages,
    "stream": false
  });

  let mut options = serde_json::Map::new();
  if let Ok(t) = std::env::var("SIGNALX_OLLAMA_TEMPERATURE") {
    if let Ok(v) = t.parse::<f64>() {
      options.insert("temperature".to_string(), json!(v));
    }
  }
  if let Ok(n) = std::env::var("SIGNALX_OLLAMA_NUM_PREDICT") {
    if let Ok(v) = n.parse::<u64>() {
      options.insert("num_predict".to_string(), json!(v));
    }
  }
  if !options.is_empty() {
    body["options"] = json!(options);
  }

  body
}

fn call_ollama_chat(model: &str, messages: Vec<Value>) -> Result<String, String> {
  let base = ollama_base_url();
  let url = format!("{}/api/chat", base);
  let body = build_ollama_chat_body(model, messages);

  let resp: Value = ureq::post(&url)
    .set("Content-Type", "application/json")
    .timeout(ollama_timeout())
    .send_json(body)
    .map_err(|e| map_ollama_http_error(e, &base))?
    .into_json()
    .map_err(|e| format!("Ollama response parse error: {}", e))?;

  if let Some(err) = resp.get("error").and_then(|e| e.as_str()) {
    return Err(format!("Ollama error: {}", err));
  }

  resp["message"]["content"]
    .as_str()
    .map(|s| s.to_string())
    .ok_or_else(|| format!("Unexpected Ollama response: {}", resp))
}

fn ai_enabled() -> bool {
  std::env::var("SIGNALX_OLLAMA_MODEL").ok().map(|s| !s.trim().is_empty()).unwrap_or(false)
}

#[derive(Clone, Debug, Serialize)]
struct AiStatus {
  configured: bool,
  ollama_url: String,
  ollama_model: Option<String>,
  ollama_reachable: bool,
  ollama_last_error: Option<String>,
}

fn probe_ollama() -> AiStatus {
  let base = ollama_base_url();
  let model = std::env::var("SIGNALX_OLLAMA_MODEL")
    .ok()
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty());
  let configured = model.is_some();
  let url = format!("{}/api/tags", base);
  let timeout = std::time::Duration::from_secs(OLLAMA_PROBE_TIMEOUT_SECS);

  match ureq::get(&url).timeout(timeout).call() {
    Ok(resp) => {
      let status = resp.status();
      if status >= 400 {
        AiStatus {
          configured,
          ollama_url: base,
          ollama_model: model,
          ollama_reachable: false,
          ollama_last_error: Some(format!("Ollama HTTP error (status {})", status)),
        }
      } else {
        AiStatus {
          configured,
          ollama_url: base,
          ollama_model: model,
          ollama_reachable: true,
          ollama_last_error: None,
        }
      }
    }
    Err(e) => {
      let err = map_ollama_http_error(e, &base);
      AiStatus {
        configured,
        ollama_url: base,
        ollama_model: model,
        ollama_reachable: false,
        ollama_last_error: Some(err),
      }
    }
  }
}

fn format_thread_context(msgs: &[Message]) -> String {
  msgs
    .iter()
    .map(|m| format!("[{}] {}: {}", m.timestamp, m.sender, m.content))
    .collect::<Vec<_>>()
    .join("\n")
}

fn collect_recent_messages(ts: &ThreadState, thread_id: &str, last_n: usize) -> Vec<Message> {
  let mut msgs = ts.get_thread_messages(thread_id);
  msgs.sort_by_key(|m| m.timestamp);
  if msgs.len() > last_n {
    msgs = msgs[msgs.len() - last_n..].to_vec();
  }
  msgs
}

fn draft_reply_for_thread(
  ts: &ThreadState,
  thread_id: &str,
  intent: &str,
  constraints: Option<&str>,
  last_n: Option<u32>,
) -> Result<String, String> {
  if !ai_enabled() {
    return Err(ai_not_configured_msg());
  }

  let n = last_n.unwrap_or(DEFAULT_AGENT_LAST_N).max(1).min(200) as usize;
  let msgs = collect_recent_messages(ts, thread_id, n);
  if msgs.is_empty() {
    return Err("No messages in thread.".to_string());
  }
  let ctx = format_thread_context(&msgs);

  let model = std::env::var("SIGNALX_OLLAMA_MODEL").unwrap();
  let c = constraints.unwrap_or("short, clear");
  let messages = vec![
    json!({
      "role": "system",
      "content": format!("You are a business assistant handling Signal messages. Constraints: {}. Return only the reply text, nothing else.", c)
    }),
    json!({
      "role": "user",
      "content": format!("Draft a reply to this Signal thread.\nIntent: {}\n\nTHREAD:\n{}", intent, ctx)
    }),
  ];

  call_ollama_chat(&model, messages).map(|s| s.trim().to_string())
}

// --------------------
// Receive loop monitor
// --------------------
#[derive(Clone, Debug, Serialize)]
struct ReceiveLoopState {
  last_receive_ok_at: Option<i64>,
  last_receive_error: Option<String>,
  consecutive_failures: u32,
  backoff_ms: u64,
  cooldown_until: Option<i64>,
}

#[derive(Clone)]
struct ReceiveLoopMonitor {
  state: Arc<Mutex<ReceiveLoopState>>,
}

impl ReceiveLoopMonitor {
  fn new() -> Self {
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

  fn on_success(&self) {
    let mut s = self.state.lock().unwrap();
    s.last_receive_ok_at = Some(now_ms());
    s.last_receive_error = None;
    s.consecutive_failures = 0;
    s.backoff_ms = 0;
    s.cooldown_until = None;
  }

  fn on_error(&self, e: String) {
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

  fn snapshot(&self) -> ReceiveLoopState {
    self.state.lock().unwrap().clone()
  }
}

#[derive(Clone)]
struct AgentModeConfig {
  enabled: bool,
  intent: String,
  constraints: String,
  last_n: u32,
}

impl AgentModeConfig {
  fn enabled_default() -> Self {
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
struct AccountManager {
  base_threads_dir: PathBuf,
  active_account: Arc<Mutex<Option<String>>>,
  states: Arc<Mutex<HashMap<String, ThreadState>>>,
}

impl AccountManager {
  fn new(base_threads_dir: PathBuf) -> Self {
    Self {
      base_threads_dir,
      active_account: Arc::new(Mutex::new(None)),
      states: Arc::new(Mutex::new(HashMap::new())),
    }
  }

  fn storage_path_for(&self, account_id: &str) -> PathBuf {
    self.base_threads_dir.join(format!("{}.json", sanitize_filename(account_id)))
  }

  fn get_or_create(&self, account_id: &str) -> ThreadState {
    let account_id = sanitize_filename(account_id.trim());
    let mut map = self.states.lock().unwrap();
    if let Some(ts) = map.get(&account_id) {
      return ts.clone();
    }
    let ts = ThreadState::new(account_id.clone(), self.storage_path_for(&account_id));
    ts.load();
    map.insert(account_id, ts.clone());
    ts
  }

  fn get_active(&self) -> Option<String> {
    self.active_account.lock().unwrap().clone()
  }

  fn set_active(&self, account_id: String) {
    *self.active_account.lock().unwrap() = Some(sanitize_filename(account_id.trim()));
  }
}

// --------------------
// Normalization
// --------------------
fn normalize_incoming_message(my_number: &str, v: &Value) -> Option<(Message, Vec<String>)> {
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

fn normalize_outgoing_message(my_number: &str, thread_id: &str, recipient: &str, content: &str) -> (Message, Vec<String>) {
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

// --------------------
// Diagnostics
// --------------------
#[derive(Clone, Debug, Serialize)]
struct Diagnostics {
  env_path: Option<String>,
  app_data_dir: String,
  threads_dir: String,
  aliases_dir: String,
  search_dir: String,
  export_dir: String,
  signal_cli_path: String,
  signal_cli_version: Option<String>,
  signal_cli_usable: bool,
  signal_cli_last_error: Option<String>,
  config_path: Option<String>,
  number: Option<String>,
  active_account: Option<String>,
  ollama_configured: bool,
  ollama_url: String,
  ollama_model: Option<String>,
  ollama_reachable: bool,
  ollama_last_error: Option<String>,
}

// --------------------
// Auto-reply settings + audit (Phase 5)
// --------------------
#[derive(Clone, Debug, Serialize, Deserialize)]
struct AutoReplySettings {
  /// Global master switch. Off by default — no auto-sends until explicitly enabled.
  #[serde(default)]
  enabled: bool,
  /// Allowlist-only: thread_id must appear here to auto-send. Empty = nobody.
  #[serde(default)]
  allowlist: Vec<String>,
  /// Quiet hours (local wall-clock hour 0–23). Inclusive start, exclusive end (wraps midnight).
  quiet_hours_start: Option<u32>,
  quiet_hours_end: Option<u32>,
  /// Max auto-sends per thread inside `window_secs`.
  #[serde(default = "default_max_per_thread")]
  max_per_thread_per_hour: u32,
  /// Max auto-sends across all threads inside `window_secs`.
  #[serde(default = "default_max_per_window")]
  max_per_window: u32,
  #[serde(default = "default_window_secs")]
  window_secs: u64,
}

fn default_max_per_thread() -> u32 { 3 }
fn default_max_per_window() -> u32 { 20 }
fn default_window_secs() -> u64 { 3600 }

impl Default for AutoReplySettings {
  fn default() -> Self {
    Self {
      enabled: false,
      allowlist: vec![],
      quiet_hours_start: None,
      quiet_hours_end: None,
      max_per_thread_per_hour: default_max_per_thread(),
      max_per_window: default_max_per_window(),
      window_secs: default_window_secs(),
    }
  }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct AutoReplyAuditEntry {
  id: String,
  account_id: String,
  thread_id: String,
  message_id: String,
  draft: String,
  created_at: i64,
  /// "sent" | "draft_only" | "blocked"
  outcome: String,
  reason: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
struct AutoReplyAuditLog {
  entries: Vec<AutoReplyAuditEntry>,
}

#[derive(Clone)]
struct AutoReplyStore {
  settings_path: PathBuf,
  audit_path: PathBuf,
  settings: Arc<Mutex<AutoReplySettings>>,
  audit: Arc<Mutex<AutoReplyAuditLog>>,
  /// In-memory timestamps of recent auto-sends for rate limiting: (thread_id, ts_ms)
  recent_sends: Arc<Mutex<Vec<(String, i64)>>>,
}

impl AutoReplyStore {
  fn new(app_data_dir: &Path) -> Self {
    let settings_path = app_data_dir.join("auto_reply_settings.json");
    let audit_path = app_data_dir.join("auto_reply_audit.json");
    let settings = if settings_path.is_file() {
      std::fs::read_to_string(&settings_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
    } else {
      AutoReplySettings::default()
    };
    let audit = if audit_path.is_file() {
      std::fs::read_to_string(&audit_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
    } else {
      AutoReplyAuditLog::default()
    };
    Self {
      settings_path,
      audit_path,
      settings: Arc::new(Mutex::new(settings)),
      audit: Arc::new(Mutex::new(audit)),
      recent_sends: Arc::new(Mutex::new(Vec::new())),
    }
  }

  fn get_settings(&self) -> AutoReplySettings {
    self.settings.lock().unwrap().clone()
  }

  fn set_settings(&self, s: AutoReplySettings) -> Result<AutoReplySettings, String> {
    {
      *self.settings.lock().unwrap() = s.clone();
    }
    let json = serde_json::to_string_pretty(&s).map_err(|e| e.to_string())?;
    if let Some(parent) = self.settings_path.parent() {
      std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&self.settings_path, json).map_err(|e| e.to_string())?;
    Ok(s)
  }

  fn list_audit(&self, limit: usize) -> Vec<AutoReplyAuditEntry> {
    let a = self.audit.lock().unwrap();
    let n = a.entries.len();
    let start = n.saturating_sub(limit);
    a.entries[start..].iter().rev().cloned().collect()
  }

  fn append_audit(&self, entry: AutoReplyAuditEntry) {
    {
      let mut a = self.audit.lock().unwrap();
      a.entries.push(entry);
      // Cap at 500
      if a.entries.len() > 500 {
        let excess = a.entries.len() - 500;
        a.entries.drain(0..excess);
      }
      let json = serde_json::to_string_pretty(&*a).unwrap_or_else(|_| "{}".to_string());
      let _ = std::fs::write(&self.audit_path, json);
    }
  }

  fn record_send(&self, thread_id: &str) {
    let mut v = self.recent_sends.lock().unwrap();
    v.push((thread_id.to_string(), now_ms()));
  }

  fn count_recent(&self, thread_id: Option<&str>, window_ms: i64) -> u32 {
    let cutoff = now_ms() - window_ms;
    let mut v = self.recent_sends.lock().unwrap();
    v.retain(|(_, ts)| *ts >= cutoff);
    match thread_id {
      Some(tid) => v.iter().filter(|(t, _)| t == tid).count() as u32,
      None => v.len() as u32,
    }
  }
}

fn in_quiet_hours(settings: &AutoReplySettings) -> bool {
  let (Some(start), Some(end)) = (settings.quiet_hours_start, settings.quiet_hours_end) else {
    return false;
  };
  if start > 23 || end > 23 {
    return false;
  }
  let hour = chrono::Local::now().hour();
  if start == end {
    return false; // disabled
  }
  if start < end {
    hour >= start && hour < end
  } else {
    // wraps midnight
    hour >= start || hour < end
  }
}

fn thread_auto_reply_opted_in(state: &AppState, thread_id: &str) -> bool {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => return false,
  };
  let tid = thread_id.trim();
  if tid.starts_with("group:") {
    state
      .group_store
      .get(&account, tid)
      .map(|g| g.auto_reply_enabled)
      .unwrap_or(false)
  } else {
    let cid = normalize_contact_id(tid.trim_start_matches("dm:"));
    // Prefer contact meta keyed by dm:+E164 or raw
    if let Some(c) = state.contact_store.get(&account, tid) {
      return c.auto_reply_enabled;
    }
    if let Some(c) = state.contact_store.get(&account, &cid) {
      return c.auto_reply_enabled;
    }
    false
  }
}

/// Returns Ok(()) if auto-send is allowed, Err(reason) otherwise.
fn auto_reply_guardrails(state: &AppState, thread_id: &str) -> Result<(), String> {
  let settings = state.auto_reply.get_settings();
  if !settings.enabled {
    return Err("global auto-reply disabled (kill-switch)".to_string());
  }
  if !ai_enabled() {
    return Err("AI not configured".to_string());
  }
  if !thread_auto_reply_opted_in(state, thread_id) {
    return Err("thread not opted-in".to_string());
  }
  let tid = thread_id.trim();
  if !settings.allowlist.iter().any(|t| t.trim() == tid) {
    return Err("thread not on allowlist".to_string());
  }
  if tid.starts_with("group:") && !thread_auto_reply_opted_in(state, tid) {
    return Err("groups require explicit opt-in".to_string());
  }
  if in_quiet_hours(&settings) {
    return Err("quiet hours active".to_string());
  }
  let window_ms = (settings.window_secs as i64) * 1000;
  let per_thread = state.auto_reply.count_recent(Some(tid), window_ms);
  if per_thread >= settings.max_per_thread_per_hour {
    return Err(format!("per-thread rate limit ({}/window)", settings.max_per_thread_per_hour));
  }
  let global = state.auto_reply.count_recent(None, window_ms);
  if global >= settings.max_per_window {
    return Err(format!("global rate limit ({}/window)", settings.max_per_window));
  }
  Ok(())
}

// --------------------
// Application state
// --------------------
#[derive(Clone)]
struct AppState {
  env_path: Option<PathBuf>,
  app_data_dir: PathBuf,
  threads_dir: PathBuf,
  aliases_dir: PathBuf,
  search_dir: PathBuf,
  export_dir: PathBuf,
  outbox_dir: PathBuf,
  account_manager: AccountManager,
  alias_manager: AliasManager,
  contact_store: ContactStore,
  group_store: GroupStore,
  receive_monitor: ReceiveLoopMonitor,
  signal_cli_info: Arc<Mutex<SignalCliInfo>>,
  outbox_store: OutboxStore,
  outbox_send_locks: Arc<Mutex<HashMap<String, Arc<AsyncMutex<()>>>>>, // account_id -> send mutex
  outbox_workers: Arc<Mutex<HashSet<String>>>, // account_id set
  auto_reply: AutoReplyStore,
  ivr: IvrStore,
  commerce: CommerceStore,
  orders: OrderStore,
  device_link: DeviceLinkManager,
}

fn now_ms() -> i64 {
  use std::time::{SystemTime, UNIX_EPOCH};
  SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64
}

fn sanitize_filename(s: &str) -> String {
  s.chars()
    .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
    .collect()
}

fn canonical_account_id_from_number(number: &str) -> String {
  sanitize_filename(number.trim())
}

fn configured_account_id() -> Option<String> {
  get_signal_number().map(|n| canonical_account_id_from_number(&n))
}

fn outbox_path_for(dir: &Path, account_id: &str) -> PathBuf {
  dir.join(format!("{}.json", sanitize_filename(account_id)))
}

fn path_is_under_root(root: &Path, candidate: &Path) -> bool {
  let Ok(root) = root.canonicalize() else {
    return false;
  };
  let Ok(cand) = candidate.canonicalize() else {
    return false;
  };
  cand.starts_with(&root)
}

fn compute_backoff_ms(attempt: u32) -> i64 {
  let base = 1000i64;
  let cap = 30_000i64;
  let exp = 2i64.saturating_pow(attempt.min(10));
  let jitter = (now_ms() % 300) as i64;
  (base * exp).min(cap) + jitter
}

// --------------------
// API handlers (reserved for future CLI/HTTP)
// --------------------
fn get_receive_loop_state(state: &AppState) -> Value {
  ok_t(state.receive_monitor.snapshot())
}

fn get_diagnostics(state: &AppState) -> Value {
  let cli = state.signal_cli_info.lock().unwrap().clone();
  let ai = probe_ollama();
  let diag = Diagnostics {
    env_path: state.env_path.as_ref().map(|p| p.to_string_lossy().to_string()),
    app_data_dir: state.app_data_dir.to_string_lossy().to_string(),
    threads_dir: state.threads_dir.to_string_lossy().to_string(),
    aliases_dir: state.aliases_dir.to_string_lossy().to_string(),
    search_dir: state.search_dir.to_string_lossy().to_string(),
    export_dir: state.export_dir.to_string_lossy().to_string(),
    signal_cli_path: cli.bin,
    signal_cli_version: cli.version,
    signal_cli_usable: cli.is_usable,
    signal_cli_last_error: cli.last_error,
    config_path: get_signal_config(),
    number: get_signal_number(),
    active_account: state.account_manager.get_active(),
    ollama_configured: ai.configured,
    ollama_url: ai.ollama_url,
    ollama_model: ai.ollama_model,
    ollama_reachable: ai.ollama_reachable,
    ollama_last_error: ai.ollama_last_error,
  };
  ok_t(diag)
}

fn check_ai_status() -> Value {
  ok_t(probe_ollama())
}

fn require_active_account(state: &AppState) -> Result<String, Value> {
  let id = configured_account_id().ok_or_else(|| err("SIGNALX_NUMBER not set".to_string()))?;
  if state.account_manager.get_active().as_ref() != Some(&id) {
    state.account_manager.set_active(id.clone());
    let _ = state.account_manager.get_or_create(&id);
    state.alias_manager.load_account(&id);
    state.contact_store.load_account(&id);
    state.group_store.load_account(&id);
  }
  Ok(id)
}

fn get_threads(state: &AppState) -> Value {
  let account = match require_active_account(state) {
    Ok(a) => a,
    Err(_) => return ok_t(Vec::<ThreadSummary>::new()),
  };
  let ts = state.account_manager.get_or_create(&account);
  ok_t(ts.get_threads())
}

fn get_thread_messages(state: &AppState, thread_id: String) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => return ok_t(Vec::<Message>::new()),
  };
  let ts = state.account_manager.get_or_create(&account);
  ok_t(ts.get_thread_messages(thread_id.trim()))
}

fn get_pending_replies(state: &AppState, thread_id: String) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => return ok_t(Vec::<PendingReply>::new()),
  };
  let ts = state.account_manager.get_or_create(&account);
  ok_t(ts.get_pending_replies(thread_id.trim()))
}

fn get_draft_history(state: &AppState, thread_id: String) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => return ok_t(Vec::<PendingReply>::new()),
  };
  let ts = state.account_manager.get_or_create(&account);
  ok_t(ts.get_draft_history(thread_id.trim()))
}

fn get_outbox_legacy(state: &AppState, thread_id: Option<String>) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => return ok_t(Vec::<OutboxEntry>::new()),
  };
  let ts = state.account_manager.get_or_create(&account);
  let tid = thread_id.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty());
  ok_t(ts.list_outbox(tid))
}

fn make_outbox_item_id(account_id: &str, thread_id: &str) -> String {
  format!("outbox-{}-{}-{}", sanitize_filename(account_id), sanitize_filename(thread_id), now_ms())
}

fn recipient_from_thread_id(thread_id: &str) -> (String, String) {
  let tid = thread_id.trim();
  if let Some(rest) = tid.strip_prefix("dm:") {
    return ("dm".to_string(), rest.trim().to_string());
  }
  if let Some(rest) = tid.strip_prefix("group:") {
    return ("group".to_string(), rest.trim().to_string());
  }
  ("dm".to_string(), tid.to_string())
}

fn emit_outbox_updated(account_id: &str, thread_id: Option<&str>, summary: OutboxSummary) {
  emit_event(
    "outbox://updated",
    json!({
      "account_id": account_id,
      "thread_id": thread_id,
      "summary": summary,
    }),
  );
}

fn emit_outbox_item_updated(item: &OutboxItem) {
  emit_event("outbox://item-updated", item.clone());
}

fn emit_message_new(account_id: &str, msg: &Message) {
  emit_event(
    "message://new",
    json!({
      "account_id": account_id,
      "message": msg,
      "thread_id": msg.thread_id,
    }),
  );
}

fn emit_agent_draft(account_id: &str, pending: &PendingReply) {
  emit_event(
    "agent://draft",
    json!({
      "account_id": account_id,
      "pending": pending,
    }),
  );
}

fn emit_receive_health(state: &ReceiveLoopState) {
  emit_event("receive://health", state.clone());
}

fn emit_auto_reply_audit(entry: &AutoReplyAuditEntry) {
  emit_event("auto-reply://audit", entry.clone());
}

fn get_outbox_state_summary(state: &AppState) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => return ok_t(OutboxSummary::empty()),
  };
  match state.outbox_store.summary(&account) {
    Ok(s) => ok_t(s),
    Err(e) => err(e),
  }
}

fn list_outbox(state: &AppState, thread_id: Option<String>) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => return ok_t(Vec::<OutboxItem>::new()),
  };
  let tid = thread_id.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty());
  match state.outbox_store.list(&account, tid) {
    Ok(items) => ok_t(items),
    Err(e) => err(e),
  }
}

fn queue_outgoing_message(state: &AppState, thread_id: String, recipient: String, content: String) -> Value {
  let account_id = match require_active_account(&state) {
    Ok(a) => a,
    Err(v) => return v,
  };
  let tid = thread_id.trim().to_string();
  let body = content.trim().to_string();
  if tid.is_empty() || body.is_empty() {
    return err("thread_id and content are required".to_string());
  }

  let (_kind, derived) = recipient_from_thread_id(&tid);
  let rec = if recipient.trim().is_empty() { derived } else { recipient.trim().to_string() };

  let item = OutboxItem {
    id: make_outbox_item_id(&account_id, &tid),
    account_id: account_id.clone(),
    thread_id: tid.clone(),
    recipient: rec,
    content: body,
    created_at: now_ms(),
    last_attempt_at: None,
    attempt_count: 0,
    state: "queued".to_string(),
    last_error: None,
  };

  match state.outbox_store.add_item(item.clone()) {
    Ok(saved) => {
      if let Ok(summary) = state.outbox_store.summary(&account_id) {
        emit_outbox_updated(&account_id, Some(&tid), summary);
      }
      emit_outbox_item_updated(&saved);
      ok_t(saved)
    }
    Err(e) => err(e),
  }
}

fn retry_outbox_item(state: &AppState, id: String) -> Value {
  let account_id = match require_active_account(&state) {
    Ok(a) => a,
    Err(v) => return v,
  };
  let oid = id.trim();
  if oid.is_empty() {
    return err("id required".to_string());
  }
  match state.outbox_store.find_by_id(&account_id, oid) {
    Ok(Some(mut item)) => {
      if item.state != "sent" {
        item.state = "queued".to_string();
        item.last_error = None;
        // do not reset attempt_count; keep it for backoff history
        match state.outbox_store.update_item(&account_id, item.clone()) {
          Ok(updated) => {
            if let Ok(summary) = state.outbox_store.summary(&account_id) {
              emit_outbox_updated(&account_id, Some(&updated.thread_id), summary);
            }
            emit_outbox_item_updated(&updated);
            ok_t(updated)
          }
          Err(e) => err(e),
        }
      } else {
        ok_t(item)
      }
    }
    Ok(None) => err("Outbox item not found".to_string()),
    Err(e) => err(e),
  }
}

fn delete_outbox_item(state: &AppState, id: String) -> Value {
  let account_id = match require_active_account(&state) {
    Ok(a) => a,
    Err(v) => return v,
  };
  let oid = id.trim();
  if oid.is_empty() {
    return err("id required".to_string());
  }

  // Best-effort: find thread_id before deletion (for targeted refresh)
  let thread_id = state.outbox_store.find_by_id(&account_id, oid).ok().flatten().map(|i| i.thread_id);
  match state.outbox_store.delete_item(&account_id, oid) {
    Ok(deleted) => {
      if let Ok(summary) = state.outbox_store.summary(&account_id) {
        emit_outbox_updated(&account_id, thread_id.as_deref(), summary);
      }
      ok(json!({ "deleted": deleted }))
    }
    Err(e) => err(e),
  }
}

fn mark_pending_reply_consumed(state: &AppState, thread_id: String, message_id: String) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => return err("No active account".to_string()),
  };
  let ts = state.account_manager.get_or_create(&account);
  let ok_flag = ts.consume_pending_reply(thread_id.trim(), message_id.trim());
  ok(json!({ "consumed": ok_flag }))
}

fn mark_thread_read(state: &AppState, thread_id: String) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => return ok(json!(false)),
  };
  let ts = state.account_manager.get_or_create(&account);
  ok(json!(ts.mark_thread_read(thread_id.trim())))
}

fn list_aliases(state: &AppState) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => return ok_t(HashMap::<String, String>::new()),
  };
  ok_t(state.alias_manager.list_aliases(&account))
}

fn get_alias(state: &AppState, number: String) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => return ok(json!(null)),
  };
  ok(json!(state.alias_manager.get_alias(&account, number.trim())))
}

fn set_alias(state: &AppState, number: String, alias: String) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => return err("No active account".to_string()),
  };
  let n = number.trim();
  let a = alias.trim();
  if n.is_empty() || a.is_empty() {
    return err("number and alias required".to_string());
  }
  state.alias_manager.set_alias(&account, n, a);
  ok(json!(true))
}

// --------------------
// Contact meta commands
// --------------------
fn list_contact_meta(state: &AppState) -> Value {
  let account_id = match require_active_account(&state) {
    Ok(a) => a,
    Err(v) => return v,
  };
  ok_t(state.contact_store.list(&account_id))
}

fn get_contact_meta(state: &AppState, contact_id: String) -> Value {
  let account_id = match require_active_account(&state) {
    Ok(a) => a,
    Err(v) => return v,
  };
  ok_t(state.contact_store.get(&account_id, contact_id.trim()))
}

fn set_contact_meta(state: &AppState, contact_id: String, patch: ContactMetaPatch) -> Value {
  let account_id = match require_active_account(&state) {
    Ok(a) => a,
    Err(v) => return v,
  };
  let cid = contact_id.trim();
  if cid.is_empty() {
    return err("contact_id cannot be empty".to_string());
  }
  match state.contact_store.upsert_patch(&account_id, cid, patch) {
    Ok(m) => {
      ok_t(m)
    }
    Err(e) => err(e),
  }
}

fn delete_contact_meta(state: &AppState, contact_id: String) -> Value {
  let account_id = match require_active_account(&state) {
    Ok(a) => a,
    Err(v) => return v,
  };
  let cid = contact_id.trim();
  if cid.is_empty() {
    return err("contact_id cannot be empty".to_string());
  }
  match state.contact_store.delete(&account_id, cid) {
    Ok(changed) => {
      if changed {
      }
      ok(json!(changed))
    }
    Err(e) => err(e),
  }
}

fn list_categories(state: &AppState) -> Value {
  let account_id = match require_active_account(&state) {
    Ok(a) => a,
    Err(v) => return v,
  };
  ok_t(state.contact_store.list_categories(&account_id))
}

fn set_contact_photo(state: &AppState, contact_id: String, bytes: Vec<u8>, ext: String) -> Value {
  let account_id = match require_active_account(&state) {
    Ok(a) => a,
    Err(v) => return v,
  };
  let cid = contact_id.trim();
  if cid.is_empty() {
    return err("contact_id cannot be empty".to_string());
  }
  match state
    .contact_store
    .set_photo(&state.app_data_dir, &account_id, cid, bytes, &ext)
  {
    Ok(m) => {
      ok_t(m)
    }
    Err(e) => err(e),
  }
}

fn clear_contact_photo(state: &AppState, contact_id: String) -> Value {
  let account_id = match require_active_account(&state) {
    Ok(a) => a,
    Err(v) => return v,
  };
  let cid = contact_id.trim();
  if cid.is_empty() {
    return err("contact_id cannot be empty".to_string());
  }
  match state
    .contact_store
    .clear_photo(&state.app_data_dir, &account_id, cid)
  {
    Ok(m) => {
      ok_t(m)
    }
    Err(e) => err(e),
  }
}

fn link_apple_contact_stub(state: &AppState, contact_id: String, apple_contact_id: String) -> Value {
  let cid = contact_id.trim().to_string();
  let aid = apple_contact_id.trim().to_string();
  if cid.is_empty() || aid.is_empty() {
    return err("contact_id and apple_contact_id are required".to_string());
  }
  set_contact_meta(
    state,
    cid,
    ContactMetaPatch {
      display_name: None,
      alias: None,
      categories: None,
      favorite: None,
      muted: None,
      icon: None,
      apple_contact_id: Some(Some(aid)),
      custom_fields: None,
      auto_reply_enabled: None,
    },
  )
}

fn unlink_apple_contact_stub(state: &AppState, contact_id: String) -> Value {
  let cid = contact_id.trim().to_string();
  if cid.is_empty() {
    return err("contact_id is required".to_string());
  }
  set_contact_meta(
    state,
    cid,
    ContactMetaPatch {
      display_name: None,
      alias: None,
      categories: None,
      favorite: None,
      muted: None,
      icon: None,
      apple_contact_id: Some(None),
      custom_fields: None,
      auto_reply_enabled: None,
    },
  )
}

// --------------------
// Group meta commands
// --------------------
fn list_group_meta(state: &AppState) -> Value {
  let account_id = match require_active_account(&state) {
    Ok(a) => a,
    Err(v) => return v,
  };
  ok_t(state.group_store.list(&account_id))
}

fn get_group_meta(state: &AppState, group_id: String) -> Value {
  let account_id = match require_active_account(&state) {
    Ok(a) => a,
    Err(v) => return v,
  };
  ok_t(state.group_store.get(&account_id, group_id.trim()))
}

fn set_group_meta(state: &AppState, group_id: String, patch: GroupMetaPatch) -> Value {
  let account_id = match require_active_account(&state) {
    Ok(a) => a,
    Err(v) => return v,
  };
  let gid = group_id.trim();
  if gid.is_empty() {
    return err("group_id cannot be empty".to_string());
  }
  match state.group_store.upsert_patch(&account_id, gid, patch) {
    Ok(m) => {
      ok_t(m)
    }
    Err(e) => err(e),
  }
}

fn delete_group_meta(state: &AppState, group_id: String) -> Value {
  let account_id = match require_active_account(&state) {
    Ok(a) => a,
    Err(v) => return v,
  };
  let gid = group_id.trim();
  if gid.is_empty() {
    return err("group_id cannot be empty".to_string());
  }
  match state.group_store.delete(&account_id, gid) {
    Ok(changed) => {
      if changed {
      }
      ok(json!(changed))
    }
    Err(e) => err(e),
  }
}

fn list_group_categories(state: &AppState) -> Value {
  let account_id = match require_active_account(&state) {
    Ok(a) => a,
    Err(v) => return v,
  };
  ok_t(state.group_store.list_categories(&account_id))
}

// --------------------
// Contact/Group search (meta + custom fields)
// --------------------
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
struct PeopleSearchFilters {
  #[serde(default)]
  favorites_only: bool,
  #[serde(default)]
  has_photo: bool,
  #[serde(default)]
  apple_linked: bool,
  #[serde(default)]
  category: Option<String>,
  #[serde(default)]
  include_muted: bool,
  #[serde(default)]
  field_key: Option<String>,
  #[serde(default)]
  field_value: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
struct ContactHit {
  id: String,
  display_name: String,
  secondary: String,
  matched_fields: Vec<String>,
  score: i32,
}

#[derive(Clone, Debug, Serialize)]
struct GroupHit {
  id: String,
  display_name: String,
  secondary: String,
  matched_fields: Vec<String>,
  score: i32,
}

fn lc(s: &str) -> String {
  s.to_lowercase()
}

fn contact_secondary_from_id(contact_id: &str) -> String {
  if contact_id.starts_with("dm:") {
    contact_id[3..].to_string()
  } else {
    contact_id.to_string()
  }
}

fn field_filter_match(fields: &[CustomField], fk: &Option<String>, fv: &Option<String>) -> bool {
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

fn search_match_score_and_fields(query_lc: &str, meta_fields: &[(&str, &str)], cats: &[String], searchable_custom: &[CustomField]) -> (i32, Vec<String>) {
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

fn search_contacts(state: &AppState, query: String, filters: Option<PeopleSearchFilters>) -> Value {
  let account_id = match require_active_account(&state) {
    Ok(a) => a,
    Err(v) => return v,
  };
  let f = filters.unwrap_or_default();
  let q = query.trim().to_string();
  let q_lc = lc(&q);
  let cat = f.category.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()).map(|s| s.to_string());

  let all = state.contact_store.list(&account_id);
  let mut hits: Vec<ContactHit> = vec![];

  for m in all.into_iter() {
    if f.favorites_only && !m.favorite {
      continue;
    }
    if !f.include_muted && m.muted {
      continue;
    }
    if f.has_photo && m.photo_path.is_none() {
      continue;
    }
    if f.apple_linked && m.apple_contact_id.is_none() {
      continue;
    }
    if let Some(ref c) = cat {
      if !m.categories.iter().any(|x| x == c) {
        continue;
      }
    }
    if !field_filter_match(&m.custom_fields, &f.field_key, &f.field_value) {
      continue;
    }

    let display = m
      .display_name
      .clone()
      .or_else(|| m.alias.clone())
      .unwrap_or_else(|| contact_secondary_from_id(&m.contact_id));
    let secondary = contact_secondary_from_id(&m.contact_id);

    let searchable_custom: Vec<CustomField> = m.custom_fields.iter().cloned().filter(|cf| cf.searchable).collect();
    let meta_fields: Vec<(&str, &str)> = vec![
      ("display_name", m.display_name.as_deref().unwrap_or("")),
      ("alias", m.alias.as_deref().unwrap_or("")),
      ("id", &m.contact_id),
    ];
    let (score, matched_fields) = search_match_score_and_fields(&q_lc, &meta_fields, &m.categories, &searchable_custom);
    if !q_lc.is_empty() && score == 0 {
      continue;
    }

    hits.push(ContactHit { id: m.contact_id, display_name: display, secondary, matched_fields, score });
  }

  hits.sort_by(|a, b| b.score.cmp(&a.score).then_with(|| a.display_name.to_lowercase().cmp(&b.display_name.to_lowercase())));
  ok_t(hits)
}

fn search_groups(state: &AppState, query: String, filters: Option<PeopleSearchFilters>) -> Value {
  let account_id = match require_active_account(&state) {
    Ok(a) => a,
    Err(v) => return v,
  };
  let f = filters.unwrap_or_default();
  let q = query.trim().to_string();
  let q_lc = lc(&q);
  let cat = f.category.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()).map(|s| s.to_string());

  // For secondary: best-effort member count from threads store.
  let ts = state.account_manager.get_or_create(&account_id);
  let mut member_counts: HashMap<String, usize> = HashMap::new();
  for t in ts.get_threads().into_iter() {
    member_counts.insert(t.id.clone(), t.participants.len());
  }

  let all = state.group_store.list(&account_id);
  let mut hits: Vec<GroupHit> = vec![];

  for m in all.into_iter() {
    if f.favorites_only && !m.favorite {
      continue;
    }
    if !f.include_muted && m.muted {
      continue;
    }
    if let Some(ref c) = cat {
      if !m.categories.iter().any(|x| x == c) {
        continue;
      }
    }
    if !field_filter_match(&m.custom_fields, &f.field_key, &f.field_value) {
      continue;
    }

    let display = m
      .display_name
      .clone()
      .unwrap_or_else(|| m.group_id.clone());
    let members = member_counts.get(&m.group_id).cloned().unwrap_or(0);
    let secondary = if members > 0 { members.to_string() } else { "".to_string() };

    let searchable_custom: Vec<CustomField> = m.custom_fields.iter().cloned().filter(|cf| cf.searchable).collect();
    let meta_fields: Vec<(&str, &str)> = vec![
      ("display_name", m.display_name.as_deref().unwrap_or("")),
      ("id", &m.group_id),
    ];
    let (score, matched_fields) = search_match_score_and_fields(&q_lc, &meta_fields, &m.categories, &searchable_custom);
    if !q_lc.is_empty() && score == 0 {
      continue;
    }

    hits.push(GroupHit { id: m.group_id, display_name: display, secondary, matched_fields, score });
  }

  hits.sort_by(|a, b| b.score.cmp(&a.score).then_with(|| a.display_name.to_lowercase().cmp(&b.display_name.to_lowercase())));
  ok_t(hits)
}

#[derive(Clone, Debug, Serialize)]
struct ContactPhotoData {
  bytes_base64: String,
  mime: String,
}

fn read_contact_photo(state: &AppState, contact_id: String) -> Value {
  let account_id = match require_active_account(&state) {
    Ok(a) => a,
    Err(v) => return v,
  };
  let cid = contact_id.trim();
  if cid.is_empty() {
    return err("contact_id cannot be empty".to_string());
  }
  let meta = match state.contact_store.get(&account_id, cid) {
    Some(m) => m,
    None => return ok(json!(null)),
  };
  let rel = match meta.photo_path {
    Some(p) => p,
    None => return ok(json!(null)),
  };

  let p = PathBuf::from(rel.clone());
  let full = if p.is_absolute() {
    // allow only if under app_data_dir
    if p.starts_with(&state.app_data_dir) {
      p
    } else {
      return err("photo_path must be under app_data_dir".to_string());
    }
  } else {
    state.app_data_dir.join(p)
  };

  let bytes = match std::fs::read(&full) {
    Ok(b) => b,
    Err(e) => return err(format!("failed to read photo: {}", e)),
  };
  let ext = full
    .extension()
    .and_then(|s| s.to_str())
    .unwrap_or("")
    .to_lowercase();
  let mime = match ext.as_str() {
    "png" => "image/png",
    "jpg" | "jpeg" => "image/jpeg",
    _ => "application/octet-stream",
  }
  .to_string();

  let bytes_base64 = base64::engine::general_purpose::STANDARD.encode(bytes);
  ok_t(ContactPhotoData { bytes_base64, mime })
}

fn search_messages(state: &AppState, query: String, limit: u32, thread_id: Option<String>, sender: Option<String>, after_ts: Option<i64>, before_ts: Option<i64>) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => return ok_t(Vec::<SearchResult>::new()),
  };
  let ts = state.account_manager.get_or_create(&account);

  let q = query.trim();
  if q.is_empty() {
    return ok_t(Vec::<SearchResult>::new());
  }

  let limit = limit.max(1).min(500) as usize;

  let mut all: Vec<Message> = vec![];
  if let Some(tid) = thread_id {
    all = ts.get_thread_messages(tid.trim());
  } else {
    for t in ts.get_threads() {
      let msgs = ts.get_thread_messages(&t.id);
      all.extend(msgs);
    }
  }

  let sender = sender.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty());
  ok_t(search_in_messages(&all, q, limit, sender, after_ts, before_ts))
}

fn summarize_thread(state: &AppState, thread_id: String, last_n: Option<u32>) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => return err("No active account".to_string()),
  };
  let ts = state.account_manager.get_or_create(&account);
  let thread_id = thread_id.trim().to_string();

  let n = last_n.unwrap_or(DEFAULT_AGENT_LAST_N).max(1).min(200) as usize;
  let msgs = collect_recent_messages(&ts, &thread_id, n);
  if msgs.is_empty() {
    return err("No messages in thread.".to_string());
  }
  let ctx = format_thread_context(&msgs);

  if !ai_enabled() {
    return err(ai_not_configured_msg());
  }

  let model = std::env::var("SIGNALX_OLLAMA_MODEL").unwrap();
  let messages = vec![json!({
    "role": "user",
    "content": format!("Summarize this Signal thread in 6-10 bullets. Be factual. No emojis.\n\nTHREAD:\n{}", ctx)
  })];

  let out = tokio_block_on(async move {
    tokio::task::spawn_blocking(move || call_ollama_chat(&model, messages))
      .await
      .unwrap_or_else(|_| Err("AI task join failed".to_string()))
  });
  match out {
    Ok(s) => ok(json!(s.trim().to_string())),
    Err(e) => err(e),
  }
}

fn draft_reply(
  state: &AppState,
  thread_id: String,
  intent: String,
  constraints: Option<String>,
  last_n: Option<u32>,
) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => return err("No active account".to_string()),
  };
  let ts = state.account_manager.get_or_create(&account);
  let thread_id = thread_id.trim().to_string();
  let intent = intent.trim().to_string();

  let out = tokio_block_on(async move {
    tokio::task::spawn_blocking(move || {
      draft_reply_for_thread(&ts, &thread_id, &intent, constraints.as_deref(), last_n)
    })
    .await
    .unwrap_or_else(|_| Err("AI task join failed".to_string()))
  });

  match out {
    Ok(s) => ok(json!(s)),
    Err(e) => err(e),
  }
}

fn open_path(state: &AppState, path: String) -> Value {
  use std::process::Command;

  let candidate = PathBuf::from(path.trim());
  if !path_is_under_root(&state.app_data_dir, &candidate) {
    return err("path must be under the SignalX app data directory".to_string());
  }
  let path = candidate.to_string_lossy().to_string();

  #[cfg(target_os = "macos")]
  {
    match Command::new("open").arg(&path).output() {
      Ok(output) => {
        if !output.status.success() {
          let err_msg = String::from_utf8_lossy(&output.stderr).to_string();
          return err(format!("Failed to open path: {}", err_msg));
        }
      }
      Err(e) => {
        return err(format!("Failed to open path: {}", e));
      }
    }
  }

  #[cfg(target_os = "linux")]
  {
    let _ = Command::new("xdg-open").arg(&path).output();
  }

  #[cfg(target_os = "windows")]
  {
    let _ = Command::new("explorer").arg(&path).output();
  }

  ok(json!(true))
}

fn make_outbox_id_legacy(thread_id: &str) -> String {
  format!("outbox-{}-{}", thread_id, now_ms())
}

fn enqueue_send_legacy(state: &AppState, thread_id: String, recipient: String, message: String) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => return err("No active account".to_string()),
  };
  let tid = thread_id.trim().to_string();
  let rec = recipient.trim().to_string();
  let msg = message.trim().to_string();
  if tid.is_empty() || rec.is_empty() || msg.is_empty() {
    return err("thread_id, recipient, and message are required".to_string());
  }

  let ts = state.account_manager.get_or_create(&account);
  let now = now_ms();
  let item = OutboxEntry {
    id: make_outbox_id_legacy(&tid),
    thread_id: tid.clone(),
    recipient: rec.clone(),
    content: msg,
    created_at: now,
    last_attempt_at: None,
    next_attempt_at: now,
    attempt_count: 0,
    status: OutboxStatus::Pending,
    last_error: None,
  };
  ts.enqueue_outbox(item.clone());

  let outbox_count = ts.outbox_pending_count(&tid);
  ok_t(item)
}

fn retry_outbox_item_legacy(state: &AppState, thread_id: String, outbox_id: String) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => return err("No active account".to_string()),
  };
  let tid = thread_id.trim();
  let oid = outbox_id.trim();
  if tid.is_empty() || oid.is_empty() {
    return err("thread_id and outbox_id required".to_string());
  }
  let ts = state.account_manager.get_or_create(&account);
  let items = ts.list_outbox(Some(tid));
  if let Some(mut item) = items.into_iter().find(|o| o.id == oid) {
    item.status = OutboxStatus::Pending;
    item.next_attempt_at = now_ms();
    item.last_error = None;
    ts.update_outbox_item(tid, item);
    let outbox_count = ts.outbox_pending_count(tid);
    return ok(json!({ "queued": true }));
  }
  err("Outbox item not found".to_string())
}

fn delete_outbox_item_legacy(state: &AppState, thread_id: String, outbox_id: String) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => return err("No active account".to_string()),
  };
  let tid = thread_id.trim();
  let oid = outbox_id.trim();
  if tid.is_empty() || oid.is_empty() {
    return err("thread_id and outbox_id required".to_string());
  }
  let ts = state.account_manager.get_or_create(&account);
  ts.remove_outbox_item(tid, oid);
  let outbox_count = ts.outbox_pending_count(tid);
  ok(json!({ "deleted": true }))
}

fn export_thread(state: &AppState, thread_id: String, format: String, from_ts: Option<i64>, to_ts: Option<i64>) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => return err("No active account".to_string()),
  };
  let ts = state.account_manager.get_or_create(&account);

  let thread_id = thread_id.trim();
  let format = format.trim().to_lowercase();

  if !["txt", "json"].contains(&format.as_str()) {
    return err("Format must be 'txt' or 'json'".to_string());
  }

  let mut messages = ts.get_thread_messages(thread_id);
  if let Some(from) = from_ts {
    messages.retain(|m| m.timestamp >= from);
  }
  if let Some(to) = to_ts {
    messages.retain(|m| m.timestamp <= to);
  }
  if messages.is_empty() {
    return err("Thread has no messages to export".to_string());
  }

  let sanitized_id = sanitize_filename(thread_id);
  let timestamp = now_ms();
  let ext = if format == "txt" { "txt" } else { "json" };
  let filename = format!("{}-{}.{}", sanitized_id, timestamp, ext);
  let file_path = state.export_dir.join(&filename);

  // Write file based on format
  let content = if format == "txt" {
    let mut lines = Vec::with_capacity(messages.len());
    for msg in messages.iter() {
      let time_str = fmt_time_export(msg.timestamp);
      lines.push(format!("[{}] {}: {}", time_str, msg.sender, msg.content));
    }
    lines.join("\n")
  } else {
    // JSON format
    serde_json::to_string_pretty(&messages).unwrap_or_else(|_| "[]".to_string())
  };

  // Write to file
  if let Err(e) = std::fs::write(&file_path, content) {
    return err(format!("Failed to write export file: {}", e));
  }

  ok(json!({
    "path": file_path.to_string_lossy().to_string(),
    "format": format,
    "message_count": messages.len()
  }))
}

fn fmt_time_export(ts: i64) -> String {
  use chrono::DateTime;
  let secs = ts / 1000;
  let nanos = ((ts % 1000) * 1_000_000) as u32;
  match DateTime::from_timestamp(secs, nanos) {
    Some(dt) => dt.format("%Y-%m-%d %H:%M:%S").to_string(),
    None => ts.to_string(),
  }
}

fn export_account(state: &AppState, format: String, from_ts: Option<i64>, to_ts: Option<i64>) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => return err("No active account".to_string()),
  };
  let ts = state.account_manager.get_or_create(&account);

  let format = format.trim().to_lowercase();
  if !["txt", "json"].contains(&format.as_str()) {
    return err("Format must be 'txt' or 'json'".to_string());
  }

  let threads = ts.get_threads();
  let mut all: Vec<Message> = vec![];
  for t in threads {
    let mut msgs = ts.get_thread_messages(&t.id);
    if let Some(from) = from_ts {
      msgs.retain(|m| m.timestamp >= from);
    }
    if let Some(to) = to_ts {
      msgs.retain(|m| m.timestamp <= to);
    }
    all.extend(msgs);
  }

  if all.is_empty() {
    return err("No messages to export".to_string());
  }

  let sanitized = sanitize_filename(&account);
  let timestamp = now_ms();
  let ext = if format == "txt" { "txt" } else { "json" };
  let filename = format!("account-{}-{}.{}", sanitized, timestamp, ext);
  let file_path = state.export_dir.join(&filename);

  let content = if format == "txt" {
    let mut lines = Vec::with_capacity(all.len());
    all.sort_by_key(|m| m.timestamp);
    for msg in all.iter() {
      let time_str = fmt_time_export(msg.timestamp);
      lines.push(format!("[{}] {} ({}) {}", time_str, msg.sender, msg.thread_id, msg.content));
    }
    lines.join("\n")
  } else {
    serde_json::to_string_pretty(&all).unwrap_or_else(|_| "[]".to_string())
  };

  if let Err(e) = std::fs::write(&file_path, content) {
    return err(format!("Failed to write export file: {}", e));
  }

  ok(json!({
    "path": file_path.to_string_lossy().to_string(),
    "format": format,
    "message_count": all.len()
  }))
}

// --------------------
// Background receive loop
// --------------------
fn trigger_agent_draft(state: AppState, agent: AgentModeConfig, ts: ThreadState, thread_id: String, message_id: String) {
  if !agent.enabled {
    return;
  }
  if !ai_enabled() {
    eprintln!("Agent mode enabled but AI is not configured (SIGNALX_OLLAMA_MODEL missing)");
    return;
  }

  let intent = agent.intent.clone();
  let constraints = agent.constraints.clone();
  let last_n = agent.last_n;
  let tid = thread_id.clone();
  let mid = message_id.clone();
  let intent_for_prompt = intent.clone();
  let constraints_for_prompt = constraints.clone();
  let ts_for_add = ts.clone();
  let state_for_auto = state.clone();

  tokio::spawn(async move {
    let res = tokio::task::spawn_blocking(move || {
      draft_reply_for_thread(&ts, &thread_id, &intent_for_prompt, Some(&constraints_for_prompt), Some(last_n))
    })
    .await;

    match res {
      Ok(Ok(draft)) => {
        let pending = PendingReply {
          message_id: mid.clone(),
          thread_id: tid.clone(),
          draft: draft.clone(),
          intent: intent.clone(),
          created_at: now_ms(),
        };
        ts_for_add.add_pending_reply(&tid, pending.clone());

        let account_id = state_for_auto
          .account_manager
          .get_active()
          .unwrap_or_else(|| "unknown".to_string());
        emit_agent_draft(&account_id, &pending);

        // Phase 5: enqueue to outbox only when opted-in + guardrails pass.
        match auto_reply_guardrails(&state_for_auto, &tid) {
          Ok(()) => {
            let (_kind, recipient) = recipient_from_thread_id(&tid);
            let queued = queue_outgoing_message(
              &state_for_auto,
              tid.clone(),
              recipient,
              draft.clone(),
            );
            let outcome = if queued.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
              state_for_auto.auto_reply.record_send(&tid);
              "sent"
            } else {
              "blocked"
            };
            let reason = if outcome == "blocked" {
              queued.get("error").and_then(|v| v.as_str()).map(|s| s.to_string())
            } else {
              Some("auto-enqueued to outbox".to_string())
            };
            let entry = AutoReplyAuditEntry {
              id: Uuid::new_v4().to_string(),
              account_id: account_id.clone(),
              thread_id: tid.clone(),
              message_id: mid.clone(),
              draft: draft.clone(),
              created_at: now_ms(),
              outcome: outcome.to_string(),
              reason,
            };
            state_for_auto.auto_reply.append_audit(entry.clone());
            emit_auto_reply_audit(&entry);
          }
          Err(reason) => {
            let entry = AutoReplyAuditEntry {
              id: Uuid::new_v4().to_string(),
              account_id: account_id.clone(),
              thread_id: tid.clone(),
              message_id: mid.clone(),
              draft: draft.clone(),
              created_at: now_ms(),
              outcome: "draft_only".to_string(),
              reason: Some(reason),
            };
            state_for_auto.auto_reply.append_audit(entry.clone());
            emit_auto_reply_audit(&entry);
          }
        }
      }
      Ok(Err(e)) => eprintln!("Agent draft error: {}", e),
      Err(e) => eprintln!("Agent draft join error: {}", e),
    }
  });
}

async fn receive_loop(state: AppState, agent_mode: Option<AgentModeConfig>) {
  loop {
    // cooldown window (self-heal)
    let snap = state.receive_monitor.snapshot();
    if let Some(until) = snap.cooldown_until {
      if now_ms() < until {
        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
        continue;
      }
    }

    // capture required env
    let config = match get_signal_config() {
      Some(c) => c,
      None => {
        state.receive_monitor.on_error("SIGNALX_SIGNALCLI_CONFIG not set".to_string());
        emit_receive_health(&state.receive_monitor.snapshot());
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        continue;
      }
    };
    let my_number = match get_signal_number() {
      Some(n) => n,
      None => {
        state.receive_monitor.on_error("SIGNALX_NUMBER not set".to_string());
        emit_receive_health(&state.receive_monitor.snapshot());
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        continue;
      }
    };

    // ensure configured account is loaded (storage key is sanitized)
    let Some(account_id) = configured_account_id() else {
      state.receive_monitor.on_error("SIGNALX_NUMBER not set".to_string());
      emit_receive_health(&state.receive_monitor.snapshot());
      tokio::time::sleep(std::time::Duration::from_millis(500)).await;
      continue;
    };
    if state.account_manager.get_active().as_ref() != Some(&account_id) {
      state.account_manager.set_active(account_id.clone());
      state.alias_manager.load_account(&account_id);
      state.contact_store.load_account(&account_id);
      state.group_store.load_account(&account_id);
    }

    let cfg = config.clone();
    let num = my_number.clone();

    let received: Result<Vec<Value>, String> = tokio::task::spawn_blocking(move || {
      let out = build_signal_command(&cfg, Some(&num))
        .arg("receive")
        .arg("--timeout")
        .arg(RECEIVE_TIMEOUT_SECS)
        .arg("--max-messages")
        .arg(RECEIVE_MAX_MESSAGES)
        .output()
        .map_err(|e| format!("failed to run signal-cli receive: {}", e))?;

      if !out.status.success() {
        let e = String::from_utf8_lossy(&out.stderr).to_string();
        return Err(format!("signal-cli receive error: {}", e));
      }

      let stdout = String::from_utf8_lossy(&out.stdout);
      // signal-cli outputs JSON per line when -o json is set; parse each non-empty line
      let lines: Vec<&str> = stdout.lines().map(|l| l.trim()).filter(|l| !l.is_empty()).collect();
      let mut msgs: Vec<Value> = vec![];
      for line in lines {
        if let Ok(v) = serde_json::from_str::<Value>(line) {
          msgs.push(v);
        }
      }
      Ok(msgs)
    })
    .await
    .map_err(|e| format!("receive join error: {}", e))
    .and_then(|x| x);

    match received {
      Ok(list) => {
        state.receive_monitor.on_success();
        emit_receive_health(&state.receive_monitor.snapshot());

        if !list.is_empty() {
          let account = account_id.clone();
          let ts = state.account_manager.get_or_create(&account);

          for v in list.iter() {
            if let Some((msg, participants)) = normalize_incoming_message(&my_number, v) {
              let thread_id = msg.thread_id.clone();
              let msg_id = msg.id.clone();
              ts.add_message(msg.clone(), participants);
              emit_message_new(&account, &msg);
              let ivr_handled = maybe_handle_ivr(&state, &thread_id, &msg.content);
              if !ivr_handled {
                if let Some(agent_cfg) = agent_mode.clone() {
                  trigger_agent_draft(state.clone(), agent_cfg, ts.clone(), thread_id, msg_id);
                }
              }
            }
          }
        }
      }
      Err(e) => {
        state.receive_monitor.on_error(e);
        emit_receive_health(&state.receive_monitor.snapshot());
      }
    }

    // backoff
    let snap2 = state.receive_monitor.snapshot();
    if snap2.backoff_ms > 0 {
      tokio::time::sleep(std::time::Duration::from_millis(snap2.backoff_ms)).await;
    } else {
      tokio::time::sleep(std::time::Duration::from_millis(150)).await;
    }
  }
}

fn start_receive_loop(state: AppState, agent_mode: Option<AgentModeConfig>) {
  tokio::spawn(receive_loop(state, agent_mode));
}

fn outbox_send_lock_for(state: &AppState, account_id: &str) -> Arc<AsyncMutex<()>> {
  let mut m = state.outbox_send_locks.lock().unwrap();
  m.entry(account_id.to_string())
    .or_insert_with(|| Arc::new(AsyncMutex::new(())))
    .clone()
}

fn ensure_outbox_worker(state: AppState, account_id: String) {
  let mut set = state.outbox_workers.lock().unwrap();
  if set.contains(&account_id) {
    return;
  }
  set.insert(account_id.clone());
  drop(set);

  tokio::spawn(async move {
    loop {
      // Claim an eligible item first (this persists "sending" state).
      let claimed = match state.outbox_store.claim_next_for_send_async(&account_id).await {
        Ok(x) => x,
        Err(_) => {
          tokio::time::sleep(std::time::Duration::from_millis(400)).await;
          continue;
        }
      };

      let Some(mut item) = claimed else {
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
        continue;
      };

      let config = match get_signal_config() {
        Some(c) => c,
        None => {
          item.state = "failed".to_string();
          item.last_error = Some("SIGNALX_SIGNALCLI_CONFIG not set".to_string());
          let _ = state.outbox_store.update_item_async(&account_id, item.clone()).await;
          if let Ok(summary) = state.outbox_store.summary_async(&account_id).await {
            emit_outbox_updated(&account_id, Some(&item.thread_id), summary);
          }
          emit_outbox_item_updated(&item);
          tokio::time::sleep(std::time::Duration::from_millis(600)).await;
          continue;
        }
      };
      let my_number = match get_signal_number() {
        Some(n) => n,
        None => {
          item.state = "failed".to_string();
          item.last_error = Some("SIGNALX_NUMBER not set".to_string());
          let _ = state.outbox_store.update_item_async(&account_id, item.clone()).await;
          if let Ok(summary) = state.outbox_store.summary_async(&account_id).await {
            emit_outbox_updated(&account_id, Some(&item.thread_id), summary);
          }
          emit_outbox_item_updated(&item);
          tokio::time::sleep(std::time::Duration::from_millis(600)).await;
          continue;
        }
      };

      // Only one send at a time per account.
      let send_lock = outbox_send_lock_for(&state, &account_id);
      let _send_guard = send_lock.lock().await;

      let (kind, raw_recipient) = recipient_from_thread_id(&item.thread_id);
      let cfg2 = config.clone();
      let num2 = my_number.clone();
      let body2 = item.content.clone();
      let raw2 = raw_recipient.clone();
      let kind2 = kind.clone();

      let send_res: Result<(), String> = match tokio::task::spawn_blocking(move || {
        let mut cmd = build_signal_command(&cfg2, Some(&num2));
        cmd.arg("send");
        if kind2 == "group" {
          cmd.arg("-g").arg(&raw2).arg("-m").arg(&body2);
        } else {
          cmd.arg("-m").arg(&body2).arg(&raw2);
        }
        let out = cmd
          .output()
          .map_err(|e| format!("failed to run signal-cli: {}", e))?;
        if !out.status.success() {
          let e = String::from_utf8_lossy(&out.stderr).to_string();
          return Err(format!("Failed to send message: {}", e));
        }
        Ok(())
      })
      .await
      {
        Ok(inner) => inner,
        Err(e) => Err(format!("send join error: {}", e)),
      };

      match send_res {
        Ok(_) => {
          item.state = "sent".to_string();
          item.last_error = None;
          let _ = state.outbox_store.update_item_async(&account_id, item.clone()).await;
          if let Ok(summary) = state.outbox_store.summary_async(&account_id).await {
            emit_outbox_updated(&account_id, Some(&item.thread_id), summary);
          }
          emit_outbox_item_updated(&item);

          // Persist + emit normalized message (canonical flow).
          let ts = state.account_manager.get_or_create(&account_id);
          let (msg, participants) = normalize_outgoing_message(&my_number, &item.thread_id, &raw_recipient, &item.content);
          let ts2 = ts.clone();
          let msg2 = msg.clone();
          let participants2 = participants.clone();
          let _ = tokio::task::spawn_blocking(move || {
            ts2.add_message(msg2, participants2);
          })
          .await;
          emit_message_new(&account_id, &msg);
        }
        Err(e) => {
          item.state = "failed".to_string();
          item.last_error = Some(e);
          let _ = state.outbox_store.update_item_async(&account_id, item.clone()).await;
          if let Ok(summary) = state.outbox_store.summary_async(&account_id).await {
            emit_outbox_updated(&account_id, Some(&item.thread_id), summary);
          }
          emit_outbox_item_updated(&item);
          tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        }
      }
    }
  });
}

fn run_headless(state: AppState) {
  eprintln!("SignalX headless daemon starting");

  let cli = state.signal_cli_info.lock().unwrap().clone();
  if !cli.is_usable {
    eprintln!(
      "WARNING: signal-cli not usable at {}: {:?}",
      cli.bin, cli.last_error
    );
  } else if let Some(v) = &cli.version {
    eprintln!("signal-cli {} at {}", v, cli.bin);
  }

  bootstrap_accounts(&state);

  if configured_account_id().is_none() || get_signal_config().is_none() {
    eprintln!("SignalX: not configured — headless receive/outbox will not start");
    return;
  }

  let agent_mode = if should_run_agent_mode() {
    eprintln!("Agent mode enabled — incoming messages will generate AI drafts");
    Some(AgentModeConfig::enabled_default())
  } else {
    None
  };

  let rt = tokio::runtime::Runtime::new().expect("failed to start Tokio runtime");
  rt.block_on(async {
    tokio::spawn(receive_loop(state.clone(), agent_mode));

    if let Some(a) = configured_account_id() {
      ensure_outbox_worker(state.clone(), a);
    }

    use tokio::signal::unix::{signal, SignalKind};
    let mut sigint = signal(SignalKind::interrupt()).expect("SIGINT handler");
    let mut sigterm = signal(SignalKind::terminate()).expect("SIGTERM handler");
    tokio::select! {
      _ = sigint.recv() => eprintln!("[SignalX] SIGINT received, shutting down"),
      _ = sigterm.recv() => eprintln!("[SignalX] SIGTERM received, shutting down"),
    }
  });
}

fn should_run_agent_mode() -> bool {
  if let Ok(val) = std::env::var("SIGNALX_AGENT") {
    if val == "1" || val.eq_ignore_ascii_case("true") {
      return true;
    }
  }
  std::env::args().any(|a| a == "--agent" || a.ends_with("signalx-agent"))
}

fn should_run_headless() -> bool {
  if let Ok(val) = std::env::var("SIGNALX_HEADLESS") {
    if val == "1" || val.eq_ignore_ascii_case("true") {
      return true;
    }
  }
  std::env::args().any(|a| a == "--headless")
}

fn get_auto_reply_settings(state: &AppState) -> Value {
  ok_t(state.auto_reply.get_settings())
}

fn set_auto_reply_settings(state: &AppState, settings: AutoReplySettings) -> Value {
  match state.auto_reply.set_settings(settings) {
    Ok(s) => {
      emit_event("auto-reply://settings", s.clone());
      ok_t(s)
    }
    Err(e) => err(e),
  }
}

fn list_auto_reply_audit(state: &AppState, limit: Option<u32>) -> Value {
  let n = limit.unwrap_or(100).min(500) as usize;
  ok_t(state.auto_reply.list_audit(n))
}

fn set_thread_auto_reply(state: &AppState, thread_id: String, enabled: bool) -> Value {
  let account = match require_active_account(state) {
    Ok(a) => a,
    Err(v) => return v,
  };
  let tid = thread_id.trim().to_string();
  if tid.is_empty() {
    return err("thread_id required".to_string());
  }

  // Keep allowlist in sync with opt-in
  let mut settings = state.auto_reply.get_settings();
  if enabled {
    if !settings.allowlist.iter().any(|t| t == &tid) {
      settings.allowlist.push(tid.clone());
      let _ = state.auto_reply.set_settings(settings);
    }
  } else {
    settings.allowlist.retain(|t| t != &tid);
    let _ = state.auto_reply.set_settings(settings);
  }

  if tid.starts_with("group:") {
    match state.group_store.upsert_patch(
      &account,
      &tid,
      GroupMetaPatch {
        display_name: None,
        categories: None,
        favorite: None,
        muted: None,
        icon: None,
        custom_fields: None,
        member_notes: None,
        auto_reply_enabled: Some(enabled),
      },
    ) {
      Ok(g) => ok_t(g),
      Err(e) => err(e),
    }
  } else {
    match state.contact_store.upsert_patch(
      &account,
      &tid,
      ContactMetaPatch {
        display_name: None,
        alias: None,
        categories: None,
        favorite: None,
        muted: None,
        icon: None,
        apple_contact_id: None,
        custom_fields: None,
        auto_reply_enabled: Some(enabled),
      },
    ) {
      Ok(c) => ok_t(c),
      Err(e) => err(e),
    }
  }
}

fn get_thread_auto_reply(state: &AppState, thread_id: String) -> Value {
  let tid = thread_id.trim().to_string();
  let opted = thread_auto_reply_opted_in(state, &tid);
  let settings = state.auto_reply.get_settings();
  let on_allowlist = settings.allowlist.iter().any(|t| t == &tid);
  ok(json!({
    "thread_id": tid,
    "opted_in": opted,
    "on_allowlist": on_allowlist,
    "global_enabled": settings.enabled,
    "effective": settings.enabled && opted && on_allowlist,
  }))
}

fn build_app_state() -> AppState {
  let env_path = load_env().ok().flatten();

  let app_data_dir = dirs_next::data_dir()
    .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
    .join("SignalX");

  let threads_dir = app_data_dir.join("threads");
  let aliases_dir = app_data_dir.join("aliases");
  let search_dir = app_data_dir.join("search");
  let export_dir = app_data_dir.join("exports");
  let outbox_dir = app_data_dir.join("outbox");
  let contacts_dir = app_data_dir.join("contacts");
  let groups_dir = app_data_dir.join("groups");

  let _ = std::fs::create_dir_all(&threads_dir);
  let _ = std::fs::create_dir_all(&aliases_dir);
  let _ = std::fs::create_dir_all(&search_dir);
  let _ = std::fs::create_dir_all(&export_dir);
  let _ = std::fs::create_dir_all(&outbox_dir);
  let _ = std::fs::create_dir_all(&contacts_dir);
  let _ = std::fs::create_dir_all(&groups_dir);

  let cli_path = get_signal_cli_path();
  let cli_info = probe_signal_cli(&cli_path);

  AppState {
    env_path: env_path.clone(),
    app_data_dir: app_data_dir.clone(),
    threads_dir: threads_dir.clone(),
    aliases_dir: aliases_dir.clone(),
    search_dir: search_dir.clone(),
    export_dir: export_dir.clone(),
    outbox_dir: outbox_dir.clone(),
    account_manager: AccountManager::new(threads_dir.clone()),
    alias_manager: AliasManager::new(aliases_dir.clone()),
    contact_store: ContactStore::new(contacts_dir.clone()),
    group_store: GroupStore::new(groups_dir.clone()),
    receive_monitor: ReceiveLoopMonitor::new(),
    signal_cli_info: Arc::new(Mutex::new(cli_info)),
    outbox_store: OutboxStore::new(outbox_dir.clone()),
    outbox_send_locks: Arc::new(Mutex::new(HashMap::new())),
    outbox_workers: Arc::new(Mutex::new(HashSet::new())),
    auto_reply: AutoReplyStore::new(&app_data_dir),
    ivr: IvrStore::new(&app_data_dir),
    commerce: CommerceStore::new(&app_data_dir),
    orders: OrderStore::new(&app_data_dir),
    device_link: DeviceLinkManager::new(),
  }
}

fn bootstrap_accounts(state: &AppState) {
  let Some(id) = configured_account_id() else {
    eprintln!("SignalX: SIGNALX_NUMBER not set — receive/outbox will not start");
    return;
  };
  state.account_manager.set_active(id.clone());
  state.account_manager.get_or_create(&id);
  state.alias_manager.load_account(&id);
  state.contact_store.load_account(&id);
  state.group_store.load_account(&id);
}

/// Returns true when IVR claimed this inbound (skip AI auto-send path).
fn maybe_handle_ivr(state: &AppState, thread_id: &str, content: &str) -> bool {
  if thread_id.starts_with("group:") {
    return false;
  }
  let Some(account) = configured_account_id() else {
    return false;
  };
  let settings = state.ivr.get_settings();
  let now = now_ms();
  let session = state.ivr.get_or_fresh_session(&account, thread_id, now);

  if session.handed_off {
    return true;
  }
  if !thread_allowed(&settings, thread_id) {
    return false;
  }

  let menus = state.ivr.menus();
  let result = ivr::step(session, content, &menus, now);
  let _ = state.ivr.save_session(&account, result.session.clone());
  emit_event(
    "ivr://session",
    json!({
      "thread_id": thread_id,
      "node_id": result.session.node_id,
      "handed_off": result.session.handed_off,
      "slots": result.session.slots,
    }),
  );

  let mut reply = result.reply;
  if result.action.as_deref() == Some("list_catalog") {
    let list = format_catalog_list(&state.commerce.list_products(), 15);
    let follow = menus
      .nodes
      .get(&result.session.node_id)
      .map(|n| n.prompt.as_str())
      .unwrap_or("");
    reply = Some(if follow.is_empty() {
      list
    } else {
      format!("{}\n\n{}", list, follow)
    });
  } else if result.action.as_deref() == Some("place_order") {
    reply = Some(ivr_place_order(state, thread_id, &result.session));
    // Clear order slots after attempt
    let mut cleared = result.session.clone();
    cleared.slots.remove("order_idx");
    cleared.slots.remove("order_qty");
    let _ = state.ivr.save_session(&account, cleared);
  }

  if let Some(reply) = reply {
    let (_kind, recipient) = recipient_from_thread_id(thread_id);
    let _ = queue_outgoing_message(state, thread_id.to_string(), recipient, reply);
  }
  result.handled
}

fn ivr_place_order(state: &AppState, thread_id: &str, session: &ivr::IvrSession) -> String {
  let products = state.commerce.list_products();
  if products.is_empty() {
    return "No products available right now. Reply 0 for the main menu.".to_string();
  }
  let idx: usize = match session
    .slots
    .get("order_idx")
    .and_then(|s| s.parse::<usize>().ok())
  {
    Some(i) if i >= 1 && i <= products.len() => i - 1,
    _ => {
      return format!(
        "That product number isn’t on the list. Reply 2 to try again.\n\n{}",
        format_catalog_list(&products, 15)
      );
    }
  };
  let qty: i64 = match session.slots.get("order_qty").and_then(|s| s.parse::<i64>().ok()) {
    Some(q) if q > 0 => q,
    _ => return "Quantity must be a positive number. Reply 2 to try again.".to_string(),
  };
  let product = &products[idx];
  let customer = match state.commerce.customer_by_thread(thread_id) {
    Some(c) => c,
    None => {
      match state.commerce.upsert_customer(
        Customer {
          id: String::new(),
          thread_id: thread_id.to_string(),
          display_name: thread_id.trim_start_matches("dm:").to_string(),
          notes: String::new(),
          updated_at: 0,
        },
        now_ms(),
      ) {
        Ok(c) => c,
        Err(e) => return format!("Couldn’t save customer: {}. Reply 3 to talk to a person.", e),
      }
    }
  };
  match state.orders.create(
    &state.commerce,
    customer.id,
    thread_id.to_string(),
    vec![OrderLineInput {
      product_id: product.id.clone(),
      quantity: qty,
    }],
    now_ms(),
  ) {
    Ok(order) => {
      emit_event("commerce://orders", state.orders.list());
      emit_event("commerce://products", state.commerce.list_products());
      let invoice = format_invoice(&order, "SignalX");
      let menus = state.ivr.menus();
      let main_prompt = menus
        .nodes
        .get(&menus.entry)
        .map(|n| n.prompt.clone())
        .unwrap_or_default();
      format!(
        "Order placed.\n\n{}\n\n{}",
        invoice,
        main_prompt
      )
    }
    Err(e) => format!("{}. Reply 2 to try again, or 3 to talk to a person.", e),
  }
}

fn get_ivr_settings(state: &AppState) -> Value {
  ok_t(state.ivr.get_settings())
}

fn set_ivr_settings(state: &AppState, settings: IvrSettings) -> Value {
  match state.ivr.set_settings(settings) {
    Ok(s) => {
      emit_event("ivr://settings", s.clone());
      ok_t(s)
    }
    Err(e) => err(e),
  }
}

fn get_thread_ivr(state: &AppState, thread_id: String) -> Value {
  let tid = thread_id.trim().to_string();
  if tid.is_empty() {
    return err("thread_id required".to_string());
  }
  let settings = state.ivr.get_settings();
  let on_allowlist = settings.allowlist.iter().any(|t| t == &tid);
  let account = match configured_account_id() {
    Some(a) => a,
    None => {
      return ok(json!({
        "thread_id": tid,
        "enabled": false,
        "handed_off": false,
        "node_id": null,
        "effective": false,
      }));
    }
  };
  let session = state.ivr.get_session(&account, &tid);
  let handed_off = session.as_ref().map(|s| s.handed_off).unwrap_or(false);
  let node_id = session.as_ref().map(|s| s.node_id.clone());
  let effective = thread_allowed(&settings, &tid) && !handed_off;
  ok(json!({
    "thread_id": tid,
    "enabled": on_allowlist,
    "handed_off": handed_off,
    "node_id": node_id,
    "effective": effective,
    "global_enabled": settings.enabled,
  }))
}

fn set_thread_ivr(state: &AppState, thread_id: String, enabled: bool) -> Value {
  let tid = thread_id.trim().to_string();
  if tid.is_empty() {
    return err("thread_id required".to_string());
  }
  if tid.starts_with("group:") {
    return err("IVR is not available for group threads".to_string());
  }
  let account = match require_active_account(state) {
    Ok(a) => a,
    Err(v) => return v,
  };
  let now = now_ms();
  match state.ivr.set_thread_enabled(&account, &tid, enabled, now) {
    Ok(session) => {
      if enabled {
        let menus = state.ivr.menus();
        let prompt = menus
          .nodes
          .get(&menus.entry)
          .map(|n| n.prompt.clone())
          .unwrap_or_default();
        if !prompt.is_empty() {
          let (_k, recipient) = recipient_from_thread_id(&tid);
          let _ = queue_outgoing_message(state, tid.clone(), recipient, prompt);
        }
      }
      emit_event(
        "ivr://session",
        json!({
          "thread_id": tid,
          "node_id": session.node_id,
          "handed_off": session.handed_off,
        }),
      );
      emit_event("ivr://settings", state.ivr.get_settings());
      get_thread_ivr(state, tid)
    }
    Err(e) => err(e),
  }
}

fn clear_thread_handoff(state: &AppState, thread_id: String) -> Value {
  let tid = thread_id.trim().to_string();
  if tid.is_empty() {
    return err("thread_id required".to_string());
  }
  let account = match require_active_account(state) {
    Ok(a) => a,
    Err(v) => return v,
  };
  match state.ivr.clear_handoff(&account, &tid, now_ms()) {
    Ok(session) => {
      emit_event(
        "ivr://session",
        json!({
          "thread_id": tid,
          "node_id": session.node_id,
          "handed_off": false,
        }),
      );
      get_thread_ivr(state, tid)
    }
    Err(e) => err(e),
  }
}

fn list_products(state: &AppState) -> Value {
  ok_t(state.commerce.list_products())
}

fn upsert_product(state: &AppState, product: Product) -> Value {
  match state.commerce.upsert_product(product, now_ms()) {
    Ok(p) => {
      emit_event("commerce://products", state.commerce.list_products());
      ok_t(p)
    }
    Err(e) => err(e),
  }
}

fn delete_product(state: &AppState, id: String) -> Value {
  match state.commerce.delete_product(id.trim()) {
    Ok(deleted) => {
      emit_event("commerce://products", state.commerce.list_products());
      ok(json!({ "deleted": deleted }))
    }
    Err(e) => err(e),
  }
}

fn list_customers(state: &AppState) -> Value {
  ok_t(state.commerce.list_customers())
}

fn upsert_customer(state: &AppState, customer: Customer) -> Value {
  match state.commerce.upsert_customer(customer, now_ms()) {
    Ok(c) => {
      emit_event("commerce://customers", state.commerce.list_customers());
      ok_t(c)
    }
    Err(e) => err(e),
  }
}

fn delete_customer(state: &AppState, id: String) -> Value {
  match state.commerce.delete_customer(id.trim()) {
    Ok(deleted) => {
      emit_event("commerce://customers", state.commerce.list_customers());
      ok(json!({ "deleted": deleted }))
    }
    Err(e) => err(e),
  }
}

fn ensure_customer_for_thread(state: &AppState, thread_id: String, display_name: Option<String>) -> Value {
  let tid = thread_id.trim().to_string();
  if tid.is_empty() {
    return err("thread_id required".to_string());
  }
  if let Some(existing) = state.commerce.customer_by_thread(&tid) {
    return ok_t(existing);
  }
  let name = display_name
    .unwrap_or_else(|| tid.trim_start_matches("dm:").to_string());
  upsert_customer(
    state,
    Customer {
      id: String::new(),
      thread_id: tid,
      display_name: name,
      notes: String::new(),
      updated_at: 0,
    },
  )
}

fn list_orders(state: &AppState, thread_id: Option<String>) -> Value {
  let orders = match thread_id {
    Some(tid) if !tid.trim().is_empty() => state.orders.list_for_thread(tid.trim()),
    _ => state.orders.list(),
  };
  ok_t(orders)
}

fn create_order(
  state: &AppState,
  thread_id: String,
  lines: Vec<OrderLineInput>,
) -> Value {
  let tid = thread_id.trim().to_string();
  if tid.is_empty() {
    return err("thread_id required".to_string());
  }
  if tid.starts_with("group:") {
    return err("orders require a DM thread".to_string());
  }
  let customer = match state.commerce.customer_by_thread(&tid) {
    Some(c) => c,
    None => {
      let name = tid.trim_start_matches("dm:").to_string();
      match state.commerce.upsert_customer(
        Customer {
          id: String::new(),
          thread_id: tid.clone(),
          display_name: name,
          notes: String::new(),
          updated_at: 0,
        },
        now_ms(),
      ) {
        Ok(c) => c,
        Err(e) => return err(e),
      }
    }
  };
  match state
    .orders
    .create(&state.commerce, customer.id, tid.clone(), lines, now_ms())
  {
    Ok(order) => {
      emit_event("commerce://orders", state.orders.list());
      emit_event("commerce://products", state.commerce.list_products());
      ok_t(order)
    }
    Err(e) => err(e),
  }
}

fn set_order_status(state: &AppState, id: String, status: String) -> Value {
  match state.orders.set_status(id.trim(), status.trim(), now_ms()) {
    Ok(order) => {
      emit_event("commerce://orders", state.orders.list());
      ok_t(order)
    }
    Err(e) => err(e),
  }
}

fn send_order_invoice(state: &AppState, id: String) -> Value {
  let order = match state.orders.get(id.trim()) {
    Some(o) => o,
    None => return err("order not found".to_string()),
  };
  let body = format_invoice(&order, "SignalX");
  let (_k, recipient) = recipient_from_thread_id(&order.thread_id);
  match queue_outgoing_message(state, order.thread_id.clone(), recipient, body) {
    v if v.get("success").and_then(|x| x.as_bool()).unwrap_or(false) => ok_t(order),
    v => v,
  }
}

// --------------------
// Tauri command wrappers
// --------------------
#[tauri::command]
fn cmd_get_receive_loop_state(state: State<'_, AppState>) -> Value {
  get_receive_loop_state(&state)
}
#[tauri::command]
fn cmd_get_diagnostics(state: State<'_, AppState>) -> Value {
  get_diagnostics(&state)
}
#[tauri::command]
fn cmd_check_ai_status() -> Value {
  check_ai_status()
}
#[tauri::command]
fn cmd_get_threads(state: State<'_, AppState>) -> Value {
  get_threads(&state)
}
#[tauri::command]
fn cmd_get_thread_messages(state: State<'_, AppState>, thread_id: String) -> Value {
  get_thread_messages(&state, thread_id)
}
#[tauri::command]
fn cmd_get_pending_replies(state: State<'_, AppState>, thread_id: String) -> Value {
  get_pending_replies(&state, thread_id)
}
#[tauri::command]
fn cmd_get_draft_history(state: State<'_, AppState>, thread_id: String) -> Value {
  get_draft_history(&state, thread_id)
}
#[tauri::command]
fn cmd_list_outbox(state: State<'_, AppState>, thread_id: Option<String>) -> Value {
  list_outbox(&state, thread_id)
}
#[tauri::command]
fn cmd_get_outbox_state_summary(state: State<'_, AppState>) -> Value {
  get_outbox_state_summary(&state)
}
#[tauri::command]
fn cmd_queue_outgoing_message(
  state: State<'_, AppState>,
  thread_id: String,
  recipient: String,
  content: String,
) -> Value {
  queue_outgoing_message(&state, thread_id, recipient, content)
}
#[tauri::command]
fn cmd_retry_outbox_item(state: State<'_, AppState>, id: String) -> Value {
  retry_outbox_item(&state, id)
}
#[tauri::command]
fn cmd_delete_outbox_item(state: State<'_, AppState>, id: String) -> Value {
  delete_outbox_item(&state, id)
}
#[tauri::command]
fn cmd_mark_pending_reply_consumed(
  state: State<'_, AppState>,
  thread_id: String,
  message_id: String,
) -> Value {
  mark_pending_reply_consumed(&state, thread_id, message_id)
}
#[tauri::command]
fn cmd_mark_thread_read(state: State<'_, AppState>, thread_id: String) -> Value {
  mark_thread_read(&state, thread_id)
}
#[tauri::command]
fn cmd_list_aliases(state: State<'_, AppState>) -> Value {
  list_aliases(&state)
}
#[tauri::command]
fn cmd_get_alias(state: State<'_, AppState>, number: String) -> Value {
  get_alias(&state, number)
}
#[tauri::command]
fn cmd_set_alias(state: State<'_, AppState>, number: String, alias: String) -> Value {
  set_alias(&state, number, alias)
}
#[tauri::command]
fn cmd_list_contact_meta(state: State<'_, AppState>) -> Value {
  list_contact_meta(&state)
}
#[tauri::command]
fn cmd_get_contact_meta(state: State<'_, AppState>, contact_id: String) -> Value {
  get_contact_meta(&state, contact_id)
}
#[tauri::command]
fn cmd_set_contact_meta(
  state: State<'_, AppState>,
  contact_id: String,
  patch: ContactMetaPatch,
) -> Value {
  set_contact_meta(&state, contact_id, patch)
}
#[tauri::command]
fn cmd_delete_contact_meta(state: State<'_, AppState>, contact_id: String) -> Value {
  delete_contact_meta(&state, contact_id)
}
#[tauri::command]
fn cmd_list_categories(state: State<'_, AppState>) -> Value {
  list_categories(&state)
}
#[tauri::command]
fn cmd_list_group_meta(state: State<'_, AppState>) -> Value {
  list_group_meta(&state)
}
#[tauri::command]
fn cmd_get_group_meta(state: State<'_, AppState>, group_id: String) -> Value {
  get_group_meta(&state, group_id)
}
#[tauri::command]
fn cmd_set_group_meta(
  state: State<'_, AppState>,
  group_id: String,
  patch: GroupMetaPatch,
) -> Value {
  set_group_meta(&state, group_id, patch)
}
#[tauri::command]
fn cmd_delete_group_meta(state: State<'_, AppState>, group_id: String) -> Value {
  delete_group_meta(&state, group_id)
}
#[tauri::command]
fn cmd_list_group_categories(state: State<'_, AppState>) -> Value {
  list_group_categories(&state)
}
#[tauri::command]
fn cmd_search_contacts(
  state: State<'_, AppState>,
  query: String,
  filters: Option<PeopleSearchFilters>,
) -> Value {
  search_contacts(&state, query, filters)
}
#[tauri::command]
fn cmd_search_groups(
  state: State<'_, AppState>,
  query: String,
  filters: Option<PeopleSearchFilters>,
) -> Value {
  search_groups(&state, query, filters)
}
#[tauri::command]
fn cmd_search_messages(
  state: State<'_, AppState>,
  query: String,
  limit: Option<u32>,
  thread_id: Option<String>,
  sender: Option<String>,
  after_ts: Option<i64>,
  before_ts: Option<i64>,
) -> Value {
  search_messages(
    &state,
    query,
    limit.unwrap_or(50),
    thread_id,
    sender,
    after_ts,
    before_ts,
  )
}
#[tauri::command]
fn cmd_summarize_thread(
  state: State<'_, AppState>,
  thread_id: String,
  last_n: Option<u32>,
) -> Value {
  summarize_thread(&state, thread_id, last_n)
}
#[tauri::command]
fn cmd_draft_reply(
  state: State<'_, AppState>,
  thread_id: String,
  intent: String,
  constraints: Option<String>,
  last_n: Option<u32>,
) -> Value {
  draft_reply(&state, thread_id, intent, constraints, last_n)
}
#[tauri::command]
fn cmd_open_path(state: State<'_, AppState>, path: String) -> Value {
  open_path(&state, path)
}
#[tauri::command]
fn cmd_export_thread(
  state: State<'_, AppState>,
  thread_id: String,
  format: String,
  from_ts: Option<i64>,
  to_ts: Option<i64>,
) -> Value {
  export_thread(&state, thread_id, format, from_ts, to_ts)
}
#[tauri::command]
fn cmd_export_account(
  state: State<'_, AppState>,
  format: String,
  from_ts: Option<i64>,
  to_ts: Option<i64>,
) -> Value {
  export_account(&state, format, from_ts, to_ts)
}
#[tauri::command]
fn cmd_get_auto_reply_settings(state: State<'_, AppState>) -> Value {
  get_auto_reply_settings(&state)
}
#[tauri::command]
fn cmd_set_auto_reply_settings(state: State<'_, AppState>, settings: AutoReplySettings) -> Value {
  set_auto_reply_settings(&state, settings)
}
#[tauri::command]
fn cmd_list_auto_reply_audit(state: State<'_, AppState>, limit: Option<u32>) -> Value {
  list_auto_reply_audit(&state, limit)
}
#[tauri::command]
fn cmd_set_thread_auto_reply(
  state: State<'_, AppState>,
  thread_id: String,
  enabled: bool,
) -> Value {
  set_thread_auto_reply(&state, thread_id, enabled)
}
#[tauri::command]
fn cmd_get_thread_auto_reply(state: State<'_, AppState>, thread_id: String) -> Value {
  get_thread_auto_reply(&state, thread_id)
}
#[tauri::command]
fn cmd_get_ivr_settings(state: State<'_, AppState>) -> Value {
  get_ivr_settings(&state)
}
#[tauri::command]
fn cmd_set_ivr_settings(state: State<'_, AppState>, settings: IvrSettings) -> Value {
  set_ivr_settings(&state, settings)
}
#[tauri::command]
fn cmd_get_thread_ivr(state: State<'_, AppState>, thread_id: String) -> Value {
  get_thread_ivr(&state, thread_id)
}
#[tauri::command]
fn cmd_set_thread_ivr(state: State<'_, AppState>, thread_id: String, enabled: bool) -> Value {
  set_thread_ivr(&state, thread_id, enabled)
}
#[tauri::command]
fn cmd_clear_thread_handoff(state: State<'_, AppState>, thread_id: String) -> Value {
  clear_thread_handoff(&state, thread_id)
}
#[tauri::command]
fn cmd_list_products(state: State<'_, AppState>) -> Value {
  list_products(&state)
}
#[tauri::command]
fn cmd_upsert_product(state: State<'_, AppState>, product: Product) -> Value {
  upsert_product(&state, product)
}
#[tauri::command]
fn cmd_delete_product(state: State<'_, AppState>, id: String) -> Value {
  delete_product(&state, id)
}
#[tauri::command]
fn cmd_list_customers(state: State<'_, AppState>) -> Value {
  list_customers(&state)
}
#[tauri::command]
fn cmd_upsert_customer(state: State<'_, AppState>, customer: Customer) -> Value {
  upsert_customer(&state, customer)
}
#[tauri::command]
fn cmd_delete_customer(state: State<'_, AppState>, id: String) -> Value {
  delete_customer(&state, id)
}
#[tauri::command]
fn cmd_ensure_customer_for_thread(
  state: State<'_, AppState>,
  thread_id: String,
  display_name: Option<String>,
) -> Value {
  ensure_customer_for_thread(&state, thread_id, display_name)
}
#[tauri::command]
fn cmd_list_orders(state: State<'_, AppState>, thread_id: Option<String>) -> Value {
  list_orders(&state, thread_id)
}
#[tauri::command]
fn cmd_create_order(
  state: State<'_, AppState>,
  thread_id: String,
  lines: Vec<OrderLineInput>,
) -> Value {
  create_order(&state, thread_id, lines)
}
#[tauri::command]
fn cmd_set_order_status(state: State<'_, AppState>, id: String, status: String) -> Value {
  set_order_status(&state, id, status)
}
#[tauri::command]
fn cmd_send_order_invoice(state: State<'_, AppState>, id: String) -> Value {
  send_order_invoice(&state, id)
}

fn start_device_link(state: &AppState) -> Value {
  let Some(config) = get_signal_config() else {
    return err(
      "SIGNALX_SIGNALCLI_CONFIG is not set — cannot start device link".into(),
    );
  };
  let cli = state.signal_cli_info.lock().unwrap().clone();
  if !cli.is_usable {
    return err(format!(
      "signal-cli is not usable at {}: {}",
      cli.bin,
      cli.last_error.unwrap_or_else(|| "unknown error".into())
    ));
  }
  if state.device_link.is_running() {
    return err("A device link session is already running".into());
  }

  let started = state.device_link.start(
    &cli.bin,
    &config,
    |uri| {
      emit_event("device-link://uri", json!({ "uri": uri }));
    },
    |status: DeviceLinkStatus| {
      emit_event("device-link://status", status);
    },
  );

  match started {
    Ok(()) => ok_t(json!({
      "started": true,
      "device_name": "SignalX",
      "config_path": config,
    })),
    Err(e) => err(e),
  }
}

fn cancel_device_link(state: &AppState) -> Value {
  match state.device_link.cancel() {
    Ok(()) => ok_t(json!({ "cancelled": true })),
    Err(e) => err(e),
  }
}

#[tauri::command]
fn cmd_start_device_link(state: State<'_, AppState>) -> Value {
  start_device_link(&state)
}

#[tauri::command]
fn cmd_cancel_device_link(state: State<'_, AppState>) -> Value {
  cancel_device_link(&state)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let state = build_app_state();

  if should_run_headless() {
    run_headless(state);
    return;
  }

  bootstrap_accounts(&state);

  tauri::Builder::default()
    .manage(state.clone())
    .setup(move |app| {
      set_app_handle(app.handle().clone());

      let runtime_state: AppState = (*app.state::<AppState>()).clone();
      // Agent drafts always prepared when AI is configured; auto-send is guarded separately.
      let agent_mode = Some(AgentModeConfig::enabled_default());

      if configured_account_id().is_some() && get_signal_config().is_some() {
        start_receive_loop(runtime_state.clone(), agent_mode);
        if let Some(a) = configured_account_id() {
          ensure_outbox_worker(runtime_state, a);
        }
      } else {
        eprintln!("SignalX: not configured — skipping receive/outbox workers");
      }

      eprintln!("SignalX GUI starting");
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      cmd_get_receive_loop_state,
      cmd_get_diagnostics,
      cmd_check_ai_status,
      cmd_get_threads,
      cmd_get_thread_messages,
      cmd_get_pending_replies,
      cmd_get_draft_history,
      cmd_list_outbox,
      cmd_get_outbox_state_summary,
      cmd_queue_outgoing_message,
      cmd_retry_outbox_item,
      cmd_delete_outbox_item,
      cmd_mark_pending_reply_consumed,
      cmd_mark_thread_read,
      cmd_list_aliases,
      cmd_get_alias,
      cmd_set_alias,
      cmd_list_contact_meta,
      cmd_get_contact_meta,
      cmd_set_contact_meta,
      cmd_delete_contact_meta,
      cmd_list_categories,
      cmd_list_group_meta,
      cmd_get_group_meta,
      cmd_set_group_meta,
      cmd_delete_group_meta,
      cmd_list_group_categories,
      cmd_search_contacts,
      cmd_search_groups,
      cmd_search_messages,
      cmd_summarize_thread,
      cmd_draft_reply,
      cmd_open_path,
      cmd_export_thread,
      cmd_export_account,
      cmd_get_auto_reply_settings,
      cmd_set_auto_reply_settings,
      cmd_list_auto_reply_audit,
      cmd_set_thread_auto_reply,
      cmd_get_thread_auto_reply,
      cmd_get_ivr_settings,
      cmd_set_ivr_settings,
      cmd_get_thread_ivr,
      cmd_set_thread_ivr,
      cmd_clear_thread_handoff,
      cmd_list_products,
      cmd_upsert_product,
      cmd_delete_product,
      cmd_list_customers,
      cmd_upsert_customer,
      cmd_delete_customer,
      cmd_ensure_customer_for_thread,
      cmd_list_orders,
      cmd_create_order,
      cmd_set_order_status,
      cmd_send_order_invoice,
      cmd_start_device_link,
      cmd_cancel_device_link,
    ])
    .run(tauri::generate_context!())
    .expect("error while running SignalX");
}

#[cfg(test)]
mod foundation_tests {
  use super::*;
  use std::path::PathBuf;

  #[test]
  fn sanitize_replaces_phone_plus_and_path_sep() {
    assert_eq!(sanitize_filename("+12025551212"), "_12025551212");
    assert_eq!(sanitize_filename("../etc/passwd"), "___etc_passwd");
    assert!(!sanitize_filename("a/../../b").contains('/'));
    assert!(!sanitize_filename("a/../../b").contains('.'));
  }

  #[test]
  fn canonical_account_id_trims_and_sanitizes() {
    assert_eq!(
      canonical_account_id_from_number("  +12025551212\n"),
      "_12025551212"
    );
  }

  #[test]
  fn outbox_path_stays_under_dir() {
    let dir = PathBuf::from("/tmp/signalx-outbox-test");
    let p = outbox_path_for(&dir, "../../etc/passwd");
    assert_eq!(p, dir.join("______etc_passwd.json"));
    assert!(p.starts_with(&dir));
  }

  #[test]
  fn path_under_root_rejects_escape() {
    let tmp = std::env::temp_dir().join(format!("signalx-root-{}", std::process::id()));
    let _ = std::fs::create_dir_all(&tmp);
    let inside = tmp.join("exports").join("a.json");
    let _ = std::fs::create_dir_all(inside.parent().unwrap());
    std::fs::write(&inside, b"x").unwrap();
    assert!(path_is_under_root(&tmp, &inside));
    let outside = std::env::temp_dir().join("signalx-outside-escape");
    std::fs::write(&outside, b"y").unwrap();
    assert!(!path_is_under_root(&tmp, &outside));
    let _ = std::fs::remove_dir_all(&tmp);
    let _ = std::fs::remove_file(&outside);
  }
}
