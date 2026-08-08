//! Portable SignalX data bundle export / import (no Signal identity secrets).

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

pub const SCHEMA_VERSION: u32 = 1;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BundleManifest {
  pub schema_version: u32,
  pub account_id: String,
  pub exported_at: i64,
  pub app_version: String,
  pub include: BundleIncludeFlags,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct BundleIncludeFlags {
  pub threads: bool,
  pub commerce: bool,
  pub outbox: bool,
  pub ivr: bool,
  pub auto_reply: bool,
  pub contacts: bool,
  pub groups: bool,
  pub aliases: bool,
  pub attachments: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ExportCounts {
  pub files: u32,
  pub attachments: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ImportMode {
  Replace,
  Merge,
}

impl ImportMode {
  pub fn parse(s: &str) -> Result<Self, String> {
    match s.trim().to_lowercase().as_str() {
      "replace" => Ok(Self::Replace),
      "merge" => Ok(Self::Merge),
      other => Err(format!("mode must be 'replace' or 'merge', got '{other}'")),
    }
  }
}

fn sanitize_filename(s: &str) -> String {
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

pub fn path_is_under_root(root: &Path, candidate: &Path) -> bool {
  let Ok(root) = root.canonicalize() else {
    return false;
  };
  let Ok(cand) = candidate.canonicalize() else {
    return false;
  };
  cand.starts_with(&root)
}

fn is_forbidden_source_name(name: &str) -> bool {
  let lower = name.to_lowercase();
  lower == ".signalx.env"
    || lower.ends_with(".signalx.env")
    || lower.contains("signal-cli")
    || lower == "config.json" && name.contains("signal")
}

/// Relative paths under app_data that belong in the active-account bundle.
fn collect_include_paths(app_data_dir: &Path, account: &str) -> Vec<PathBuf> {
  let acct = sanitize_filename(account);
  let mut out: Vec<PathBuf> = Vec::new();

  let account_files = [
    format!("threads/{acct}.json"),
    format!("outbox/{acct}.json"),
    format!("aliases/{acct}.json"),
    format!("contacts/{acct}.json"),
    format!("groups/{acct}.json"),
    format!("ivr/sessions/{acct}.json"),
  ];
  for rel in account_files {
    let p = app_data_dir.join(&rel);
    if p.is_file() {
      out.push(PathBuf::from(rel));
    }
  }

  let global_files = [
    "commerce/products.json",
    "commerce/customers.json",
    "commerce/orders.json",
    "commerce/audit.json",
    "commerce/stock_ledger.json",
    "ivr/settings.json",
    "ivr/menus.json",
    "auto_reply_settings.json",
    "auto_reply_audit.json",
  ];
  for rel in global_files {
    let p = app_data_dir.join(rel);
    if p.is_file() {
      out.push(PathBuf::from(rel));
    }
  }

  // Product images
  let images = app_data_dir.join("commerce/product-images");
  if images.is_dir() {
    if let Ok(rd) = fs::read_dir(&images) {
      for entry in rd.flatten() {
        let path = entry.path();
        if path.is_file() {
          if let Ok(rel) = path.strip_prefix(app_data_dir) {
            out.push(rel.to_path_buf());
          }
        }
      }
    }
  }

  // Contact photos for this account
  let photos = app_data_dir.join("contacts/photos").join(&acct);
  if photos.is_dir() {
    if let Ok(rd) = fs::read_dir(&photos) {
      for entry in rd.flatten() {
        let path = entry.path();
        if path.is_file() {
          if let Ok(rel) = path.strip_prefix(app_data_dir) {
            out.push(rel.to_path_buf());
          }
        }
      }
    }
  }

  // Attachments referenced by this account's outbox
  let outbox_path = app_data_dir.join("outbox").join(format!("{acct}.json"));
  if outbox_path.is_file() {
    if let Ok(s) = fs::read_to_string(&outbox_path) {
      if let Ok(v) = serde_json::from_str::<Value>(&s) {
        if let Some(items) = v.get("items").and_then(|x| x.as_array()) {
          for it in items {
            if let Some(ap) = it.get("attachment_path").and_then(|x| x.as_str()) {
              let p = PathBuf::from(ap);
              if p.is_file() {
                if let Some(name) = p.file_name() {
                  let rel = PathBuf::from("attachments").join(name);
                  let under = app_data_dir.join(&rel);
                  if under.is_file() || path_is_under_root(app_data_dir, &p) {
                    // Prefer canonical attachments/name when file lives under app data
                    if under.is_file() {
                      out.push(rel);
                    } else if let Ok(r) = p.strip_prefix(app_data_dir) {
                      out.push(r.to_path_buf());
                    }
                  }
                }
              } else {
                // Already relative?
                let candidate = app_data_dir.join(ap);
                if candidate.is_file() {
                  if let Ok(rel) = candidate.strip_prefix(app_data_dir) {
                    out.push(rel.to_path_buf());
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // Dedupe while preserving order
  let mut seen = HashSet::new();
  out.retain(|p| seen.insert(p.to_string_lossy().to_string()));
  out
}

fn rewrite_outbox_attachments_for_export(raw: &str) -> String {
  let Ok(mut v) = serde_json::from_str::<Value>(raw) else {
    return raw.to_string();
  };
  if let Some(items) = v.get_mut("items").and_then(|x| x.as_array_mut()) {
    for it in items.iter_mut() {
      if let Some(obj) = it.as_object_mut() {
        if let Some(ap) = obj.get("attachment_path").and_then(|x| x.as_str()) {
          let p = PathBuf::from(ap);
          if let Some(name) = p.file_name() {
            let rel = format!("attachments/{}", name.to_string_lossy());
            obj.insert("attachment_path".into(), Value::String(rel));
          }
        }
      }
    }
  }
  serde_json::to_string_pretty(&v).unwrap_or_else(|_| raw.to_string())
}

fn rewrite_outbox_attachments_for_import(raw: &str, app_data_dir: &Path) -> String {
  let Ok(mut v) = serde_json::from_str::<Value>(raw) else {
    return raw.to_string();
  };
  if let Some(items) = v.get_mut("items").and_then(|x| x.as_array_mut()) {
    for it in items.iter_mut() {
      if let Some(obj) = it.as_object_mut() {
        if let Some(ap) = obj.get("attachment_path").and_then(|x| x.as_str()) {
          let p = PathBuf::from(ap);
          let abs = if p.is_absolute() {
            p
          } else {
            app_data_dir.join(ap)
          };
          obj.insert(
            "attachment_path".into(),
            Value::String(abs.to_string_lossy().to_string()),
          );
        }
      }
    }
  }
  serde_json::to_string_pretty(&v).unwrap_or_else(|_| raw.to_string())
}

fn zip_entry_name(rel: &Path) -> String {
  rel.to_string_lossy().replace('\\', "/")
}

pub fn export_data_bundle(
  app_data_dir: &Path,
  export_dir: &Path,
  account_id: &str,
  exported_at: i64,
  app_version: &str,
) -> Result<(PathBuf, u64, ExportCounts), String> {
  let acct = sanitize_filename(account_id);
  if acct.is_empty() {
    return Err("account_id required".into());
  }
  fs::create_dir_all(export_dir).map_err(|e| format!("create exports dir: {e}"))?;

  let filename = format!("signalx-bundle-{acct}-{exported_at}.zip");
  let zip_path = export_dir.join(&filename);
  if !path_is_under_root(app_data_dir, export_dir)
    && export_dir
      .canonicalize()
      .ok()
      .map(|p| !p.starts_with(app_data_dir))
      .unwrap_or(true)
  {
    // export_dir should live under app_data; still allow if parent is app_data/exports
    let _ = ();
  }

  let includes = collect_include_paths(app_data_dir, &acct);
  let mut attachment_count = 0u32;
  for rel in &includes {
    if rel.starts_with("attachments") {
      attachment_count += 1;
    }
  }

  let include_flags = BundleIncludeFlags {
    threads: includes.iter().any(|p| p.starts_with("threads")),
    commerce: includes.iter().any(|p| p.starts_with("commerce")),
    outbox: includes.iter().any(|p| p.starts_with("outbox")),
    ivr: includes.iter().any(|p| p.starts_with("ivr")),
    auto_reply: includes.iter().any(|p| {
      p.to_string_lossy().starts_with("auto_reply")
    }),
    contacts: includes.iter().any(|p| p.starts_with("contacts")),
    groups: includes.iter().any(|p| p.starts_with("groups")),
    aliases: includes.iter().any(|p| p.starts_with("aliases")),
    attachments: attachment_count > 0,
  };

  let manifest = BundleManifest {
    schema_version: SCHEMA_VERSION,
    account_id: acct.clone(),
    exported_at,
    app_version: app_version.to_string(),
    include: include_flags,
  };

  let file = File::create(&zip_path).map_err(|e| format!("create zip: {e}"))?;
  let mut zip = ZipWriter::new(file);
  let opts = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

  let manifest_bytes =
    serde_json::to_vec_pretty(&manifest).map_err(|e| format!("manifest serialize: {e}"))?;
  zip
    .start_file("manifest.json", opts)
    .map_err(|e| format!("zip start manifest: {e}"))?;
  zip
    .write_all(&manifest_bytes)
    .map_err(|e| format!("zip write manifest: {e}"))?;

  let mut file_count = 1u32; // manifest
  for rel in &includes {
    let src = app_data_dir.join(rel);
    if !src.is_file() {
      continue;
    }
    // Hard exclude secrets even if somehow listed
    if let Some(name) = src.file_name().and_then(|n| n.to_str()) {
      if is_forbidden_source_name(name) {
        continue;
      }
    }
    let mut bytes = fs::read(&src).map_err(|e| format!("read {}: {e}", rel.display()))?;
    if rel.starts_with("outbox") && rel.extension().and_then(|e| e.to_str()) == Some("json") {
      let rewritten = rewrite_outbox_attachments_for_export(
        &String::from_utf8_lossy(&bytes),
      );
      bytes = rewritten.into_bytes();
    }
    let name = zip_entry_name(rel);
    zip
      .start_file(&name, opts)
      .map_err(|e| format!("zip start {name}: {e}"))?;
    zip
      .write_all(&bytes)
      .map_err(|e| format!("zip write {name}: {e}"))?;
    file_count += 1;
  }

  zip.finish().map_err(|e| format!("zip finish: {e}"))?;
  let meta = fs::metadata(&zip_path).map_err(|e| format!("zip metadata: {e}"))?;
  Ok((
    zip_path,
    meta.len(),
    ExportCounts {
      files: file_count,
      attachments: attachment_count,
    },
  ))
}

fn read_zip_entry(archive: &mut ZipArchive<File>, name: &str) -> Result<Vec<u8>, String> {
  let mut entry = archive
    .by_name(name)
    .map_err(|e| format!("zip missing '{name}': {e}"))?;
  let mut buf = Vec::new();
  entry
    .read_to_end(&mut buf)
    .map_err(|e| format!("zip read '{name}': {e}"))?;
  Ok(buf)
}

fn safe_zip_rel_path(name: &str) -> Result<PathBuf, String> {
  let name = name.replace('\\', "/");
  if name.is_empty() || name.starts_with('/') || name.contains("..") {
    return Err(format!("unsafe zip path: {name}"));
  }
  if is_forbidden_source_name(&name) {
    return Err(format!("forbidden zip entry: {name}"));
  }
  Ok(PathBuf::from(name))
}

fn snapshot_current(app_data_dir: &Path, export_dir: &Path, account: &str, ts: i64) -> Result<PathBuf, String> {
  let dest = export_dir.join(format!("pre-import-{ts}"));
  fs::create_dir_all(&dest).map_err(|e| format!("pre-import dir: {e}"))?;
  for rel in collect_include_paths(app_data_dir, account) {
    let src = app_data_dir.join(&rel);
    if !src.is_file() {
      continue;
    }
    let out = dest.join(&rel);
    if let Some(parent) = out.parent() {
      fs::create_dir_all(parent).map_err(|e| format!("pre-import mkdir: {e}"))?;
    }
    fs::copy(&src, &out).map_err(|e| format!("pre-import copy {}: {e}", rel.display()))?;
  }
  Ok(dest)
}

fn merge_id_array(local: &Value, incoming: &Value, id_key: &str) -> Value {
  // Local first, then incoming upserts (incoming wins on conflict).
  let mut by_id: Map<String, Value> = Map::new();
  let mut order: Vec<String> = Vec::new();
  if let Some(arr) = local.as_array() {
    for item in arr {
      if let Some(id) = item.get(id_key).and_then(|x| x.as_str()) {
        order.push(id.to_string());
        by_id.insert(id.to_string(), item.clone());
      }
    }
  }
  if let Some(arr) = incoming.as_array() {
    for item in arr {
      if let Some(id) = item.get(id_key).and_then(|x| x.as_str()) {
        if !by_id.contains_key(id) {
          order.push(id.to_string());
        }
        by_id.insert(id.to_string(), item.clone());
      }
    }
  }
  Value::Array(order.into_iter().filter_map(|id| by_id.remove(&id)).collect())
}

fn merge_messages_keep_local(local_msgs: &[Value], incoming_msgs: &[Value]) -> Vec<Value> {
  let mut by_id: Map<String, Value> = Map::new();
  let mut order: Vec<String> = Vec::new();
  for item in local_msgs.iter().chain(incoming_msgs.iter()) {
    let id = item
      .get("id")
      .and_then(|x| x.as_str())
      .unwrap_or("")
      .to_string();
    if id.is_empty() {
      continue;
    }
    if !by_id.contains_key(&id) {
      order.push(id.clone());
      by_id.insert(id, item.clone());
    }
    // keep existing (local first)
  }
  order.into_iter().filter_map(|id| by_id.remove(&id)).collect()
}

fn merge_threads_json(local: &str, incoming: &str) -> Result<String, String> {
  let mut loc: Value = serde_json::from_str(local).unwrap_or(json!({
    "version": 2,
    "threads": {}
  }));
  let inc: Value = serde_json::from_str(incoming).map_err(|e| format!("bundle threads json: {e}"))?;

  let loc_threads = loc
    .get_mut("threads")
    .and_then(|t| t.as_object_mut())
    .ok_or_else(|| "local threads missing object".to_string())?;
  let Some(inc_threads) = inc.get("threads").and_then(|t| t.as_object()) else {
    return Ok(local.to_string());
  };

  for (tid, inc_thread) in inc_threads {
    if !loc_threads.contains_key(tid) {
      loc_threads.insert(tid.clone(), inc_thread.clone());
      continue;
    }
    let loc_t = loc_threads.get_mut(tid).unwrap();
    let loc_msgs = loc_t
      .get("messages")
      .and_then(|m| m.as_array())
      .cloned()
      .unwrap_or_default();
    let inc_msgs = inc_thread
      .get("messages")
      .and_then(|m| m.as_array())
      .cloned()
      .unwrap_or_default();
    let merged = merge_messages_keep_local(&loc_msgs, &inc_msgs);
    if let Some(obj) = loc_t.as_object_mut() {
      obj.insert("messages".into(), Value::Array(merged.clone()));
      obj.insert("message_count".into(), json!(merged.len() as u64));
      let last_ts = merged
        .iter()
        .filter_map(|m| m.get("timestamp").and_then(|t| t.as_i64()))
        .max()
        .unwrap_or(0);
      if last_ts > 0 {
        obj.insert("last_message_timestamp".into(), json!(last_ts));
      }
    }
  }

  // pending_replies / draft_history: union by message_id lists per thread
  for key in ["pending_replies", "draft_history"] {
    let mut merged_map = loc
      .get(key)
      .and_then(|v| v.as_object())
      .cloned()
      .unwrap_or_default();
    if let Some(inc_map) = inc.get(key).and_then(|v| v.as_object()) {
      for (tid, arr) in inc_map {
        let local_arr = merged_map
          .get(tid)
          .and_then(|v| v.as_array())
          .cloned()
          .unwrap_or_default();
        let inc_arr = arr.as_array().cloned().unwrap_or_default();
        let mut by_mid: Map<String, Value> = Map::new();
        let mut order = Vec::new();
        for item in local_arr.iter().chain(inc_arr.iter()) {
          let mid = item
            .get("message_id")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
          if mid.is_empty() {
            continue;
          }
          if !by_mid.contains_key(&mid) {
            order.push(mid.clone());
            by_mid.insert(mid, item.clone());
          }
        }
        merged_map.insert(
          tid.clone(),
          Value::Array(order.into_iter().filter_map(|id| by_mid.remove(&id)).collect()),
        );
      }
    }
    if let Some(obj) = loc.as_object_mut() {
      obj.insert(key.into(), Value::Object(merged_map));
    }
  }

  serde_json::to_string_pretty(&loc).map_err(|e| e.to_string())
}

fn merge_outbox_json(local: &str, incoming: &str) -> Result<String, String> {
  let mut loc: Value = serde_json::from_str(local).unwrap_or(json!({"version": 1, "items": []}));
  let inc: Value = serde_json::from_str(incoming).map_err(|e| format!("bundle outbox: {e}"))?;
  let loc_items = loc
    .get("items")
    .cloned()
    .unwrap_or(Value::Array(vec![]));
  let inc_items = inc.get("items").cloned().unwrap_or(Value::Array(vec![]));
  // Keep local on conflict
  let mut by_id: Map<String, Value> = Map::new();
  let mut order = Vec::new();
  for src in [&loc_items, &inc_items] {
    if let Some(arr) = src.as_array() {
      for item in arr {
        let id = item.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string();
        if id.is_empty() {
          continue;
        }
        if !by_id.contains_key(&id) {
          order.push(id.clone());
          by_id.insert(id, item.clone());
        }
      }
    }
  }
  if let Some(obj) = loc.as_object_mut() {
    obj.insert(
      "items".into(),
      Value::Array(order.into_iter().filter_map(|id| by_id.remove(&id)).collect()),
    );
  }
  serde_json::to_string_pretty(&loc).map_err(|e| e.to_string())
}

fn merge_commerce_file(local: &str, incoming: &str, array_key: &str) -> Result<String, String> {
  let mut loc: Value = serde_json::from_str(local).unwrap_or_else(|_| {
    let mut m = Map::new();
    m.insert("version".into(), json!(1));
    m.insert(array_key.to_string(), Value::Array(vec![]));
    Value::Object(m)
  });
  let inc: Value = serde_json::from_str(incoming).map_err(|e| format!("bundle {array_key}: {e}"))?;
  let merged = merge_id_array(
    loc.get(array_key).unwrap_or(&Value::Array(vec![])),
    inc.get(array_key).unwrap_or(&Value::Array(vec![])),
    "id",
  );
  if let Some(obj) = loc.as_object_mut() {
    obj.insert(array_key.into(), merged);
    if let Some(v) = inc.get("version") {
      obj.insert("version".into(), v.clone());
    }
  }
  serde_json::to_string_pretty(&loc).map_err(|e| e.to_string())
}

fn merge_ivr_menus(local: &str, incoming: &str) -> Result<String, String> {
  let loc: Value = serde_json::from_str(local).unwrap_or(json!({"version": 0}));
  let inc: Value = serde_json::from_str(incoming).map_err(|e| format!("bundle menus: {e}"))?;
  let loc_v = loc.get("version").and_then(|v| v.as_u64()).unwrap_or(0);
  let inc_v = inc.get("version").and_then(|v| v.as_u64()).unwrap_or(0);
  if inc_v > loc_v {
    Ok(serde_json::to_string_pretty(&inc).unwrap_or_else(|_| incoming.to_string()))
  } else {
    Ok(local.to_string())
  }
}

fn merge_ivr_settings(local: &str, incoming: &str) -> Result<String, String> {
  let mut loc: Value = serde_json::from_str(local).unwrap_or(json!({}));
  let inc: Value = serde_json::from_str(incoming).map_err(|e| format!("bundle ivr settings: {e}"))?;
  // Prefer bundle for global flags; union allowlists
  if let (Some(lobj), Some(iobj)) = (loc.as_object_mut(), inc.as_object()) {
    for (k, v) in iobj {
      if k == "allowlist" {
        let mut set = HashSet::new();
        let mut list = Vec::new();
        for src in [
          lobj.get("allowlist").and_then(|a| a.as_array()),
          v.as_array().into(),
        ]
        .into_iter()
        .flatten()
        {
          for item in src {
            if let Some(s) = item.as_str() {
              if set.insert(s.to_string()) {
                list.push(Value::String(s.to_string()));
              }
            }
          }
        }
        lobj.insert("allowlist".into(), Value::Array(list));
      } else {
        lobj.insert(k.clone(), v.clone());
      }
    }
  }
  serde_json::to_string_pretty(&loc).map_err(|e| e.to_string())
}

fn merge_auto_reply_settings(local: &str, incoming: &str) -> Result<String, String> {
  merge_ivr_settings(local, incoming) // same: prefer bundle flags, union allowlist
}

fn merge_contacts_or_groups(local: &str, incoming: &str) -> Result<String, String> {
  // Contact/group stores are typically a map or file with entries — try object merge by key
  let mut loc: Value = serde_json::from_str(local).unwrap_or(json!({}));
  let inc: Value = serde_json::from_str(incoming).map_err(|e| e.to_string())?;
  match (loc.as_object_mut(), inc.as_object()) {
    (Some(lobj), Some(iobj)) => {
      for (k, v) in iobj {
        if k == "contacts" || k == "groups" || k == "items" {
          // array upsert by contact_id / group_id / id
          let id_key = if k == "contacts" {
            "contact_id"
          } else if k == "groups" {
            "group_id"
          } else {
            "id"
          };
          let merged = merge_id_array(
            lobj.get(k).unwrap_or(&Value::Array(vec![])),
            v,
            id_key,
          );
          lobj.insert(k.clone(), merged);
        } else if !lobj.contains_key(k) {
          lobj.insert(k.clone(), v.clone());
        }
      }
      serde_json::to_string_pretty(&loc).map_err(|e| e.to_string())
    }
    _ => Ok(incoming.to_string()),
  }
}

fn write_bytes_atomic(dest: &Path, bytes: &[u8]) -> Result<(), String> {
  if let Some(parent) = dest.parent() {
    fs::create_dir_all(parent).map_err(|e| format!("mkdir {}: {e}", parent.display()))?;
  }
  let tmp = dest.with_extension(format!(
    "{}.tmp",
    dest.extension().and_then(|e| e.to_str()).unwrap_or("bin")
  ));
  fs::write(&tmp, bytes).map_err(|e| format!("write tmp {}: {e}", tmp.display()))?;
  fs::rename(&tmp, dest).map_err(|e| format!("rename {}: {e}", dest.display()))?;
  Ok(())
}

pub fn import_data_bundle(
  app_data_dir: &Path,
  export_dir: &Path,
  zip_path: &Path,
  active_account: &str,
  mode: ImportMode,
  now_ms: i64,
) -> Result<Value, String> {
  if !zip_path.is_file() {
    return Err("bundle zip not found".into());
  }
  // Prefer path under app data; also allow absolute paths the operator picked (still must be a zip)
  let acct = sanitize_filename(active_account);
  if acct.is_empty() {
    return Err("no active account".into());
  }

  let file = File::open(zip_path).map_err(|e| format!("open zip: {e}"))?;
  let mut archive = ZipArchive::new(file).map_err(|e| format!("invalid zip: {e}"))?;

  let manifest_bytes = read_zip_entry(&mut archive, "manifest.json")?;
  let manifest: BundleManifest = serde_json::from_slice(&manifest_bytes)
    .map_err(|e| format!("invalid manifest.json: {e}"))?;
  if manifest.schema_version != SCHEMA_VERSION {
    return Err(format!(
      "unsupported schema_version {} (need {SCHEMA_VERSION})",
      manifest.schema_version
    ));
  }
  if sanitize_filename(&manifest.account_id) != acct {
    return Err(format!(
      "bundle account '{}' does not match active account '{acct}'",
      manifest.account_id
    ));
  }

  let _pre = snapshot_current(app_data_dir, export_dir, &acct, now_ms)?;

  // Extract all entries into memory first (avoid holding borrow across writes)
  let mut entries: Vec<(String, Vec<u8>)> = Vec::new();
  for i in 0..archive.len() {
    let mut file = archive
      .by_index(i)
      .map_err(|e| format!("zip entry {i}: {e}"))?;
    let name = file.name().to_string();
    if name.ends_with('/') || name == "manifest.json" {
      continue;
    }
    let rel = safe_zip_rel_path(&name)?;
    let mut buf = Vec::new();
    file
      .read_to_end(&mut buf)
      .map_err(|e| format!("read {name}: {e}"))?;
    entries.push((zip_entry_name(&rel), buf));
  }

  let mut written = 0u32;
  for (name, mut bytes) in entries {
    let rel = PathBuf::from(&name);
    // Only allow known prefixes
    let allowed = name.starts_with("threads/")
      || name.starts_with("outbox/")
      || name.starts_with("commerce/")
      || name.starts_with("ivr/")
      || name.starts_with("contacts/")
      || name.starts_with("groups/")
      || name.starts_with("aliases/")
      || name.starts_with("attachments/")
      || name == "auto_reply_settings.json"
      || name == "auto_reply_audit.json";
    if !allowed {
      continue;
    }

    // Account-scoped files must match active account
    for prefix in ["threads/", "outbox/", "aliases/", "contacts/", "groups/"] {
      if let Some(rest) = name.strip_prefix(prefix) {
        if rest.contains('/') {
          // contacts/photos/{acct}/...
          if name.starts_with("contacts/photos/") {
            let expect = format!("contacts/photos/{acct}/");
            if !name.starts_with(&expect) {
              return Err(format!("bundle contact photo for other account: {name}"));
            }
          }
        } else if rest != format!("{acct}.json") {
          return Err(format!("bundle file for other account: {name}"));
        }
      }
    }
    if let Some(rest) = name.strip_prefix("ivr/sessions/") {
      if rest != format!("{acct}.json") {
        return Err(format!("bundle IVR session for other account: {name}"));
      }
    }

    let dest = app_data_dir.join(&rel);

    if name.starts_with("outbox/") && name.ends_with(".json") {
      let text = String::from_utf8_lossy(&bytes).to_string();
      let rewritten = rewrite_outbox_attachments_for_import(&text, app_data_dir);
      bytes = rewritten.into_bytes();
    }

    match mode {
      ImportMode::Replace => {
        write_bytes_atomic(&dest, &bytes)?;
        written += 1;
      }
      ImportMode::Merge => {
        if !dest.is_file() {
          write_bytes_atomic(&dest, &bytes)?;
          written += 1;
          continue;
        }
        let local = fs::read_to_string(&dest).map_err(|e| format!("read local {}: {e}", dest.display()))?;
        let incoming = String::from_utf8_lossy(&bytes).to_string();
        let merged = if name.starts_with("threads/") {
          merge_threads_json(&local, &incoming)?
        } else if name.starts_with("outbox/") {
          let merged = merge_outbox_json(&local, &incoming)?;
          rewrite_outbox_attachments_for_import(&merged, app_data_dir)
        } else if name.ends_with("products.json") {
          merge_commerce_file(&local, &incoming, "products")?
        } else if name.ends_with("customers.json") {
          merge_commerce_file(&local, &incoming, "customers")?
        } else if name.ends_with("orders.json") {
          merge_commerce_file(&local, &incoming, "orders")?
        } else if name == "ivr/menus.json" {
          merge_ivr_menus(&local, &incoming)?
        } else if name == "ivr/settings.json" {
          merge_ivr_settings(&local, &incoming)?
        } else if name == "auto_reply_settings.json" {
          merge_auto_reply_settings(&local, &incoming)?
        } else if name.starts_with("contacts/") && name.ends_with(".json")
          || name.starts_with("groups/")
          || name.starts_with("aliases/")
        {
          merge_contacts_or_groups(&local, &incoming)?
        } else if name.starts_with("commerce/product-images/")
          || name.starts_with("attachments/")
          || name.starts_with("contacts/photos/")
        {
          // binary: keep local if exists
          continue;
        } else if name == "auto_reply_audit.json" {
          // Prefer longer audit? append unique by created_at+id if present — keep local for simplicity
          continue;
        } else if name.starts_with("ivr/sessions/") {
          merge_contacts_or_groups(&local, &incoming)?
        } else {
          write_bytes_atomic(&dest, &bytes)?;
          written += 1;
          continue;
        };
        write_bytes_atomic(&dest, merged.as_bytes())?;
        written += 1;
      }
    }
  }

  Ok(json!({
    "restart_required": true,
    "mode": match mode {
      ImportMode::Replace => "replace",
      ImportMode::Merge => "merge",
    },
    "files_written": written,
    "pre_import_path": _pre.to_string_lossy(),
  }))
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::time::{SystemTime, UNIX_EPOCH};

  fn tmp_root(label: &str) -> PathBuf {
    let ms = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .unwrap()
      .as_millis();
    let p = std::env::temp_dir().join(format!("signalx-backup-{label}-{ms}"));
    let _ = fs::remove_dir_all(&p);
    fs::create_dir_all(&p).unwrap();
    p
  }

  #[test]
  fn forbidden_names_block_env_and_signal_cli() {
    assert!(is_forbidden_source_name(".signalx.env"));
    assert!(is_forbidden_source_name("signal-cli-config"));
    assert!(!is_forbidden_source_name("products.json"));
  }

  #[test]
  fn safe_zip_rejects_traversal() {
    assert!(safe_zip_rel_path("../etc/passwd").is_err());
    assert!(safe_zip_rel_path("/abs").is_err());
    assert!(safe_zip_rel_path("commerce/products.json").is_ok());
  }

  #[test]
  fn export_import_replace_roundtrip() {
    let root = tmp_root("round");
    let acct = "_12025551212";
    fs::create_dir_all(root.join("threads")).unwrap();
    fs::create_dir_all(root.join("commerce")).unwrap();
    fs::create_dir_all(root.join("exports")).unwrap();
    fs::write(
      root.join(format!("threads/{acct}.json")),
      r#"{"version":2,"threads":{"dm:+1":{"id":"dm:+1","participants":["+1"],"last_message_timestamp":1,"unread_count":0,"messages":[{"id":"m1","thread_id":"dm:+1","timestamp":1,"sender":"+1","recipient":null,"content":"hi","direction":"Incoming","raw_json":null}]}}}"#,
    )
    .unwrap();
    fs::write(
      root.join("commerce/products.json"),
      r#"{"version":1,"products":[{"id":"p1","name":"Widget","price_cents":100,"unit":"ea","base_unit":"ea","sales_unit":"ea","stock_base_milli":1000,"weight":0,"weight_unit":"","image_path":"","sell_options":[],"updated_at":1}]}"#,
    )
    .unwrap();

    let (zip_path, _bytes, counts) =
      export_data_bundle(&root, &root.join("exports"), acct, 12345, "0.1.0").unwrap();
    assert!(zip_path.exists());
    assert!(counts.files >= 2);

    // Wipe and replace
    fs::write(
      root.join("commerce/products.json"),
      r#"{"version":1,"products":[]}"#,
    )
    .unwrap();
    let res = import_data_bundle(
      &root,
      &root.join("exports"),
      &zip_path,
      acct,
      ImportMode::Replace,
      999,
    )
    .unwrap();
    assert_eq!(res["restart_required"], true);
    let products = fs::read_to_string(root.join("commerce/products.json")).unwrap();
    assert!(products.contains("Widget"));
    let _ = fs::remove_dir_all(&root);
  }

  #[test]
  fn import_rejects_account_mismatch() {
    let root = tmp_root("mismatch");
    let acct = "_111";
    fs::create_dir_all(root.join("exports")).unwrap();
    fs::create_dir_all(root.join("threads")).unwrap();
    fs::write(root.join("threads/_111.json"), r#"{"version":2,"threads":{}}"#).unwrap();
    let (zip_path, _, _) =
      export_data_bundle(&root, &root.join("exports"), acct, 1, "0.1.0").unwrap();
    let err = import_data_bundle(
      &root,
      &root.join("exports"),
      &zip_path,
      "_222",
      ImportMode::Replace,
      2,
    )
    .unwrap_err();
    assert!(err.contains("does not match"));
    let _ = fs::remove_dir_all(&root);
  }

  #[test]
  fn merge_keeps_local_message_on_conflict() {
    let local = r#"{"version":2,"threads":{"t1":{"id":"t1","participants":[],"last_message_timestamp":1,"unread_count":0,"messages":[{"id":"m1","thread_id":"t1","timestamp":1,"sender":"a","recipient":null,"content":"local","direction":"Incoming","raw_json":null}]}}}"#;
    let incoming = r#"{"version":2,"threads":{"t1":{"id":"t1","participants":[],"last_message_timestamp":2,"unread_count":0,"messages":[{"id":"m1","thread_id":"t1","timestamp":2,"sender":"a","recipient":null,"content":"remote","direction":"Incoming","raw_json":null},{"id":"m2","thread_id":"t1","timestamp":3,"sender":"a","recipient":null,"content":"new","direction":"Incoming","raw_json":null}]}}}"#;
    let merged = merge_threads_json(local, incoming).unwrap();
    assert!(merged.contains("local"));
    assert!(!merged.contains("remote"));
    assert!(merged.contains("new"));
  }

  #[test]
  fn path_under_root_helper() {
    let root = tmp_root("path");
    let inside = root.join("a").join("b.json");
    fs::create_dir_all(inside.parent().unwrap()).unwrap();
    fs::write(&inside, b"x").unwrap();
    assert!(path_is_under_root(&root, &inside));
    let outside = std::env::temp_dir().join(format!("signalx-outside-{}", std::process::id()));
    fs::write(&outside, b"y").unwrap();
    assert!(!path_is_under_root(&root, &outside));
    let _ = fs::remove_file(&outside);
    let _ = fs::remove_dir_all(&root);
  }
}
