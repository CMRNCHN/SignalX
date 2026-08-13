//! PIN-gated account roster and per-account shop data roots.
//!
//! Runtime still has exactly one live identity. Switching is an unlock of a
//! roster member — never a free-form `set_active(arbitrary id)`.

use argon2::{
  password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
  Argon2,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

pub fn sanitize_account_id(s: &str) -> String {
  s.chars()
    .map(|c| {
      if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
        c
      } else {
        '_'
      }
    })
    .collect()
}

pub fn canonical_account_id(number: &str) -> String {
  sanitize_account_id(number.trim())
}

pub fn account_data_dir(app_data_dir: &Path, account_id: &str) -> PathBuf {
  let id = sanitize_account_id(account_id);
  app_data_dir.join("accounts").join(id)
}

/// Shop files live under `accounts/{id}/`. Legacy global `commerce/` / `ivr/`
/// are used only when the namespaced tree is absent (pre-migration).
pub fn shop_root(app_data_dir: &Path, account_id: &str) -> PathBuf {
  let namespaced = account_data_dir(app_data_dir, account_id);
  if namespaced.join("commerce").exists()
    || namespaced.join("ivr").exists()
    || namespaced.join("auto_reply_settings.json").is_file()
  {
    namespaced
  } else if app_data_dir.join("commerce").exists() || app_data_dir.join("ivr").exists() {
    app_data_dir.to_path_buf()
  } else {
    namespaced
  }
}

fn move_path(src: &Path, dest: &Path) -> Result<(), String> {
  if !src.exists() {
    return Ok(());
  }
  if dest.exists() {
    return Ok(());
  }
  if let Some(parent) = dest.parent() {
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  }
  match std::fs::rename(src, dest) {
    Ok(()) => Ok(()),
    Err(_) => {
      copy_tree(src, dest)?;
      let _ = if src.is_dir() {
        std::fs::remove_dir_all(src)
      } else {
        std::fs::remove_file(src)
      };
      Ok(())
    }
  }
}

fn copy_tree(src: &Path, dest: &Path) -> Result<(), String> {
  if src.is_file() {
    if let Some(parent) = dest.parent() {
      std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::copy(src, dest).map_err(|e| e.to_string())?;
    return Ok(());
  }
  std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;
  for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
    let entry = entry.map_err(|e| e.to_string())?;
    let to = dest.join(entry.file_name());
    copy_tree(&entry.path(), &to)?;
  }
  Ok(())
}

/// One-time: move global commerce/IVR/auto-reply onto the configured number.
pub fn migrate_global_shop(app_data_dir: &Path, account_id: &str) -> Result<bool, String> {
  let id = sanitize_account_id(account_id);
  if id.is_empty() || id.contains("..") {
    return Err("invalid account id".into());
  }
  let dest = account_data_dir(app_data_dir, &id);
  let dest_products = dest.join("commerce").join("products.json");
  if dest_products.is_file() {
    return Ok(false);
  }
  let src_commerce = app_data_dir.join("commerce");
  let src_ivr = app_data_dir.join("ivr");
  let src_auto = app_data_dir.join("auto_reply_settings.json");
  let src_audit = app_data_dir.join("auto_reply_audit.json");
  let has_src = src_commerce.exists() || src_ivr.exists() || src_auto.is_file() || src_audit.is_file();
  if !has_src {
    std::fs::create_dir_all(dest.join("commerce")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(dest.join("ivr").join("sessions")).map_err(|e| e.to_string())?;
    return Ok(false);
  }
  std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
  move_path(&src_commerce, &dest.join("commerce"))?;
  move_path(&src_ivr, &dest.join("ivr"))?;
  move_path(&src_auto, &dest.join("auto_reply_settings.json"))?;
  move_path(&src_audit, &dest.join("auto_reply_audit.json"))?;
  Ok(true)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RosterAccount {
  pub id: String,
  pub e164: String,
  #[serde(default)]
  pub label: String,
  #[serde(default)]
  pub pin_hash: Option<String>,
  pub created_ms: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Roster {
  pub version: u32,
  #[serde(default)]
  pub last_unlocked: Option<String>,
  pub accounts: Vec<RosterAccount>,
}

impl Default for Roster {
  fn default() -> Self {
    Self {
      version: 1,
      last_unlocked: None,
      accounts: Vec::new(),
    }
  }
}

impl Roster {
  pub fn path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("accounts").join("roster.json")
  }

  pub fn load(app_data_dir: &Path) -> Roster {
    let p = Self::path(app_data_dir);
    if p.is_file() {
      std::fs::read_to_string(&p)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
    } else {
      Roster::default()
    }
  }

  pub fn save(&self, app_data_dir: &Path) -> Result<(), String> {
    let p = Self::path(app_data_dir);
    if let Some(parent) = p.parent() {
      std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
    std::fs::write(p, json).map_err(|e| e.to_string())
  }

  pub fn find(&self, id: &str) -> Option<&RosterAccount> {
    let id = sanitize_account_id(id);
    self.accounts.iter().find(|a| a.id == id)
  }

  pub fn find_mut(&mut self, id: &str) -> Option<&mut RosterAccount> {
    let id = sanitize_account_id(id);
    self.accounts.iter_mut().find(|a| a.id == id)
  }

  pub fn requires_unlock(&self) -> bool {
    self.accounts.len() > 1 || self.accounts.iter().any(|a| a.pin_hash.is_some())
  }

  /// Unlock only roster members. Unknown ids are rejected (old switcher bug).
  pub fn verify_unlock(&self, id: &str, pin: &str) -> Result<&RosterAccount, String> {
    let id = sanitize_account_id(id);
    if id.is_empty() || id.contains("..") {
      return Err("unknown account".into());
    }
    let acct = self
      .find(&id)
      .ok_or_else(|| "unknown account".to_string())?;
    match &acct.pin_hash {
      Some(hash) => {
        if pin.is_empty() {
          return Err("PIN required".into());
        }
        verify_pin(pin, hash)?;
      }
      None => {
        if !pin.is_empty() {
          return Err("this account has no PIN".into());
        }
      }
    }
    Ok(acct)
  }
}

pub fn hash_pin(pin: &str) -> Result<String, String> {
  let pin = pin.trim();
  if pin.len() < 4 || pin.len() > 64 {
    return Err("PIN must be 4–64 characters".into());
  }
  let salt = SaltString::generate(&mut argon2::password_hash::rand_core::OsRng);
  Argon2::default()
    .hash_password(pin.as_bytes(), &salt)
    .map(|h| h.to_string())
    .map_err(|e| e.to_string())
}

pub fn verify_pin(pin: &str, hash: &str) -> Result<(), String> {
  let parsed = PasswordHash::new(hash).map_err(|_| "invalid PIN hash".to_string())?;
  Argon2::default()
    .verify_password(pin.trim().as_bytes(), &parsed)
    .map_err(|_| "incorrect PIN".to_string())
}

pub fn last4(e164: &str) -> String {
  let digits: String = e164.chars().filter(|c| c.is_ascii_digit()).collect();
  if digits.len() <= 4 {
    digits
  } else {
    digits[digits.len() - 4..].to_string()
  }
}

#[derive(Clone)]
pub struct SessionControl {
  gen: Arc<AtomicU64>,
  locked: Arc<AtomicBool>,
  failures: Arc<Mutex<HashMap<String, (u32, i64)>>>,
}

impl Default for SessionControl {
  fn default() -> Self {
    Self {
      gen: Arc::new(AtomicU64::new(1)),
      locked: Arc::new(AtomicBool::new(false)),
      failures: Arc::new(Mutex::new(HashMap::new())),
    }
  }
}

impl SessionControl {
  pub fn current_gen(&self) -> u64 {
    self.gen.load(Ordering::SeqCst)
  }

  pub fn bump(&self) -> u64 {
    self.gen.fetch_add(1, Ordering::SeqCst) + 1
  }

  pub fn is_locked(&self) -> bool {
    self.locked.load(Ordering::SeqCst)
  }

  pub fn set_locked(&self, locked: bool) {
    self.locked.store(locked, Ordering::SeqCst);
  }

  /// True when this worker generation is still the live unlocked session.
  pub fn is_current(&self, gen: u64) -> bool {
    !self.is_locked() && self.current_gen() == gen
  }

  pub fn check_backoff(&self, id: &str, now_ms: i64) -> Result<(), String> {
    let map = self.failures.lock().unwrap();
    if let Some((n, until)) = map.get(id) {
      if *n >= 5 && *until > now_ms {
        return Err("too many PIN attempts — wait and retry".into());
      }
    }
    Ok(())
  }

  pub fn record_failure(&self, id: &str, now_ms: i64) {
    let mut map = self.failures.lock().unwrap();
    let entry = map.entry(id.to_string()).or_insert((0, 0));
    entry.0 = entry.0.saturating_add(1);
    if entry.0 >= 5 {
      entry.1 = now_ms + 30_000;
    }
  }

  pub fn clear_failures(&self, id: &str) {
    self.failures.lock().unwrap().remove(id);
  }
}

pub fn ensure_roster_account(
  app_data_dir: &Path,
  e164: &str,
  now_ms: i64,
) -> Result<Roster, String> {
  let id = canonical_account_id(e164);
  if id.is_empty() {
    return Err("invalid account number".into());
  }
  let mut roster = Roster::load(app_data_dir);
  if roster.find(&id).is_none() {
    roster.accounts.push(RosterAccount {
      id: id.clone(),
      e164: e164.trim().to_string(),
      label: String::new(),
      pin_hash: None,
      created_ms: now_ms,
    });
  }
  if roster.last_unlocked.is_none() {
    roster.last_unlocked = Some(id);
  }
  roster.save(app_data_dir)?;
  Ok(roster)
}

/// Extract E.164-looking numbers from signal-cli `data/accounts.json`.
pub fn linked_numbers_from_accounts_json(json: &str) -> Vec<String> {
  fn walk(v: &serde_json::Value, out: &mut Vec<String>) {
    match v {
      serde_json::Value::String(s) => {
        let t = s.trim();
        if t.starts_with('+')
          && t.len() >= 8
          && t.len() <= 17
          && t[1..].chars().all(|c| c.is_ascii_digit())
          && !out.iter().any(|x| x == t)
        {
          out.push(t.to_string());
        }
      }
      serde_json::Value::Array(arr) => {
        for x in arr {
          walk(x, out);
        }
      }
      serde_json::Value::Object(map) => {
        for (k, x) in map {
          if k == "number" || k == "uuid" || k == "accounts" || k == "name" {
            walk(x, out);
          } else {
            walk(x, out);
          }
        }
      }
      _ => {}
    }
  }
  let mut out = Vec::new();
  if let Ok(v) = serde_json::from_str::<serde_json::Value>(json) {
    walk(&v, &mut out);
  }
  out
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::time::{SystemTime, UNIX_EPOCH};

  fn tmp(label: &str) -> PathBuf {
    let ms = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .unwrap()
      .as_millis();
    let p = std::env::temp_dir().join(format!("signalx-session-{label}-{ms}"));
    let _ = std::fs::remove_dir_all(&p);
    std::fs::create_dir_all(&p).unwrap();
    p
  }

  #[test]
  fn account_data_dir_sanitizes_escape() {
    let root = PathBuf::from("/tmp/signalx-app");
    let p = account_data_dir(&root, "../../etc/passwd");
    assert_eq!(p, root.join("accounts").join("______etc_passwd"));
    assert!(p.starts_with(&root));
  }

  #[test]
  fn migrate_moves_global_commerce() {
    let root = tmp("mig");
    std::fs::create_dir_all(root.join("commerce")).unwrap();
    std::fs::write(root.join("commerce/products.json"), r#"{"version":1,"products":[]}"#).unwrap();
    std::fs::write(root.join("auto_reply_settings.json"), "{}").unwrap();
    let moved = migrate_global_shop(&root, "+12025551212").unwrap();
    assert!(moved);
    assert!(root
      .join("accounts/_12025551212/commerce/products.json")
      .is_file());
    assert!(!root.join("commerce/products.json").is_file());
    let _ = std::fs::remove_dir_all(&root);
  }

  #[test]
  fn roster_rejects_unknown_id() {
    let mut roster = Roster::default();
    roster.accounts.push(RosterAccount {
      id: "_12025551212".into(),
      e164: "+12025551212".into(),
      label: "Shop".into(),
      pin_hash: None,
      created_ms: 1,
    });
    let err = roster.verify_unlock("../../etc/passwd", "").unwrap_err();
    assert!(err.contains("unknown"));
    let err = roster.verify_unlock("_15550001111", "").unwrap_err();
    assert!(err.contains("unknown"));
    assert!(roster.verify_unlock("_12025551212", "").is_ok());
  }

  #[test]
  fn pin_roundtrip() {
    let hash = hash_pin("2468").unwrap();
    assert!(verify_pin("2468", &hash).is_ok());
    assert!(verify_pin("0000", &hash).is_err());
  }

  #[test]
  fn session_gen_invalidates_old_worker() {
    let s = SessionControl::default();
    let g1 = s.current_gen();
    assert!(s.is_current(g1));
    s.bump();
    assert!(!s.is_current(g1));
    s.set_locked(true);
    assert!(!s.is_current(s.current_gen()));
  }

  #[test]
  fn linked_numbers_parse() {
    let json = r#"{"accounts":[{"number":"+15551234567"},{"number":"+14445556666"}]}"#;
    let n = linked_numbers_from_accounts_json(json);
    assert!(n.contains(&"+15551234567".to_string()));
    assert_eq!(n.len(), 2);
  }
}
