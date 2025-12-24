#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod storage;
mod auth;
mod rules;
mod features;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};
use base64::Engine;
use uuid::Uuid;

use tauri::{Emitter, Manager};
use tokio::sync::Mutex as AsyncMutex;

const RECEIVE_TIMEOUT_SECS: &str = "2";
const RECEIVE_MAX_MESSAGES: &str = "50";

const MAX_BACKOFF_MS: u64 = 5000;
const COOLDOWN_MS_AFTER_SELF_HEAL: u64 = 30_000;
const SELF_HEAL_FAILURE_THRESHOLD: u32 = 10;
const DEFAULT_AGENT_INTENT: &str = "prepare but do not send";
const DEFAULT_AGENT_CONSTRAINTS: &str = "concise, actionable, do not auto-send";
const DEFAULT_AGENT_LAST_N: u32 = 50;

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
  std::env::var("SIGNALX_NUMBER").ok()
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
    // Hard constraint: {app_data_dir}/outbox/{account_id}.json
    self.dir.join(format!("{}.json", account_id))
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
    tauri::async_runtime::block_on(self.ensure_loaded_async(account_id))
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
    tauri::async_runtime::block_on(self.save_account_atomic_async(account_id))
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

fn ai_enabled() -> bool {
  std::env::var("SIGNALX_OLLAMA_MODEL").ok().map(|s| !s.trim().is_empty()).unwrap_or(false)
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
    let mut map = self.states.lock().unwrap();
    if let Some(ts) = map.get(account_id) {
      return ts.clone();
    }
    let ts = ThreadState::new(account_id.to_string(), self.storage_path_for(account_id));
    ts.load();
    map.insert(account_id.to_string(), ts.clone());
    ts
  }

  fn list_accounts(&self) -> Vec<String> {
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

  fn get_active(&self) -> Option<String> {
    self.active_account.lock().unwrap().clone()
  }

  fn set_active(&self, account_id: String) {
    *self.active_account.lock().unwrap() = Some(account_id);
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
}

// --------------------
// Tauri shared state
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
  storage: Option<Arc<storage::Storage>>,
  auth_manager: Option<Arc<auth::AuthManager>>,
  rules_engine: Option<Arc<rules::RulesEngine>>,
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

fn compute_backoff_ms(attempt: u32) -> i64 {
  let base = 1000i64;
  let cap = 30_000i64;
  let exp = 2i64.saturating_pow(attempt.min(10));
  let jitter = (now_ms() % 300) as i64;
  (base * exp).min(cap) + jitter
}

// --------------------
// Tauri commands
// --------------------
#[tauri::command]
fn get_receive_loop_state(state: tauri::State<AppState>) -> Value {
  ok_t(state.receive_monitor.snapshot())
}

#[tauri::command]
fn get_diagnostics(state: tauri::State<AppState>) -> Value {
  let cli = state.signal_cli_info.lock().unwrap().clone();
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
  };
  ok_t(diag)
}

#[tauri::command]
fn list_accounts(state: tauri::State<AppState>) -> Value {
  ok_t(state.account_manager.list_accounts())
}

#[tauri::command]
fn get_active_account(state: tauri::State<AppState>) -> Value {
  ok(json!({ "account_id": state.account_manager.get_active() }))
}

fn require_active_account(state: &AppState) -> Result<String, Value> {
  state
    .account_manager
    .get_active()
    .ok_or_else(|| err("no active account".to_string()))
}

#[tauri::command]
fn set_active_account(app: tauri::AppHandle, state: tauri::State<AppState>, account_id: String) -> Value {
  let account_id = account_id.trim().to_string();
  if account_id.is_empty() {
    return err("account_id cannot be empty".to_string());
  }

  // ensure exists/loaded
  let _ts = state.account_manager.get_or_create(&account_id);
  state.alias_manager.load_account(&account_id);
  state.contact_store.load_account(&account_id);
  state.group_store.load_account(&account_id);

  state.account_manager.set_active(account_id.clone());
  let _ = app.emit("account-changed", json!({ "account_id": account_id.clone() }));
  ensure_outbox_worker(app.clone(), state.inner().clone(), account_id.clone());
  ok(json!(true))
}

#[tauri::command]
fn get_threads(state: tauri::State<AppState>) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => {
      // fallback to SIGNALX_NUMBER if possible
      if let Some(n) = get_signal_number() {
        state.account_manager.set_active(n.clone());
        state.alias_manager.load_account(&n);
        n
      } else {
        return ok_t(Vec::<ThreadSummary>::new());
      }
    }
  };
  let ts = state.account_manager.get_or_create(&account);
  ok_t(ts.get_threads())
}

#[tauri::command]
fn get_thread_messages(state: tauri::State<AppState>, thread_id: String) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => return ok_t(Vec::<Message>::new()),
  };
  let ts = state.account_manager.get_or_create(&account);
  ok_t(ts.get_thread_messages(thread_id.trim()))
}

#[tauri::command]
fn get_pending_replies(state: tauri::State<AppState>, thread_id: String) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => return ok_t(Vec::<PendingReply>::new()),
  };
  let ts = state.account_manager.get_or_create(&account);
  ok_t(ts.get_pending_replies(thread_id.trim()))
}

#[tauri::command]
fn get_draft_history(state: tauri::State<AppState>, thread_id: String) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => return ok_t(Vec::<PendingReply>::new()),
  };
  let ts = state.account_manager.get_or_create(&account);
  ok_t(ts.get_draft_history(thread_id.trim()))
}

#[tauri::command]
fn get_outbox_legacy(state: tauri::State<AppState>, thread_id: Option<String>) -> Value {
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

fn emit_outbox_updated(app: &tauri::AppHandle, account_id: &str, thread_id: Option<&str>, summary: OutboxSummary) {
  let payload = match thread_id {
    Some(tid) => json!({ "account_id": account_id, "thread_id": tid, "summary": summary }),
    None => json!({ "account_id": account_id, "summary": summary }),
  };
  let _ = app.emit("outbox-updated", payload);
}

fn emit_outbox_item_updated(app: &tauri::AppHandle, item: &OutboxItem) {
  let _ = app.emit("outbox-item-updated", item.clone());
}

#[tauri::command]
fn get_outbox_state_summary(state: tauri::State<AppState>) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => return ok_t(OutboxSummary::empty()),
  };
  match state.outbox_store.summary(&account) {
    Ok(s) => ok_t(s),
    Err(e) => err(e),
  }
}

#[tauri::command]
fn list_outbox(state: tauri::State<AppState>, thread_id: Option<String>) -> Value {
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

#[tauri::command]
fn queue_outgoing_message(app: tauri::AppHandle, state: tauri::State<AppState>, thread_id: String, recipient: String, content: String) -> Value {
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
        emit_outbox_updated(&app, &account_id, Some(&tid), summary);
      }
      emit_outbox_item_updated(&app, &saved);
      ok_t(saved)
    }
    Err(e) => err(e),
  }
}

#[tauri::command]
fn retry_outbox_item(app: tauri::AppHandle, state: tauri::State<AppState>, id: String) -> Value {
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
              emit_outbox_updated(&app, &account_id, Some(&updated.thread_id), summary);
            }
            emit_outbox_item_updated(&app, &updated);
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

#[tauri::command]
fn delete_outbox_item(app: tauri::AppHandle, state: tauri::State<AppState>, id: String) -> Value {
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
        emit_outbox_updated(&app, &account_id, thread_id.as_deref(), summary);
      }
      ok(json!({ "deleted": deleted }))
    }
    Err(e) => err(e),
  }
}

#[tauri::command]
fn mark_pending_reply_consumed(state: tauri::State<AppState>, thread_id: String, message_id: String) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => return err("No active account".to_string()),
  };
  let ts = state.account_manager.get_or_create(&account);
  let ok_flag = ts.consume_pending_reply(thread_id.trim(), message_id.trim());
  ok(json!({ "consumed": ok_flag }))
}

#[tauri::command]
fn mark_thread_read(state: tauri::State<AppState>, thread_id: String) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => return ok(json!(false)),
  };
  let ts = state.account_manager.get_or_create(&account);
  ok(json!(ts.mark_thread_read(thread_id.trim())))
}

#[tauri::command]
fn list_aliases(state: tauri::State<AppState>) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => return ok_t(HashMap::<String, String>::new()),
  };
  ok_t(state.alias_manager.list_aliases(&account))
}

#[tauri::command]
fn get_alias(state: tauri::State<AppState>, number: String) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => return ok(json!(null)),
  };
  ok(json!(state.alias_manager.get_alias(&account, number.trim())))
}

#[tauri::command]
fn set_alias(state: tauri::State<AppState>, number: String, alias: String) -> Value {
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
#[tauri::command]
fn list_contact_meta(state: tauri::State<AppState>) -> Value {
  let account_id = match require_active_account(&state) {
    Ok(a) => a,
    Err(v) => return v,
  };
  ok_t(state.contact_store.list(&account_id))
}

#[tauri::command]
fn get_contact_meta(state: tauri::State<AppState>, contact_id: String) -> Value {
  let account_id = match require_active_account(&state) {
    Ok(a) => a,
    Err(v) => return v,
  };
  ok_t(state.contact_store.get(&account_id, contact_id.trim()))
}

#[tauri::command]
fn set_contact_meta(app: tauri::AppHandle, state: tauri::State<AppState>, contact_id: String, patch: ContactMetaPatch) -> Value {
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
      let _ = app.emit(
        "contact-meta-updated",
        json!({
          "contact_id": m.contact_id,
          "updated_at": m.updated_at,
          "summary": {
            "display_name": m.display_name,
            "alias": m.alias,
            "favorite": m.favorite,
            "muted": m.muted,
            "categories": m.categories,
            "custom_fields_count": m.custom_fields.len()
          }
        }),
      );
      ok_t(m)
    }
    Err(e) => err(e),
  }
}

#[tauri::command]
fn delete_contact_meta(app: tauri::AppHandle, state: tauri::State<AppState>, contact_id: String) -> Value {
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
        let _ = app.emit(
          "contact-meta-updated",
          json!({
            "contact_id": normalize_contact_id(cid),
            "deleted": true
          }),
        );
      }
      ok(json!(changed))
    }
    Err(e) => err(e),
  }
}

#[tauri::command]
fn list_categories(state: tauri::State<AppState>) -> Value {
  let account_id = match require_active_account(&state) {
    Ok(a) => a,
    Err(v) => return v,
  };
  ok_t(state.contact_store.list_categories(&account_id))
}

#[tauri::command]
fn set_contact_photo(app: tauri::AppHandle, state: tauri::State<AppState>, contact_id: String, bytes: Vec<u8>, ext: String) -> Value {
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
      let _ = app.emit(
        "contact-meta-updated",
        json!({
          "contact_id": m.contact_id,
          "updated_at": m.updated_at,
          "summary": { "photo_path": m.photo_path }
        }),
      );
      ok_t(m)
    }
    Err(e) => err(e),
  }
}

#[tauri::command]
fn clear_contact_photo(app: tauri::AppHandle, state: tauri::State<AppState>, contact_id: String) -> Value {
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
      let _ = app.emit(
        "contact-meta-updated",
        json!({
          "contact_id": m.contact_id,
          "updated_at": m.updated_at,
          "summary": { "photo_path": m.photo_path }
        }),
      );
      ok_t(m)
    }
    Err(e) => err(e),
  }
}

#[tauri::command]
fn link_apple_contact_stub(app: tauri::AppHandle, state: tauri::State<AppState>, contact_id: String, apple_contact_id: String) -> Value {
  let cid = contact_id.trim().to_string();
  let aid = apple_contact_id.trim().to_string();
  if cid.is_empty() || aid.is_empty() {
    return err("contact_id and apple_contact_id are required".to_string());
  }
  set_contact_meta(
    app,
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
    },
  )
}

#[tauri::command]
fn unlink_apple_contact_stub(app: tauri::AppHandle, state: tauri::State<AppState>, contact_id: String) -> Value {
  let cid = contact_id.trim().to_string();
  if cid.is_empty() {
    return err("contact_id is required".to_string());
  }
  set_contact_meta(
    app,
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
    },
  )
}

// --------------------
// Group meta commands
// --------------------
#[tauri::command]
fn list_group_meta(state: tauri::State<AppState>) -> Value {
  let account_id = match require_active_account(&state) {
    Ok(a) => a,
    Err(v) => return v,
  };
  ok_t(state.group_store.list(&account_id))
}

#[tauri::command]
fn get_group_meta(state: tauri::State<AppState>, group_id: String) -> Value {
  let account_id = match require_active_account(&state) {
    Ok(a) => a,
    Err(v) => return v,
  };
  ok_t(state.group_store.get(&account_id, group_id.trim()))
}

#[tauri::command]
fn set_group_meta(app: tauri::AppHandle, state: tauri::State<AppState>, group_id: String, patch: GroupMetaPatch) -> Value {
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
      let _ = app.emit(
        "group-meta-updated",
        json!({
          "group_id": m.group_id,
          "updated_at": m.updated_at,
          "summary": {
            "display_name": m.display_name,
            "favorite": m.favorite,
            "muted": m.muted,
            "categories": m.categories,
            "custom_fields_count": m.custom_fields.len()
          }
        }),
      );
      ok_t(m)
    }
    Err(e) => err(e),
  }
}

#[tauri::command]
fn delete_group_meta(app: tauri::AppHandle, state: tauri::State<AppState>, group_id: String) -> Value {
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
        let _ = app.emit(
          "group-meta-updated",
          json!({
            "group_id": normalize_group_id(gid),
            "deleted": true
          }),
        );
      }
      ok(json!(changed))
    }
    Err(e) => err(e),
  }
}

#[tauri::command]
fn list_group_categories(state: tauri::State<AppState>) -> Value {
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

#[tauri::command]
fn search_contacts(state: tauri::State<AppState>, query: String, filters: Option<PeopleSearchFilters>) -> Value {
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

#[tauri::command]
fn search_groups(state: tauri::State<AppState>, query: String, filters: Option<PeopleSearchFilters>) -> Value {
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

#[tauri::command]
fn read_contact_photo(state: tauri::State<AppState>, contact_id: String) -> Value {
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

#[tauri::command]
fn search_messages(state: tauri::State<AppState>, query: String, limit: u32, thread_id: Option<String>, sender: Option<String>, after_ts: Option<i64>, before_ts: Option<i64>) -> Value {
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

#[tauri::command]
fn summarize_thread(state: tauri::State<AppState>, thread_id: String, last_n: Option<u32>) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => return err("No active account".to_string()),
  };
  let ts = state.account_manager.get_or_create(&account);

  let n = last_n.unwrap_or(DEFAULT_AGENT_LAST_N).max(1).min(200) as usize;
  let msgs = collect_recent_messages(&ts, thread_id.trim(), n);
  let ctx = msgs.iter().map(|m| format!("[{}] {}: {}", m.timestamp, m.sender, m.content)).collect::<Vec<_>>().join("\n");

  if !ai_enabled() {
    return err("AI not configured. Set SIGNALX_OLLAMA_MODEL and ensure `ollama` is installed.".to_string());
  }

  let model = std::env::var("SIGNALX_OLLAMA_MODEL").unwrap();
  let prompt = format!(
    "Summarize this Signal thread in 6-10 bullets. Be factual. No emojis reinforces.\n\nTHREAD:\n{}",
    ctx
  );

  let out = std::thread::spawn(move || run_ollama(&model, &prompt)).join().unwrap_or_else(|_| Err("AI thread join failed".to_string()));
  match out {
    Ok(s) => ok(json!(s.trim().to_string())),
    Err(e) => err(e),
  }
}

#[tauri::command]
fn draft_reply(state: tauri::State<AppState>, thread_id: String, intent: String, constraints: Option<String>, last_n: Option<u32>) -> Value {
  let account = match state.account_manager.get_active() {
    Some(a) => a,
    None => return err("No active account".to_string()),
  };
  let ts = state.account_manager.get_or_create(&account);
  match draft_reply_for_thread(&ts, thread_id.trim(), intent.trim(), constraints.as_deref(), last_n) {
    Ok(s) => ok(json!(s)),
    Err(e) => err(e),
  }
}

#[tauri::command]
fn open_path(path: String) -> Value {
  use std::process::Command;
  
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

#[tauri::command]
fn send_message(app: tauri::AppHandle, state: tauri::State<AppState>, thread_id: String, message: String) -> Value {
  let config = match get_signal_config() {
    Some(c) => c,
    None => return err("SIGNALX_SIGNALCLI_CONFIG not set".to_string()),
  };
  let my_number = match get_signal_number() {
    Some(n) => n,
    None => return err("SIGNALX_NUMBER not set".to_string()),
  };

  let thread_id = thread_id.trim().to_string();
  let text = message.trim().to_string();
  if thread_id.is_empty() || text.is_empty() {
    return err("threadId and message required".to_string());
  }

  let (kind, raw_recipient) = recipient_from_thread_id(&thread_id);

  // send via signal-cli (spawn_blocking)
  let cfg = config.clone();
  let num = my_number.clone();
  let txt = text.clone();
  let rec = raw_recipient.clone();
  let kind2 = kind.clone();

  let res = tauri::async_runtime::block_on(async move {
    tokio::task::spawn_blocking(move || {
      let mut cmd = build_signal_command(&cfg, Some(&num));
      cmd.arg("send");
      if kind2 == "group" {
        cmd.arg("-g").arg(&rec).arg("-m").arg(&txt);
      } else {
        cmd.arg("-m").arg(&txt).arg(&rec);
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
    .map_err(|e| format!("send join error: {}", e))?
  });

  if let Err(e) = res {
    return err(e);
  }

  // store + emit normalized outgoing
  let account = state.account_manager.get_active().unwrap_or_else(|| my_number.clone());
  let ts = state.account_manager.get_or_create(&account);
  let (msg, participants) = normalize_outgoing_message(&my_number, &thread_id, &raw_recipient, &text);
  let ts2 = ts.clone();
  let msg2 = msg.clone();
  let participants2 = participants.clone();
  let _ = tauri::async_runtime::block_on(async move {
    tokio::task::spawn_blocking(move || {
      ts2.add_message(msg2, participants2);
    })
    .await
  });

  let _ = app.emit("message-sent", msg);
  ok(json!({ "status": "sent" }))
}

fn make_outbox_id_legacy(thread_id: &str) -> String {
  format!("outbox-{}-{}", thread_id, now_ms())
}

#[tauri::command]
fn enqueue_send_legacy(app: tauri::AppHandle, state: tauri::State<AppState>, thread_id: String, recipient: String, message: String) -> Value {
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
  let _ = app.emit("outbox-updated", json!({ "thread_id": tid, "outbox_count": outbox_count }));
  ok_t(item)
}

#[tauri::command]
fn retry_outbox_item_legacy(app: tauri::AppHandle, state: tauri::State<AppState>, thread_id: String, outbox_id: String) -> Value {
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
    let _ = app.emit("outbox-updated", json!({ "thread_id": tid, "outbox_count": outbox_count }));
    return ok(json!({ "queued": true }));
  }
  err("Outbox item not found".to_string())
}

#[tauri::command]
fn delete_outbox_item_legacy(app: tauri::AppHandle, state: tauri::State<AppState>, thread_id: String, outbox_id: String) -> Value {
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
  let _ = app.emit("outbox-updated", json!({ "thread_id": tid, "outbox_count": outbox_count }));
  ok(json!({ "deleted": true }))
}

#[tauri::command]
fn export_thread(state: tauri::State<AppState>, thread_id: String, format: String, from_ts: Option<i64>, to_ts: Option<i64>) -> Value {
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

fn export_account(state: tauri::State<AppState>, format: String, from_ts: Option<i64>, to_ts: Option<i64>) -> Value {
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
fn trigger_agent_draft(agent: AgentModeConfig, ts: ThreadState, thread_id: String, message_id: String) {
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

  tokio::spawn(async move {
    let res = tokio::task::spawn_blocking(move || {
      draft_reply_for_thread(&ts, &thread_id, &intent_for_prompt, Some(&constraints_for_prompt), Some(last_n))
    })
    .await;

    match res {
      Ok(Ok(draft)) => {
        let pending = PendingReply { message_id: mid, thread_id: tid.clone(), draft, intent: intent.clone(), created_at: now_ms() };
        ts_for_add.add_pending_reply(&tid, pending);
      }
      Ok(Err(e)) => eprintln!("Agent draft error: {}", e),
      Err(e) => eprintln!("Agent draft join error: {}", e),
    }
  });
}

async fn receive_loop(app: Option<tauri::AppHandle>, state: AppState, agent_mode: Option<AgentModeConfig>) {
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
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        continue;
      }
    };
    let my_number = match get_signal_number() {
      Some(n) => n,
      None => {
        state.receive_monitor.on_error("SIGNALX_NUMBER not set".to_string());
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        continue;
      }
    };

    // ensure active account fallback
    if state.account_manager.get_active().is_none() {
      state.account_manager.set_active(my_number.clone());
      state.alias_manager.load_account(&my_number);
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

        if !list.is_empty() {
          let account = state.account_manager.get_active().unwrap_or_else(|| my_number.clone());
          let ts = state.account_manager.get_or_create(&account);

          for v in list.iter() {
            if let Some((msg, participants)) = normalize_incoming_message(&my_number, v) {
              let thread_id = msg.thread_id.clone();
              let msg_id = msg.id.clone();
              ts.add_message(msg.clone(), participants);
              if let Some(app_handle) = app.as_ref() {
                let _ = app_handle.emit("message-received", msg.clone());
              }
              if let Some(agent_cfg) = agent_mode.clone() {
                trigger_agent_draft(agent_cfg, ts.clone(), thread_id, msg_id);
              }
            }
          }
        }
      }
      Err(e) => {
        state.receive_monitor.on_error(e);
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

fn start_receive_loop(app: tauri::AppHandle, state: AppState, agent_mode: Option<AgentModeConfig>) {
  tauri::async_runtime::spawn(receive_loop(Some(app), state, agent_mode));
}

fn outbox_send_lock_for(state: &AppState, account_id: &str) -> Arc<AsyncMutex<()>> {
  let mut m = state.outbox_send_locks.lock().unwrap();
  m.entry(account_id.to_string())
    .or_insert_with(|| Arc::new(AsyncMutex::new(())))
    .clone()
}

fn ensure_outbox_worker(app: tauri::AppHandle, state: AppState, account_id: String) {
  let mut set = state.outbox_workers.lock().unwrap();
  if set.contains(&account_id) {
    return;
  }
  set.insert(account_id.clone());
  drop(set);

  tauri::async_runtime::spawn(async move {
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
            emit_outbox_updated(&app, &account_id, Some(&item.thread_id), summary);
          }
          emit_outbox_item_updated(&app, &item);
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
            emit_outbox_updated(&app, &account_id, Some(&item.thread_id), summary);
          }
          emit_outbox_item_updated(&app, &item);
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
            emit_outbox_updated(&app, &account_id, Some(&item.thread_id), summary);
          }
          emit_outbox_item_updated(&app, &item);

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
          let _ = app.emit("message-sent", msg);
        }
        Err(e) => {
          item.state = "failed".to_string();
          item.last_error = Some(e);
          let _ = state.outbox_store.update_item_async(&account_id, item.clone()).await;
          if let Ok(summary) = state.outbox_store.summary_async(&account_id).await {
            emit_outbox_updated(&app, &account_id, Some(&item.thread_id), summary);
          }
          emit_outbox_item_updated(&app, &item);
          tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        }
      }
    }
  });
}

// --------------------
// Auth commands
// --------------------
#[tauri::command]
fn auth_login(state: tauri::State<AppState>, username: String, password: String) -> Value {
  if let Some(ref auth) = state.auth_manager {
    match auth.login(&username, &password) {
      Ok(session) => ok_t(session),
      Err(e) => err(e),
    }
  } else {
    err("Auth not enabled".to_string())
  }
}

#[tauri::command]
fn auth_get_session(state: tauri::State<AppState>, token: String) -> Value {
  if let Some(ref auth) = state.auth_manager {
    match auth.get_session(&token) {
      Some(session) => ok_t(session),
      None => err("Invalid or expired session".to_string()),
    }
  } else {
    err("Auth not enabled".to_string())
  }
}

#[tauri::command]
fn auth_logout(state: tauri::State<AppState>, token: String) -> Value {
  if let Some(ref auth) = state.auth_manager {
    auth.logout(&token);
    ok(json!(true))
  } else {
    err("Auth not enabled".to_string())
  }
}

// --------------------
// Rules commands
// --------------------
#[tauri::command]
fn rules_list(state: tauri::State<AppState>, accountId: String) -> Value {
  let account_id = accountId;
  if let Some(ref storage) = state.storage {
    match storage.list_rules(&account_id) {
      Ok(rules) => {
        let result: Vec<Value> = rules
          .into_iter()
          .map(|(id, name, enabled, dsl, compiled_json)| {
            json!({
              "id": id,
              "name": name,
              "enabled": enabled,
              "dsl": dsl,
              "compiled_json": compiled_json
            })
          })
          .collect();
        ok_t(result)
      }
      Err(e) => err(format!("Failed to list rules: {}", e)),
    }
  } else {
    err("Storage not available".to_string())
  }
}

#[tauri::command]
fn rules_upsert(
  state: tauri::State<AppState>,
  accountId: String,
  id: Option<String>,
  name: String,
  dsl: String,
) -> Value {
  let account_id = accountId;
  if let Some(ref storage) = state.storage {
    if let Some(ref engine) = state.rules_engine {
      let rule_id = id.unwrap_or_else(|| Uuid::new_v4().to_string());
      
      // Compile DSL
      match engine.compile_rule(&dsl) {
        Ok(compiled) => {
          let compiled_str = serde_json::to_string(&compiled)
            .map_err(|e| format!("Serialization error: {}", e))?;
          
          match storage.upsert_rule(&rule_id, &account_id, &name, false, Some(&dsl), Some(&compiled_str)) {
            Ok(_) => ok(json!({ "id": rule_id })),
            Err(e) => err(format!("Failed to save rule: {}", e)),
          }
        }
        Err(e) => err(format!("Failed to compile rule: {}", e)),
      }
    } else {
      err("Rules engine not available".to_string())
    }
  } else {
    err("Storage not available".to_string())
  }
}

#[tauri::command]
fn rules_toggle(state: tauri::State<AppState>, id: String, enabled: bool) -> Value {
  if let Some(ref storage) = state.storage {
    match storage.toggle_rule(&id, enabled) {
      Ok(_) => ok(json!(true)),
      Err(e) => err(format!("Failed to toggle rule: {}", e)),
    }
  } else {
    err("Storage not available".to_string())
  }
}

#[tauri::command]
fn rules_run_once(
  state: tauri::State<AppState>,
  accountId: String,
  threadId: String,
  messageBody: String,
  messageFrom: String,
) -> Value {
  let account_id = accountId;
  let thread_id = threadId;
  let message_body = messageBody;
  let message_from = messageFrom;
  if let Some(ref engine) = state.rules_engine {
    let send_enabled = features::is_feature_enabled("automation.send_enabled");
    match engine.run_rules_for_message(&account_id, &message_body, &message_from, &thread_id, send_enabled) {
      Ok(actions) => {
        let result: Vec<Value> = actions
          .into_iter()
          .map(|a| match a {
            rules::Action::Draft(text) => json!({ "type": "draft", "text": text }),
            rules::Action::Send(text) => json!({ "type": "send", "text": text }),
            rules::Action::LabelContact(label, value) => json!({ "type": "label_contact", "label": label, "value": value }),
          })
          .collect();
        ok_t(result)
      }
      Err(e) => err(format!("Failed to run rules: {}", e)),
    }
  } else {
    err("Rules engine not available".to_string())
  }
}

fn run_agent_mode(state: AppState) {
  eprintln!("Starting SignalX agent mode (headless) – generating drafts only");
  if !ai_enabled() {
    eprintln!("WARNING: Agent mode requested but AI is not configured; drafts will not be created.");
  }
  let rt = tokio::runtime::Runtime::new().expect("failed to start Tokio runtime for agent mode");
  rt.block_on(receive_loop(None, state, Some(AgentModeConfig::enabled_default())));
}

fn should_run_agent_mode() -> bool {
  if let Ok(val) = std::env::var("SIGNALX_AGENT") {
    if val == "1" || val.eq_ignore_ascii_case("true") {
      return true;
    }
  }
  std::env::args().any(|a| a == "--agent" || a.ends_with("signalx-agent"))
}

// --------------------
// main
// --------------------
fn main() {
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

  // Initialize storage if feature enabled
  let storage = if features::is_feature_enabled("storage.sqlite") {
    let db_path = app_data_dir.join("signalx.db");
    match storage::Storage::new(db_path) {
      Ok(s) => {
        eprintln!("SQLite storage initialized");
        Some(Arc::new(s))
      }
      Err(e) => {
        eprintln!("Failed to initialize storage: {}", e);
        None
      }
    }
  } else {
    None
  };

  // Initialize auth if feature enabled
  let auth_manager = if features::is_feature_enabled("auth.enabled") {
    if let Some(ref st) = storage {
      let am = Arc::new(auth::AuthManager::new(st.clone()));
      // Ensure admin exists on first run
      if let Err(e) = am.ensure_admin_exists() {
        eprintln!("Warning: Failed to ensure admin exists: {}", e);
      }
      Some(am)
    } else {
      eprintln!("Warning: Auth enabled but storage not available");
      None
    }
  } else {
    None
  };

  // Initialize rules engine if feature enabled
  let rules_engine = if features::is_feature_enabled("automation.rules") {
    if let Some(ref st) = storage {
      Some(Arc::new(rules::RulesEngine::new(st.clone())))
    } else {
      eprintln!("Warning: Rules enabled but storage not available");
      None
    }
  } else {
    None
  };

  let state = AppState {
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
    storage,
    auth_manager,
    rules_engine,
  };

  if should_run_agent_mode() {
    run_agent_mode(state.clone());
    return;
  }

  tauri::Builder::default()
    .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
      // A second instance was launched: focus existing window and exit the new instance.
      if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
      }
      std::process::exit(0);
    }))
    .manage(state.clone())
    .setup(move |app| {
      // refresh signal-cli probe on startup
      let cli_path = get_signal_cli_path();
      let cli_info = probe_signal_cli(&cli_path);
      {
        let mut lock = state.signal_cli_info.lock().unwrap();
        *lock = cli_info;
      }

      // warm active account
      if let Some(n) = get_signal_number() {
        state.account_manager.set_active(n.clone());
        state.account_manager.get_or_create(&n);
        state.alias_manager.load_account(&n);
        state.contact_store.load_account(&n);
        state.group_store.load_account(&n);
      }

      start_receive_loop(app.handle().clone(), state.clone(), None);
      if let Some(a) = state.account_manager.get_active() {
        ensure_outbox_worker(app.handle().clone(), state.clone(), a);
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      get_receive_loop_state,
      get_diagnostics,
      list_accounts,
      get_active_account,
      set_active_account,
      get_threads,
      get_thread_messages,
      get_pending_replies,
      get_draft_history,
      mark_pending_reply_consumed,
      get_outbox_state_summary,
      list_outbox,
      queue_outgoing_message,
      retry_outbox_item,
      delete_outbox_item,
      mark_thread_read,
      list_aliases,
      get_alias,
      set_alias,
      list_contact_meta,
      get_contact_meta,
      set_contact_meta,
      delete_contact_meta,
      set_contact_photo,
      clear_contact_photo,
      list_categories,
      link_apple_contact_stub,
      unlink_apple_contact_stub,
      list_group_meta,
      get_group_meta,
      set_group_meta,
      delete_group_meta,
      list_group_categories,
      read_contact_photo,
      search_contacts,
      search_groups,
      search_messages,
      summarize_thread,
      draft_reply,
      export_thread,
      open_path,
      send_message,
      auth_login,
      auth_get_session,
      auth_logout,
      rules_list,
      rules_upsert,
      rules_toggle,
      rules_run_once
      // Removed legacy outbox commands
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
