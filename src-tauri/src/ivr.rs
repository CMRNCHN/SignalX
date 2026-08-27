//! Signal text-menu IVR (session state machine). Pure engine + disk store.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct IvrSettings {
  pub enabled: bool,
  #[serde(default)]
  pub allowlist: Vec<String>,
  #[serde(default = "default_require_allowlist")]
  pub require_allowlist: bool,
  /// When true, IVR catalog browse / order pick omit zero-stock products.
  #[serde(default)]
  pub hide_zero_stock: bool,
}

fn default_require_allowlist() -> bool {
  true
}

impl Default for IvrSettings {
  fn default() -> Self {
    Self {
      enabled: false,
      allowlist: vec![],
      require_allowlist: true,
      hide_zero_stock: false,
    }
  }
}

/// Host actions the IVR engine may emit (validated on menu save).
pub const ALLOWED_IVR_ACTIONS: &[&str] = &[
  "list_catalog",
  "offer_product",
  "place_order",
  "handoff",
  "order_status",
];

/// Validate menu graph before persist. Returns Ok(()) or a clear error.
pub fn validate_menus(menus: &IvrMenus) -> Result<(), String> {
  if menus.entry.trim().is_empty() {
    return Err("menus.entry is required".into());
  }
  if menus.session_ttl_ms < 60_000 {
    return Err("session_ttl_ms must be at least 60000 (1 minute)".into());
  }
  if menus.nodes.is_empty() {
    return Err("menus.nodes must not be empty".into());
  }
  if !menus.nodes.contains_key(&menus.entry) {
    return Err(format!("entry node '{}' is missing from nodes", menus.entry));
  }
  for (id, node) in &menus.nodes {
    if node.prompt.trim().is_empty() {
      return Err(format!("node '{}': prompt is required", id));
    }
    for (key, choice) in &node.choices {
      if let Some(goto) = &choice.goto {
        if !menus.nodes.contains_key(goto) {
          return Err(format!(
            "node '{}' choice '{}': goto '{}' not found",
            id, key, goto
          ));
        }
      }
      if let Some(action) = &choice.action {
        if !ALLOWED_IVR_ACTIONS.contains(&action.as_str()) {
          return Err(format!(
            "node '{}' choice '{}': unknown action '{}' (allowed: {})",
            id,
            key,
            action,
            ALLOWED_IVR_ACTIONS.join(", ")
          ));
        }
      }
    }
    if let Some(after) = &node.after_capture {
      if !menus.nodes.contains_key(&after.goto) {
        return Err(format!(
          "node '{}': after_capture.goto '{}' not found",
          id, after.goto
        ));
      }
      if let Some(action) = &after.action {
        if !ALLOWED_IVR_ACTIONS.contains(&action.as_str()) {
          return Err(format!(
            "node '{}': after_capture unknown action '{}' (allowed: {})",
            id,
            action,
            ALLOWED_IVR_ACTIONS.join(", ")
          ));
        }
      }
    }
  }
  Ok(())
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct IvrSession {
  pub thread_id: String,
  pub node_id: String,
  #[serde(default)]
  pub slots: HashMap<String, String>,
  #[serde(default)]
  pub handed_off: bool,
  pub updated_at: i64,
  pub expires_at: i64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct IvrChoice {
  #[serde(default)]
  pub goto: Option<String>,
  #[serde(default)]
  pub action: Option<String>,
  #[serde(default)]
  pub reply: Option<String>,
  /// Bound catalog product. Survives catalog reorder; host uses this instead of list index.
  #[serde(default)]
  pub product_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct IvrAfterCapture {
  pub reply: String,
  pub goto: String,
  #[serde(default)]
  pub action: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct IvrNode {
  pub prompt: String,
  #[serde(default)]
  pub choices: HashMap<String, IvrChoice>,
  #[serde(default)]
  pub on_unknown: Option<String>,
  #[serde(default)]
  pub capture_slot: Option<String>,
  #[serde(default)]
  pub after_capture: Option<IvrAfterCapture>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct IvrMenus {
  pub version: u32,
  pub entry: String,
  pub session_ttl_ms: i64,
  pub nodes: HashMap<String, IvrNode>,
}

impl IvrMenus {
  pub fn default_demo() -> Self {
    let mut nodes = HashMap::new();
    nodes.insert(
      "main".to_string(),
      IvrNode {
        prompt: "Hi — reply with a number:\n1 · See products\n2 · Place an order\n3 · Talk to us\n4 · Check order\n0 · Menu".to_string(),
        choices: HashMap::from([
          ("1".into(), IvrChoice {
            goto: Some("browse".into()),
            action: Some("list_catalog".into()),
            reply: None,
            product_id: None,
          }),
          ("2".into(), IvrChoice {
            goto: Some("order_pick".into()),
            action: Some("list_catalog".into()),
            reply: None,
            product_id: None,
          }),
          ("3".into(), IvrChoice {
            goto: None,
            action: Some("handoff".into()),
            reply: Some("Got it — someone will reply here shortly.".into()),
            product_id: None,
          }),
          ("4".into(), IvrChoice {
            goto: Some("main".into()),
            action: Some("order_status".into()),
            reply: None,
            product_id: None,
          }),
          ("0".into(), IvrChoice { goto: Some("main".into()), action: None, reply: None, product_id: None }),
          ("menu".into(), IvrChoice { goto: Some("main".into()), action: None, reply: None, product_id: None }),
          ("help".into(), IvrChoice { goto: Some("main".into()), action: None, reply: None, product_id: None }),
        ]),
        on_unknown: Some("Reply 1, 2, 3, 4, or 0.".into()),
        capture_slot: None,
        after_capture: None,
      },
    );
    nodes.insert(
      "browse".to_string(),
      IvrNode {
        prompt: "Reply 2 to order, or 0 for the menu.".to_string(),
        choices: HashMap::from([
          ("2".into(), IvrChoice {
            goto: Some("order_pick".into()),
            action: Some("list_catalog".into()),
            reply: None,
            product_id: None,
          }),
          ("0".into(), IvrChoice { goto: Some("main".into()), action: None, reply: None, product_id: None }),
          ("menu".into(), IvrChoice { goto: Some("main".into()), action: None, reply: None, product_id: None }),
        ]),
        on_unknown: Some("Reply 2 to order, or 0 for the menu.".into()),
        capture_slot: None,
        after_capture: None,
      },
    );
    nodes.insert(
      "order_pick".to_string(),
      IvrNode {
        prompt: "Reply with the product # from the list (or 0 to cancel).".to_string(),
        choices: HashMap::from([
          ("0".into(), IvrChoice { goto: Some("main".into()), action: None, reply: None, product_id: None }),
          ("menu".into(), IvrChoice { goto: Some("main".into()), action: None, reply: None, product_id: None }),
        ]),
        on_unknown: None,
        capture_slot: Some("order_idx".into()),
        after_capture: Some(IvrAfterCapture {
          reply: "How many?".into(),
          goto: "order_qty".into(),
          action: None,
        }),
      },
    );
    nodes.insert(
      "order_qty".to_string(),
      IvrNode {
        prompt: "Reply with a quantity (or 0 to cancel).".to_string(),
        choices: HashMap::from([
          ("0".into(), IvrChoice { goto: Some("main".into()), action: None, reply: None, product_id: None }),
          ("menu".into(), IvrChoice { goto: Some("main".into()), action: None, reply: None, product_id: None }),
        ]),
        on_unknown: None,
        capture_slot: Some("order_qty".into()),
        after_capture: Some(IvrAfterCapture {
          reply: "Working on it…".into(),
          goto: "main".into(),
          action: Some("place_order".into()),
        }),
      },
    );
    nodes.insert(
      "ask_note".to_string(),
      IvrNode {
        prompt: "Send your note in one message.".to_string(),
        choices: HashMap::new(),
        on_unknown: None,
        capture_slot: Some("note".into()),
        after_capture: Some(IvrAfterCapture {
          reply: "Noted — thanks.".into(),
          goto: "main".into(),
          action: None,
        }),
      },
    );
    Self {
      version: 4,
      entry: "main".to_string(),
      session_ttl_ms: 1_800_000,
      nodes,
    }
  }
}

fn migrate_menus(mut m: IvrMenus) -> IvrMenus {
  if m.version >= 4 {
    return m;
  }
  // Soft upgrade: ensure Check order on main when still on demo-shaped v3.
  if let Some(main) = m.nodes.get_mut("main") {
    if !main.choices.contains_key("4") {
      main.choices.insert(
        "4".into(),
        IvrChoice {
          goto: Some("main".into()),
          action: Some("order_status".into()),
          reply: None,
          product_id: None,
        },
      );
      if !main.prompt.contains("Check order") {
        main.prompt = format!("{}\n4 · Check order", main.prompt.trim_end());
      }
      if let Some(u) = main.on_unknown.as_mut() {
        if u.contains("1, 2, 3") && !u.contains("4") {
          *u = u.replace("1, 2, 3", "1, 2, 3, 4");
        }
      }
    }
  }
  m.version = 4;
  m
}

#[derive(Clone, Debug)]
pub struct IvrStepResult {
  pub session: IvrSession,
  pub reply: Option<String>,
  /// Engine ran for this inbound (caller should skip AI auto-send path).
  pub handled: bool,
  /// Side effect for the host (e.g. `list_catalog`).
  pub action: Option<String>,
}

pub fn normalize_input(raw: &str) -> String {
  let t = raw.trim();
  let lower = t.to_lowercase();
  if lower == "menu" || lower == "help" {
    return lower;
  }
  t.to_string()
}

pub fn fresh_session(thread_id: &str, menus: &IvrMenus, now: i64) -> IvrSession {
  IvrSession {
    thread_id: thread_id.to_string(),
    node_id: menus.entry.clone(),
    slots: HashMap::new(),
    handed_off: false,
    updated_at: now,
    expires_at: now + menus.session_ttl_ms,
  }
}

fn touch(session: &mut IvrSession, menus: &IvrMenus, now: i64) {
  session.updated_at = now;
  session.expires_at = now + menus.session_ttl_ms;
}

fn prompt_for(menus: &IvrMenus, node_id: &str) -> String {
  menus
    .nodes
    .get(node_id)
    .map(|n| n.prompt.clone())
    .unwrap_or_else(|| "Menu unavailable. Reply 0.".to_string())
}

fn apply_goto(session: &mut IvrSession, menus: &IvrMenus, goto: &str, now: i64) -> String {
  session.node_id = goto.to_string();
  touch(session, menus, now);
  prompt_for(menus, goto)
}

/// Pure IVR step. Caller enforces allowlist / global enable / groups.
pub fn step(mut session: IvrSession, inbound: &str, menus: &IvrMenus, now: i64) -> IvrStepResult {
  if session.handed_off {
    return IvrStepResult {
      session,
      reply: None,
      handled: true,
      action: None,
    };
  }

  if now > session.expires_at {
    session = fresh_session(&session.thread_id, menus, now);
  }

  let input = normalize_input(inbound);
  if input.is_empty() {
    return IvrStepResult {
      session,
      reply: None,
      handled: true,
      action: None,
    };
  }

  let node = match menus.nodes.get(&session.node_id) {
    Some(n) => n.clone(),
    None => {
      session.node_id = menus.entry.clone();
      touch(&mut session, menus, now);
      return IvrStepResult {
        reply: Some(prompt_for(menus, &menus.entry)),
        session,
        handled: true,
        action: None,
      };
    }
  };

  // Capture node: any non-empty text (except menu/help/0 shortcuts if also in choices)
  if let Some(slot) = &node.capture_slot {
    if let Some(choice) = node.choices.get(&input) {
      if let Some(res) = apply_choice(&mut session, menus, choice, now) {
        return res;
      }
    }
    // Validate numeric slots used by order flow
    if slot == "order_idx" || slot == "order_qty" {
      let ok_num = inbound.trim().parse::<i64>().ok().filter(|n| *n > 0).is_some();
      if !ok_num {
        touch(&mut session, menus, now);
        return IvrStepResult {
          reply: Some(format!(
            "Please reply with a positive number.\n\n{}",
            node.prompt
          )),
          session,
          handled: true,
          action: None,
        };
      }
    }
    session.slots.insert(slot.clone(), inbound.trim().to_string());
    if let Some(after) = &node.after_capture {
      let ack = after.reply.clone();
      let action = after.action.clone();
      let next_prompt = apply_goto(&mut session, menus, &after.goto, now);
      // When placing an order, host replaces the reply; skip appending next menu yet.
      let reply = if action.as_deref() == Some("place_order") {
        Some(ack)
      } else {
        Some(format!("{}\n\n{}", ack, next_prompt))
      };
      return IvrStepResult {
        reply,
        session,
        handled: true,
        action,
      };
    }
    touch(&mut session, menus, now);
    return IvrStepResult {
      reply: Some("Thanks.".to_string()),
      session,
      handled: true,
      action: None,
    };
  }

  if let Some(choice) = node.choices.get(&input) {
    if let Some(res) = apply_choice(&mut session, menus, choice, now) {
      return res;
    }
  }

  let hint = node
    .on_unknown
    .clone()
    .unwrap_or_else(|| "Please choose a valid option.".to_string());
  touch(&mut session, menus, now);
  IvrStepResult {
    reply: Some(format!("{}\n\n{}", hint, node.prompt)),
    session,
    handled: true,
    action: None,
  }
}

fn apply_choice(
  session: &mut IvrSession,
  menus: &IvrMenus,
  choice: &IvrChoice,
  now: i64,
) -> Option<IvrStepResult> {
  if let Some(pid) = choice
    .product_id
    .as_ref()
    .map(|s| s.trim())
    .filter(|s| !s.is_empty())
  {
    session.slots.insert("product_id".to_string(), pid.to_string());
  }

  if let Some(action) = &choice.action {
    if action == "handoff" {
      session.handed_off = true;
      touch(session, menus, now);
      return Some(IvrStepResult {
        reply: choice.reply.clone(),
        session: session.clone(),
        handled: true,
        action: Some("handoff".into()),
      });
    }
    if action == "list_catalog"
      || action == "order_status"
      || action == "offer_product"
      || action == "place_order"
    {
      if let Some(goto) = &choice.goto {
        session.node_id = goto.clone();
        touch(session, menus, now);
      } else {
        touch(session, menus, now);
      }
      return Some(IvrStepResult {
        reply: None,
        session: session.clone(),
        handled: true,
        action: Some(action.clone()),
      });
    }
  }
  if let Some(goto) = &choice.goto {
    let reply = apply_goto(session, menus, goto, now);
    return Some(IvrStepResult {
      reply: Some(reply),
      session: session.clone(),
      handled: true,
      action: None,
    });
  }
  None
}

pub fn thread_allowed(settings: &IvrSettings, thread_id: &str) -> bool {
  if thread_id.starts_with("group:") {
    return false;
  }
  if !settings.enabled {
    return false;
  }
  if settings.require_allowlist {
    return settings.allowlist.iter().any(|t| t == thread_id);
  }
  if settings.allowlist.is_empty() {
    return true;
  }
  settings.allowlist.iter().any(|t| t == thread_id)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct IvrPreviewStep {
  pub input: String,
  pub node_id: String,
  pub reply: Option<String>,
  pub action: Option<String>,
  pub handed_off: bool,
  pub slots: HashMap<String, String>,
}

#[derive(Clone)]
pub struct IvrStore {
  settings_path: Arc<Mutex<PathBuf>>,
  menus_path: Arc<Mutex<PathBuf>>,
  sessions_dir: Arc<Mutex<PathBuf>>,
  settings: Arc<Mutex<IvrSettings>>,
  menus: Arc<Mutex<IvrMenus>>,
  /// account_id -> thread_id -> session
  sessions: Arc<Mutex<HashMap<String, HashMap<String, IvrSession>>>>,
}

impl IvrStore {
  pub fn new(app_data_dir: &Path) -> Self {
    let ivr_dir = app_data_dir.join("ivr");
    let _ = std::fs::create_dir_all(&ivr_dir);
    let sessions_dir = ivr_dir.join("sessions");
    let _ = std::fs::create_dir_all(&sessions_dir);

    let settings_path = ivr_dir.join("settings.json");
    let menus_path = ivr_dir.join("menus.json");

    let settings = if settings_path.is_file() {
      std::fs::read_to_string(&settings_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
    } else {
      IvrSettings::default()
    };

    let menus = if menus_path.is_file() {
      let loaded: Option<IvrMenus> = std::fs::read_to_string(&menus_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok());
      match loaded {
        Some(m) if m.version >= 3 => {
          let m = migrate_menus(m);
          if let Ok(json) = serde_json::to_string_pretty(&m) {
            let _ = std::fs::write(&menus_path, json);
          }
          m
        }
        _ => {
          let m = IvrMenus::default_demo();
          if let Ok(json) = serde_json::to_string_pretty(&m) {
            let _ = std::fs::write(&menus_path, json);
          }
          m
        }
      }
    } else {
      let m = IvrMenus::default_demo();
      if let Ok(json) = serde_json::to_string_pretty(&m) {
        let _ = std::fs::write(&menus_path, json);
      }
      m
    };

    Self {
      settings_path: Arc::new(Mutex::new(settings_path)),
      menus_path: Arc::new(Mutex::new(menus_path)),
      sessions_dir: Arc::new(Mutex::new(sessions_dir)),
      settings: Arc::new(Mutex::new(settings)),
      menus: Arc::new(Mutex::new(menus)),
      sessions: Arc::new(Mutex::new(HashMap::new())),
    }
  }

  pub fn reload_from(&self, account_data_dir: &Path) {
    let fresh = Self::new(account_data_dir);
    *self.settings_path.lock().unwrap() = fresh.settings_path.lock().unwrap().clone();
    *self.menus_path.lock().unwrap() = fresh.menus_path.lock().unwrap().clone();
    *self.sessions_dir.lock().unwrap() = fresh.sessions_dir.lock().unwrap().clone();
    *self.settings.lock().unwrap() = fresh.settings.lock().unwrap().clone();
    *self.menus.lock().unwrap() = fresh.menus.lock().unwrap().clone();
    *self.sessions.lock().unwrap() = HashMap::new();
  }

  pub fn get_settings(&self) -> IvrSettings {
    self.settings.lock().unwrap().clone()
  }

  pub fn set_settings(&self, s: IvrSettings) -> Result<IvrSettings, String> {
    {
      *self.settings.lock().unwrap() = s.clone();
    }
    let json = serde_json::to_string_pretty(&s).map_err(|e| e.to_string())?;
    let path = self.settings_path.lock().unwrap().clone();
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(s)
  }

  pub fn menus(&self) -> IvrMenus {
    self.menus.lock().unwrap().clone()
  }

  pub fn set_menus(&self, menus: IvrMenus) -> Result<IvrMenus, String> {
    validate_menus(&menus)?;
    {
      *self.menus.lock().unwrap() = menus.clone();
    }
    let json = serde_json::to_string_pretty(&menus).map_err(|e| e.to_string())?;
    let path = self.menus_path.lock().unwrap().clone();
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(menus)
  }

  pub fn reset_menus_to_demo(&self) -> Result<IvrMenus, String> {
    self.set_menus(IvrMenus::default_demo())
  }

  /// Dry-run a path of inputs from a fresh session; returns reply/action steps.
  pub fn preview_path(&self, inputs: &[String], now: i64) -> Vec<IvrPreviewStep> {
    let menus = self.menus();
    let mut session = fresh_session("dm:+preview", &menus, now);
    let mut out = Vec::new();
    for (i, inbound) in inputs.iter().enumerate() {
      let result = step(session, inbound, &menus, now + i as i64);
      out.push(IvrPreviewStep {
        input: inbound.clone(),
        node_id: result.session.node_id.clone(),
        reply: result.reply.clone(),
        action: result.action.clone(),
        handed_off: result.session.handed_off,
        slots: result.session.slots.clone(),
      });
      session = result.session;
    }
    out
  }

  fn sessions_path(&self, account_id: &str) -> PathBuf {
    let safe: String = account_id
      .chars()
      .map(|c| {
        if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
          c
        } else {
          '_'
        }
      })
      .collect();
    self.sessions_dir.lock().unwrap().join(format!("{}.json", safe))
  }

  fn ensure_sessions_loaded(&self, account_id: &str) {
    let mut all = self.sessions.lock().unwrap();
    if all.contains_key(account_id) {
      return;
    }
    let path = self.sessions_path(account_id);
    let map: HashMap<String, IvrSession> = if path.is_file() {
      std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
    } else {
      HashMap::new()
    };
    all.insert(account_id.to_string(), map);
  }

  fn persist_sessions(&self, account_id: &str) -> Result<(), String> {
    self.ensure_sessions_loaded(account_id);
    let all = self.sessions.lock().unwrap();
    let map = all.get(account_id).cloned().unwrap_or_default();
    let json = serde_json::to_string_pretty(&map).map_err(|e| e.to_string())?;
    std::fs::write(self.sessions_path(account_id), json).map_err(|e| e.to_string())
  }

  pub fn get_session(&self, account_id: &str, thread_id: &str) -> Option<IvrSession> {
    self.ensure_sessions_loaded(account_id);
    self
      .sessions
      .lock()
      .unwrap()
      .get(account_id)
      .and_then(|m| m.get(thread_id).cloned())
  }

  pub fn get_or_fresh_session(&self, account_id: &str, thread_id: &str, now: i64) -> IvrSession {
    let menus = self.menus();
    if let Some(s) = self.get_session(account_id, thread_id) {
      if now <= s.expires_at || s.handed_off {
        return s;
      }
    }
    fresh_session(thread_id, &menus, now)
  }

  pub fn save_session(&self, account_id: &str, session: IvrSession) -> Result<(), String> {
    self.ensure_sessions_loaded(account_id);
    {
      let mut all = self.sessions.lock().unwrap();
      let map = all.entry(account_id.to_string()).or_default();
      map.insert(session.thread_id.clone(), session);
    }
    self.persist_sessions(account_id)
  }

  pub fn set_thread_enabled(
    &self,
    account_id: &str,
    thread_id: &str,
    enabled: bool,
    now: i64,
  ) -> Result<IvrSession, String> {
    let mut settings = self.get_settings();
    if enabled {
      if !settings.allowlist.iter().any(|t| t == thread_id) {
        settings.allowlist.push(thread_id.to_string());
      }
    } else {
      settings.allowlist.retain(|t| t != thread_id);
    }
    self.set_settings(settings)?;

    let menus = self.menus();
    let mut session = self.get_or_fresh_session(account_id, thread_id, now);
    if enabled {
      session.handed_off = false;
      session.node_id = menus.entry.clone();
      touch(&mut session, &menus, now);
    }
    self.save_session(account_id, session.clone())?;
    Ok(session)
  }

  pub fn clear_handoff(&self, account_id: &str, thread_id: &str, now: i64) -> Result<IvrSession, String> {
    let menus = self.menus();
    let mut session = self.get_or_fresh_session(account_id, thread_id, now);
    session.handed_off = false;
    session.node_id = menus.entry.clone();
    touch(&mut session, &menus, now);
    self.save_session(account_id, session.clone())?;
    Ok(session)
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn menus() -> IvrMenus {
    IvrMenus::default_demo()
  }

  #[test]
  fn main_one_lists_catalog_action() {
    let m = menus();
    let s = fresh_session("dm:+1", &m, 1000);
    let r = step(s, "1", &m, 1000);
    assert!(r.handled);
    assert_eq!(r.session.node_id, "browse");
    assert_eq!(r.action.as_deref(), Some("list_catalog"));
    assert!(r.reply.is_none());
  }

  #[test]
  fn handoff_sets_flag_and_blocks_further_replies() {
    let m = menus();
    let s = fresh_session("dm:+1", &m, 1000);
    let r = step(s, "3", &m, 1000);
    assert!(r.session.handed_off);
    assert!(r.reply.unwrap().contains("someone"));
    let r2 = step(r.session, "1", &m, 1001);
    assert!(r2.handled);
    assert!(r2.reply.is_none());
  }

  #[test]
  fn capture_note_then_main() {
    let m = menus();
    // Jump straight into ask_note node (still in menus for optional use)
    let mut s = fresh_session("dm:+1", &m, 1000);
    s.node_id = "ask_note".into();
    let r2 = step(s, "Need widgets Friday", &m, 1001);
    assert_eq!(r2.session.slots.get("note").unwrap(), "Need widgets Friday");
    assert_eq!(r2.session.node_id, "main");
    assert!(r2.reply.unwrap().contains("Noted"));
  }

  #[test]
  fn unknown_repeats_hint() {
    let m = menus();
    let s = fresh_session("dm:+1", &m, 1000);
    let r = step(s, "9", &m, 1000);
    assert!(r.reply.unwrap().contains("Reply 1"));
    assert_eq!(r.session.node_id, "main");
  }

  #[test]
  fn expired_session_resets_to_entry() {
    let m = menus();
    let mut s = fresh_session("dm:+1", &m, 1000);
    s.node_id = "browse".into();
    s.expires_at = 1500;
    let r = step(s, "1", &m, 2000);
    // after expiry, fresh session at main, then "1" -> browse + list_catalog
    assert_eq!(r.session.node_id, "browse");
    assert_eq!(r.action.as_deref(), Some("list_catalog"));
  }

  #[test]
  fn main_two_starts_order_pick_with_catalog() {
    let m = menus();
    let s = fresh_session("dm:+1", &m, 1000);
    let r = step(s, "2", &m, 1000);
    assert_eq!(r.session.node_id, "order_pick");
    assert_eq!(r.action.as_deref(), Some("list_catalog"));
  }

  #[test]
  fn order_pick_then_qty_emits_place_order() {
    let m = menus();
    let s = fresh_session("dm:+1", &m, 1000);
    let r = step(s, "2", &m, 1000);
    let r2 = step(r.session, "1", &m, 1001);
    assert_eq!(r2.session.node_id, "order_qty");
    assert_eq!(r2.session.slots.get("order_idx").unwrap(), "1");
    let r3 = step(r2.session, "2", &m, 1002);
    assert_eq!(r3.action.as_deref(), Some("place_order"));
    assert_eq!(r3.session.slots.get("order_qty").unwrap(), "2");
    assert_eq!(r3.session.node_id, "main");
  }

  #[test]
  fn order_pick_rejects_non_numeric() {
    let m = menus();
    let s = fresh_session("dm:+1", &m, 1000);
    let r = step(s, "2", &m, 1000);
    let r2 = step(r.session, "abc", &m, 1001);
    assert_eq!(r2.session.node_id, "order_pick");
    assert!(r2.reply.unwrap().contains("positive number"));
  }

  #[test]
  fn main_four_emits_order_status() {
    let m = menus();
    let s = fresh_session("dm:+1", &m, 1000);
    let r = step(s, "4", &m, 1000);
    assert_eq!(r.action.as_deref(), Some("order_status"));
    assert_eq!(r.session.node_id, "main");
  }

  #[test]
  fn validate_menus_rejects_bad_goto() {
    let mut m = menus();
    m.nodes.get_mut("main").unwrap().choices.insert(
      "9".into(),
      IvrChoice {
        goto: Some("missing".into()),
        action: None,
        reply: None,
        product_id: None,
      },
    );
    let err = validate_menus(&m).unwrap_err();
    assert!(err.contains("missing"), "{err}");
  }

  #[test]
  fn validate_menus_rejects_unknown_action() {
    let mut m = menus();
    m.nodes.get_mut("main").unwrap().choices.insert(
      "9".into(),
      IvrChoice {
        goto: None,
        action: Some("explode".into()),
        reply: None,
        product_id: None,
      },
    );
    let err = validate_menus(&m).unwrap_err();
    assert!(err.contains("explode"), "{err}");
  }

  #[test]
  fn bound_product_choice_stores_product_id() {
    let mut m = menus();
    m.nodes.get_mut("main").unwrap().choices.insert(
      "8".into(),
      IvrChoice {
        goto: Some("order_qty".into()),
        action: None,
        reply: None,
        product_id: Some("prod_abc".into()),
      },
    );
    let s = fresh_session("dm:+1", &m, 1000);
    let r = step(s, "8", &m, 1000);
    assert!(r.handled);
    assert_eq!(r.session.node_id, "order_qty");
    assert_eq!(r.session.slots.get("product_id").unwrap(), "prod_abc");
    assert!(r.action.is_none());
  }

  #[test]
  fn offer_product_action_emits_with_bound_id() {
    let mut m = menus();
    m.nodes.get_mut("main").unwrap().choices.insert(
      "7".into(),
      IvrChoice {
        goto: Some("order_qty".into()),
        action: Some("offer_product".into()),
        reply: None,
        product_id: Some("sku-1".into()),
      },
    );
    let s = fresh_session("dm:+1", &m, 1000);
    let r = step(s, "7", &m, 1000);
    assert_eq!(r.action.as_deref(), Some("offer_product"));
    assert_eq!(r.session.node_id, "order_qty");
    assert_eq!(r.session.slots.get("product_id").unwrap(), "sku-1");
  }

  #[test]
  fn place_order_choice_with_product_id_emits_action() {
    let mut m = menus();
    m.nodes.get_mut("main").unwrap().choices.insert(
      "6".into(),
      IvrChoice {
        goto: Some("main".into()),
        action: Some("place_order".into()),
        reply: None,
        product_id: Some("bound-9".into()),
      },
    );
    let s = fresh_session("dm:+1", &m, 1000);
    let r = step(s, "6", &m, 1000);
    assert_eq!(r.action.as_deref(), Some("place_order"));
    assert_eq!(r.session.slots.get("product_id").unwrap(), "bound-9");
    assert_eq!(r.session.node_id, "main");
  }

  #[test]
  fn validate_allows_offer_product() {
    let mut m = menus();
    m.nodes.get_mut("main").unwrap().choices.insert(
      "5".into(),
      IvrChoice {
        goto: Some("main".into()),
        action: Some("offer_product".into()),
        reply: None,
        product_id: Some("p1".into()),
      },
    );
    assert!(validate_menus(&m).is_ok());
  }

  #[test]
  fn missing_product_id_deserializes_as_none() {
    let raw = r#"{"goto":"browse","action":"list_catalog"}"#;
    let c: IvrChoice = serde_json::from_str(raw).unwrap();
    assert_eq!(c.goto.as_deref(), Some("browse"));
    assert!(c.product_id.is_none());
  }

  #[test]
  fn validate_demo_ok() {
    assert!(validate_menus(&menus()).is_ok());
  }

  #[test]
  fn allowlist_rules() {
    let mut s = IvrSettings::default();
    assert!(!thread_allowed(&s, "dm:+1"));
    s.enabled = true;
    assert!(!thread_allowed(&s, "dm:+1"));
    s.allowlist.push("dm:+1".into());
    assert!(thread_allowed(&s, "dm:+1"));
    assert!(!thread_allowed(&s, "group:abc"));
    s.require_allowlist = false;
    s.allowlist.clear();
    assert!(thread_allowed(&s, "dm:+2"));
  }
}
