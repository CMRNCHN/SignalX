use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use tokio::sync::Mutex as AsyncMutex;

use crate::auth;
use crate::rules;
use crate::services::{
  AccountManager, AliasManager, ContactStore, GroupStore, OutboxStore, ReceiveLoopMonitor, SignalCliInfo,
};
use crate::storage;

#[derive(Clone)]
pub struct AppState {
  pub(crate) env_path: Option<PathBuf>,
  pub(crate) app_data_dir: PathBuf,
  pub(crate) threads_dir: PathBuf,
  pub(crate) aliases_dir: PathBuf,
  pub(crate) search_dir: PathBuf,
  pub(crate) export_dir: PathBuf,
  pub(crate) outbox_dir: PathBuf,
  pub(crate) account_manager: AccountManager,
  pub(crate) alias_manager: AliasManager,
  pub(crate) contact_store: ContactStore,
  pub(crate) group_store: GroupStore,
  pub(crate) receive_monitor: ReceiveLoopMonitor,
  pub(crate) signal_cli_info: Arc<Mutex<SignalCliInfo>>,
  pub(crate) outbox_store: OutboxStore,
  pub(crate) outbox_send_locks: Arc<Mutex<HashMap<String, Arc<AsyncMutex<()>>>>>,
  pub(crate) outbox_workers: Arc<Mutex<HashSet<String>>>,
  pub(crate) storage: Option<Arc<storage::Storage>>,
  pub(crate) auth_manager: Option<Arc<auth::AuthManager>>,
  pub(crate) rules_engine: Option<Arc<rules::RulesEngine>>,
}
