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
    }
  }
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

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct IvrChoice {
  #[serde(default)]
  pub goto: Option<String>,
  #[serde(default)]
  pub action: Option<String>,
  #[serde(default)]
  pub reply: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct IvrAfterCapture {
  pub reply: String,
  pub goto: String,
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
        prompt: "Welcome — reply with a number:\n1 · Browse products\n2 · Leave a note\n3 · Talk to a person\n0 · Main menu".to_string(),
        choices: HashMap::from([
          ("1".into(), IvrChoice {
            goto: Some("browse".into()),
            action: Some("list_catalog".into()),
            reply: None,
          }),
          ("2".into(), IvrChoice { goto: Some("ask_note".into()), action: None, reply: None }),
          ("3".into(), IvrChoice {
            goto: None,
            action: Some("handoff".into()),
            reply: Some("A person will take it from here. Hang tight.".into()),
          }),
          ("0".into(), IvrChoice { goto: Some("main".into()), action: None, reply: None }),
          ("menu".into(), IvrChoice { goto: Some("main".into()), action: None, reply: None }),
          ("help".into(), IvrChoice { goto: Some("main".into()), action: None, reply: None }),
        ]),
        on_unknown: Some("Please reply with 1, 2, 3, or 0.".into()),
        capture_slot: None,
        after_capture: None,
      },
    );
    nodes.insert(
      "browse".to_string(),
      IvrNode {
        prompt: "Reply 0 for the main menu.".to_string(),
        choices: HashMap::from([
          ("0".into(), IvrChoice { goto: Some("main".into()), action: None, reply: None }),
          ("menu".into(), IvrChoice { goto: Some("main".into()), action: None, reply: None }),
        ]),
        on_unknown: Some("Reply 0 for the main menu.".into()),
        capture_slot: None,
        after_capture: None,
      },
    );
    nodes.insert(
      "info".to_string(),
      IvrNode {
        prompt: "SignalX shop bot (demo). Reply 0 for the main menu.".to_string(),
        choices: HashMap::from([
          ("0".into(), IvrChoice { goto: Some("main".into()), action: None, reply: None }),
          ("menu".into(), IvrChoice { goto: Some("main".into()), action: None, reply: None }),
        ]),
        on_unknown: Some("Reply 0 for the main menu.".into()),
        capture_slot: None,
        after_capture: None,
      },
    );
    nodes.insert(
      "ask_note".to_string(),
      IvrNode {
        prompt: "Type your note in one message.".to_string(),
        choices: HashMap::new(),
        on_unknown: None,
        capture_slot: Some("note".into()),
        after_capture: Some(IvrAfterCapture {
          reply: "Got it — thanks.".into(),
          goto: "main".into(),
        }),
      },
    );
    Self {
      version: 2,
      entry: "main".to_string(),
      session_ttl_ms: 1_800_000,
      nodes,
    }
  }
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
    session.slots.insert(slot.clone(), inbound.trim().to_string());
    if let Some(after) = &node.after_capture {
      let ack = after.reply.clone();
      let next_prompt = apply_goto(&mut session, menus, &after.goto, now);
      return IvrStepResult {
        reply: Some(format!("{}\n\n{}", ack, next_prompt)),
        session,
        handled: true,
        action: None,
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
    if action == "list_catalog" {
      if let Some(goto) = &choice.goto {
        session.node_id = goto.clone();
        touch(session, menus, now);
      }
      return Some(IvrStepResult {
        reply: None,
        session: session.clone(),
        handled: true,
        action: Some("list_catalog".into()),
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

#[derive(Clone)]
pub struct IvrStore {
  settings_path: PathBuf,
  menus_path: PathBuf,
  sessions_dir: PathBuf,
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
        Some(m) if m.version >= 2 => m,
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
      settings_path,
      menus_path,
      sessions_dir,
      settings: Arc::new(Mutex::new(settings)),
      menus: Arc::new(Mutex::new(menus)),
      sessions: Arc::new(Mutex::new(HashMap::new())),
    }
  }

  pub fn get_settings(&self) -> IvrSettings {
    self.settings.lock().unwrap().clone()
  }

  pub fn set_settings(&self, s: IvrSettings) -> Result<IvrSettings, String> {
    {
      *self.settings.lock().unwrap() = s.clone();
    }
    let json = serde_json::to_string_pretty(&s).map_err(|e| e.to_string())?;
    std::fs::write(&self.settings_path, json).map_err(|e| e.to_string())?;
    Ok(s)
  }

  pub fn menus(&self) -> IvrMenus {
    self.menus.lock().unwrap().clone()
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
    self.sessions_dir.join(format!("{}.json", safe))
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
    assert!(r.reply.unwrap().contains("person"));
    let r2 = step(r.session, "1", &m, 1001);
    assert!(r2.handled);
    assert!(r2.reply.is_none());
  }

  #[test]
  fn capture_note_then_main() {
    let m = menus();
    let s = fresh_session("dm:+1", &m, 1000);
    let r = step(s, "2", &m, 1000);
    assert_eq!(r.session.node_id, "ask_note");
    let r2 = step(r.session, "Need widgets Friday", &m, 1001);
    assert_eq!(r2.session.slots.get("note").unwrap(), "Need widgets Friday");
    assert_eq!(r2.session.node_id, "main");
    assert!(r2.reply.unwrap().contains("Got it"));
  }

  #[test]
  fn unknown_repeats_hint() {
    let m = menus();
    let s = fresh_session("dm:+1", &m, 1000);
    let r = step(s, "9", &m, 1000);
    assert!(r.reply.unwrap().contains("Please reply"));
    assert_eq!(r.session.node_id, "main");
  }

  #[test]
  fn expired_session_resets_to_entry() {
    let m = menus();
    let mut s = fresh_session("dm:+1", &m, 1000);
    s.node_id = "info".into();
    s.expires_at = 1500;
    let r = step(s, "1", &m, 2000);
    // after expiry, fresh session at main, then "1" -> browse + list_catalog
    assert_eq!(r.session.node_id, "browse");
    assert_eq!(r.action.as_deref(), Some("list_catalog"));
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
