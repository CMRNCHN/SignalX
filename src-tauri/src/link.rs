//! In-app secondary device link via `signal-cli link`.
//! One session at a time; URI streamed from stdout; cancel kills the child.

use serde::Serialize;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

const DEVICE_NAME: &str = "SignalX";

#[derive(Clone, Debug, Serialize)]
pub struct DeviceLinkStatus {
  pub state: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub message: Option<String>,
}

/// Extract a provisioning URI from a signal-cli output line.
pub fn extract_link_uri(line: &str) -> Option<String> {
  let line = line.trim().trim_matches('\r');
  if line.is_empty() {
    return None;
  }
  for marker in ["sgnl://linkdevice", "tsdevice:/"] {
    if let Some(idx) = line.find(marker) {
      let candidate = line[idx..]
        .split_whitespace()
        .next()
        .unwrap_or("")
        .trim_matches(|c| c == '"' || c == '\'' || c == ')' || c == ',' || c == ';');
      if !candidate.is_empty() {
        return Some(candidate.to_string());
      }
    }
  }
  None
}

#[derive(Clone, Default)]
pub struct DeviceLinkManager {
  child: Arc<Mutex<Option<Child>>>,
  cancelled: Arc<AtomicBool>,
}

impl DeviceLinkManager {
  pub fn new() -> Self {
    Self::default()
  }

  pub fn is_running(&self) -> bool {
    self.child.lock().unwrap().is_some()
  }

  /// Spawn `signal-cli --config <config> link -n SignalX` and stream URI/status via callbacks.
  pub fn start<FUri, FStatus>(
    &self,
    bin: &str,
    config: &str,
    on_uri: FUri,
    on_status: FStatus,
  ) -> Result<(), String>
  where
    FUri: Fn(String) + Send + 'static,
    FStatus: Fn(DeviceLinkStatus) + Send + 'static,
  {
    let mut slot = self.child.lock().unwrap();
    if slot.is_some() {
      return Err("A device link session is already running".into());
    }

    self.cancelled.store(false, Ordering::SeqCst);

    let mut child = Command::new(bin)
      .arg("--config")
      .arg(config)
      .arg("link")
      .arg("-n")
      .arg(DEVICE_NAME)
      .stdout(Stdio::piped())
      .stderr(Stdio::piped())
      .spawn()
      .map_err(|e| format!("failed to start signal-cli link: {}", e))?;

    let stdout = child
      .stdout
      .take()
      .ok_or_else(|| "signal-cli link: missing stdout pipe".to_string())?;
    let stderr = child
      .stderr
      .take()
      .ok_or_else(|| "signal-cli link: missing stderr pipe".to_string())?;

    *slot = Some(child);
    drop(slot);

    let child_slot = self.child.clone();
    let cancelled = self.cancelled.clone();

    thread::spawn(move || {
      let err_buf = Arc::new(Mutex::new(String::new()));
      {
        let err_buf = err_buf.clone();
        thread::spawn(move || {
          for line in BufReader::new(stderr).lines().flatten() {
            let mut e = err_buf.lock().unwrap();
            if e.len() < 4000 {
              e.push_str(&line);
              e.push('\n');
            }
          }
        });
      }

      for line in BufReader::new(stdout).lines().flatten() {
        if let Some(uri) = extract_link_uri(&line) {
          on_uri(uri);
        }
      }

      let wait_res = {
        let mut slot = child_slot.lock().unwrap();
        slot.take().map(|mut c| c.wait())
      };

      let was_cancelled = cancelled.load(Ordering::SeqCst);
      let stderr_tail = err_buf.lock().unwrap().trim().to_string();

      let status = if was_cancelled {
        DeviceLinkStatus {
          state: "cancelled".into(),
          message: Some("Link cancelled".into()),
        }
      } else {
        match wait_res {
          Some(Ok(st)) if st.success() => DeviceLinkStatus {
            state: "success".into(),
            message: Some("Device linked successfully. Restart the app if receive does not start.".into()),
          },
          Some(Ok(st)) => {
            let msg = if stderr_tail.is_empty() {
              format!("signal-cli link exited with status {}", st)
            } else {
              stderr_tail
            };
            DeviceLinkStatus {
              state: "error".into(),
              message: Some(msg),
            }
          }
          Some(Err(e)) => DeviceLinkStatus {
            state: "error".into(),
            message: Some(format!("failed waiting for signal-cli link: {}", e)),
          },
          None => DeviceLinkStatus {
            state: "error".into(),
            message: Some("link session ended unexpectedly".into()),
          },
        }
      };

      on_status(status);
    });

    Ok(())
  }

  pub fn cancel(&self) -> Result<(), String> {
    self.cancelled.store(true, Ordering::SeqCst);
    let mut slot = self.child.lock().unwrap();
    if let Some(ref mut child) = *slot {
      let _ = child.kill();
      Ok(())
    } else {
      Err("No device link session is running".into())
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn extracts_sgnl_uri_from_plain_line() {
    let u = extract_link_uri("sgnl://linkdevice?uuid=abc&pub_key=xyz").unwrap();
    assert_eq!(u, "sgnl://linkdevice?uuid=abc&pub_key=xyz");
  }

  #[test]
  fn extracts_uri_embedded_in_noise() {
    let u = extract_link_uri("INFO: use sgnl://linkdevice?uuid=1&pub_key=2 now").unwrap();
    assert_eq!(u, "sgnl://linkdevice?uuid=1&pub_key=2");
  }

  #[test]
  fn extracts_legacy_tsdevice() {
    let u = extract_link_uri("tsdevice:/?uuid=old&pub_key=key").unwrap();
    assert_eq!(u, "tsdevice:/?uuid=old&pub_key=key");
  }

  #[test]
  fn ignores_unrelated_lines() {
    assert!(extract_link_uri("hello world").is_none());
    assert!(extract_link_uri("").is_none());
  }
}
