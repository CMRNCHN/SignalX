//! Orders and simple invoice text for Signal sales.

use crate::commerce::CommerceStore;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OrderLineInput {
  pub product_id: String,
  /// Amount in `unit` (or sell-option amount when `sell_option_id` is set).
  pub quantity: f64,
  /// Sales unit; empty → product sales_unit / base_unit.
  #[serde(default)]
  pub unit: String,
  /// Optional pack preset id.
  #[serde(default)]
  pub sell_option_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OrderLine {
  pub product_id: String,
  pub name: String,
  /// Quantity in `unit` as sold.
  pub quantity: f64,
  pub unit_price_cents: i64,
  /// Selling unit snapshot.
  #[serde(default = "default_line_unit")]
  pub unit: String,
  /// Base milli consumed from inventory.
  #[serde(default)]
  pub quantity_base_milli: i64,
  /// Line total in ¢.
  #[serde(default)]
  pub line_total_cents: i64,
  #[serde(default)]
  pub sell_option_label: String,
}

fn default_line_unit() -> String {
  "ea".to_string()
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Order {
  pub id: String,
  pub customer_id: String,
  pub thread_id: String,
  pub status: String, // draft | confirmed | paid | fulfilled | cancelled — see set_status
  pub lines: Vec<OrderLine>,
  pub total_cents: i64,
  pub created_at: i64,
  pub updated_at: i64,
}

/// Allowed order statuses and transitions for `OrderStore::set_status`.
///
/// - `cancelled` is terminal.
/// - From `draft`: → confirmed | paid | fulfilled | cancelled
/// - From `confirmed` | `paid` | `fulfilled`: → paid | fulfilled | cancelled
fn validate_status_transition(from: &str, to: &str) -> Result<(), String> {
  const KNOWN: &[&str] = &["draft", "confirmed", "paid", "fulfilled", "cancelled"];
  if !KNOWN.contains(&to) {
    return Err(format!(
      "invalid status '{}'; allowed: draft, confirmed, paid, fulfilled, cancelled",
      to
    ));
  }
  if from == to {
    return Ok(());
  }
  if from == "cancelled" {
    return Err("cancelled orders are terminal; status cannot change".to_string());
  }
  let allowed: &[&str] = match from {
    "draft" => &["confirmed", "paid", "fulfilled", "cancelled"],
    "confirmed" | "paid" | "fulfilled" => &["paid", "fulfilled", "cancelled"],
    // Unknown/legacy on-disk status: only allow moving to a known non-draft status.
    _ => &["confirmed", "paid", "fulfilled", "cancelled"],
  };
  if !allowed.contains(&to) {
    return Err(format!(
      "cannot change status from '{}' to '{}'",
      from, to
    ));
  }
  Ok(())
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
struct OrderFile {
  version: u32,
  orders: Vec<Order>,
}

#[derive(Clone)]
pub struct OrderStore {
  path: Arc<Mutex<PathBuf>>,
  orders: Arc<Mutex<Vec<Order>>>,
}

impl OrderStore {
  pub fn new(app_data_dir: &Path) -> Self {
    let dir = app_data_dir.join("commerce");
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join("orders.json");
    let orders = if path.is_file() {
      std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str::<OrderFile>(&s).ok())
        .map(|f| f.orders)
        .unwrap_or_default()
    } else {
      Vec::new()
    };
    Self {
      path: Arc::new(Mutex::new(path)),
      orders: Arc::new(Mutex::new(orders)),
    }
  }

  pub fn reload_from(&self, account_data_dir: &Path) {
    let fresh = Self::new(account_data_dir);
    let mut path = self.path.lock().unwrap();
    let mut orders = self.orders.lock().unwrap();
    *path = fresh.path.lock().unwrap().clone();
    *orders = fresh.orders.lock().unwrap().clone();
  }

  fn persist(&self) -> Result<(), String> {
    let (json, dest) = {
      let path_guard = self.path.lock().unwrap();
      let orders = self.orders.lock().unwrap().clone();
      let file = OrderFile { version: 1, orders };
      let json = serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?;
      (json, path_guard.clone())
    };
    let tmp = dest.with_extension("json.tmp");
    std::fs::write(&tmp, json).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, dest).map_err(|e| e.to_string())
  }

  pub fn list(&self) -> Vec<Order> {
    let mut v = self.orders.lock().unwrap().clone();
    v.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    v
  }

  pub fn list_for_thread(&self, thread_id: &str) -> Vec<Order> {
    self
      .list()
      .into_iter()
      .filter(|o| o.thread_id == thread_id)
      .collect()
  }

  pub fn get(&self, id: &str) -> Option<Order> {
    self.orders.lock().unwrap().iter().find(|o| o.id == id).cloned()
  }

  pub fn create(
    &self,
    commerce: &CommerceStore,
    customer_id: String,
    thread_id: String,
    lines_in: Vec<OrderLineInput>,
    now: i64,
  ) -> Result<Order, String> {
    self.create_with_mode(commerce, customer_id, thread_id, lines_in, false, now)
  }

  /// `as_draft`: no stock decrement; status `draft`. Otherwise confirmed + decrement (legacy).
  pub fn create_with_mode(
    &self,
    commerce: &CommerceStore,
    customer_id: String,
    thread_id: String,
    lines_in: Vec<OrderLineInput>,
    as_draft: bool,
    now: i64,
  ) -> Result<Order, String> {
    let (lines, total) = Self::build_lines(commerce, &lines_in, !as_draft)?;
    if !as_draft {
      for line in &lines {
        commerce.adjust_stock_milli(&line.product_id, -line.quantity_base_milli, now)?;
      }
    }
    let order = Order {
      id: Uuid::new_v4().to_string(),
      customer_id,
      thread_id,
      status: if as_draft {
        "draft".to_string()
      } else {
        "confirmed".to_string()
      },
      lines,
      total_cents: total,
      created_at: now,
      updated_at: now,
    };
    self.orders.lock().unwrap().push(order.clone());
    self.persist()?;
    Ok(order)
  }

  fn build_lines(
    commerce: &CommerceStore,
    lines_in: &[OrderLineInput],
    require_stock: bool,
  ) -> Result<(Vec<OrderLine>, i64), String> {
    if lines_in.is_empty() {
      return Err("order needs at least one line".to_string());
    }
    let products = commerce.list_products();
    let mut lines = Vec::new();
    let mut total = 0i64;
    for line in lines_in {
      let p = products
        .iter()
        .find(|x| x.id == line.product_id)
        .ok_or_else(|| format!("product not found: {}", line.product_id))?;
      let mut p = p.clone();
      p.migrate_legacy();

      let sell_opt = line.sell_option_id.trim();
      let (sale_qty, sale_unit, opt_label) = if !sell_opt.is_empty() {
        let opt = p
          .sell_options
          .iter()
          .find(|o| o.id == sell_opt)
          .ok_or_else(|| format!("sell option not found on {}", p.name))?;
        (opt.amount, opt.unit.clone(), opt.label.clone())
      } else {
        let qty = line.quantity;
        if !qty.is_finite() || qty <= 0.0 {
          return Err("quantity must be > 0".to_string());
        }
        let unit = if line.unit.trim().is_empty() {
          p.effective_sales_unit()
        } else {
          crate::commerce::normalize_measure_unit(&line.unit)?
        };
        (qty, unit, String::new())
      };

      let (line_total, base_milli) = p.quote_sale(
        sale_qty,
        &sale_unit,
        if sell_opt.is_empty() {
          None
        } else {
          Some(sell_opt)
        },
      )?;
      if base_milli <= 0 {
        return Err(format!("sale quantity too small for {}", p.name));
      }
      if require_stock && p.quantity_base_milli < base_milli {
        return Err(format!("insufficient stock for {}", p.name));
      }
      let unit_price = if sale_qty > 0.0 {
        (line_total as f64 / sale_qty).round() as i64
      } else {
        line_total
      };
      total += line_total;
      lines.push(OrderLine {
        product_id: p.id.clone(),
        name: p.name.clone(),
        quantity: sale_qty,
        unit_price_cents: unit_price,
        unit: sale_unit,
        quantity_base_milli: base_milli,
        line_total_cents: line_total,
        sell_option_label: opt_label,
      });
    }
    Ok((lines, total))
  }

  /// Replace lines on a draft order only (no stock movement).
  pub fn update_draft_lines(
    &self,
    commerce: &CommerceStore,
    id: &str,
    lines_in: Vec<OrderLineInput>,
    now: i64,
  ) -> Result<Order, String> {
    let (lines, total) = Self::build_lines(commerce, &lines_in, false)?;
    let mut out = None;
    {
      let mut list = self.orders.lock().unwrap();
      let o = list
        .iter_mut()
        .find(|x| x.id == id)
        .ok_or_else(|| "order not found".to_string())?;
      if o.status != "draft" {
        return Err("only draft orders can be edited".to_string());
      }
      o.lines = lines;
      o.total_cents = total;
      o.updated_at = now;
      out = Some(o.clone());
    }
    self.persist()?;
    out.ok_or_else(|| "order not found".to_string())
  }

  /// Draft → confirmed with stock decrement. Idempotent if already confirmed.
  pub fn confirm(
    &self,
    commerce: &CommerceStore,
    id: &str,
    now: i64,
  ) -> Result<Order, String> {
    let existing = self
      .get(id)
      .ok_or_else(|| "order not found".to_string())?;
    if existing.status == "confirmed" {
      return Ok(existing);
    }
    if existing.status != "draft" {
      return Err(format!(
        "cannot confirm order in status '{}'",
        existing.status
      ));
    }
    // Re-check stock against live catalog
    let products = commerce.list_products();
    for line in &existing.lines {
      let p = products
        .iter()
        .find(|x| x.id == line.product_id)
        .ok_or_else(|| format!("product not found: {}", line.product_id))?;
      let mut p = p.clone();
      p.migrate_legacy();
      if p.quantity_base_milli < line.quantity_base_milli {
        return Err(format!("insufficient stock for {}", p.name));
      }
    }
    for line in &existing.lines {
      commerce.adjust_stock_milli(&line.product_id, -line.quantity_base_milli, now)?;
    }
    let mut out = None;
    {
      let mut list = self.orders.lock().unwrap();
      let o = list
        .iter_mut()
        .find(|x| x.id == id)
        .ok_or_else(|| "order not found".to_string())?;
      validate_status_transition(&o.status, "confirmed")?;
      o.status = "confirmed".to_string();
      o.updated_at = now;
      out = Some(o.clone());
    }
    self.persist()?;
    out.ok_or_else(|| "order not found".to_string())
  }

  /// Copy an order as a new draft (no stock change).
  pub fn duplicate_as_draft(
    &self,
    commerce: &CommerceStore,
    id: &str,
    now: i64,
  ) -> Result<Order, String> {
    let src = self
      .get(id)
      .ok_or_else(|| "order not found".to_string())?;
    let lines_in: Vec<OrderLineInput> = src
      .lines
      .iter()
      .map(|l| OrderLineInput {
        product_id: l.product_id.clone(),
        quantity: l.quantity,
        unit: l.unit.clone(),
        sell_option_id: String::new(),
      })
      .collect();
    self.create_with_mode(
      commerce,
      src.customer_id.clone(),
      src.thread_id.clone(),
      lines_in,
      true,
      now,
    )
  }

  pub fn set_status(&self, id: &str, status: &str, now: i64) -> Result<Order, String> {
    // draft → confirmed must go through confirm() so stock is decremented once.
    if status == "confirmed" {
      let cur = self.get(id).ok_or_else(|| "order not found".to_string())?;
      if cur.status == "draft" {
        return Err("use confirm_order to move draft → confirmed (decrements stock)".into());
      }
    }
    let mut out = None;
    {
      let mut list = self.orders.lock().unwrap();
      let o = list
        .iter_mut()
        .find(|x| x.id == id)
        .ok_or_else(|| "order not found".to_string())?;
      validate_status_transition(&o.status, status)?;
      o.status = status.to_string();
      o.updated_at = now;
      out = Some(o.clone());
    }
    self.persist()?;
    out.ok_or_else(|| "order not found".to_string())
  }
}

pub fn format_invoice(order: &Order, business_name: &str) -> String {
  format_order_document(order, business_name, "Invoice")
}

pub fn format_quote(order: &Order, business_name: &str) -> String {
  let mut body = format_order_document(order, business_name, "Quote");
  body.push_str("\nThis is a quote — not yet confirmed.");
  body
}

fn format_order_document(order: &Order, business_name: &str, kind: &str) -> String {
  let mut lines = vec![
    format!("{} — {}", business_name, kind),
    format!("Order {}", &order.id[..8.min(order.id.len())]),
    String::new(),
  ];
  for line in &order.lines {
    let qty = if (line.quantity - line.quantity.trunc()).abs() < 1e-6 {
      format!("{}", line.quantity as i64)
    } else {
      format!("{:.3}", line.quantity)
    };
    let unit = if line.unit.trim().is_empty() || line.unit == "ea" {
      qty
    } else {
      format!("{} {}", qty, line.unit)
    };
    let label = if line.sell_option_label.is_empty() {
      line.name.clone()
    } else {
      format!("{} ({})", line.name, line.sell_option_label)
    };
    let total = if line.line_total_cents > 0 {
      line.line_total_cents
    } else {
      (line.unit_price_cents as f64 * line.quantity).round() as i64
    };
    lines.push(format!(
      "• {} × {} — ${:.2}",
      label,
      unit,
      total as f64 / 100.0
    ));
  }
  lines.push(String::new());
  lines.push(format!("Total: ${:.2}", order.total_cents as f64 / 100.0));
  lines.push("Reply here if anything looks off.".to_string());
  lines.join("\n")
}

pub fn format_order_status(order: &Order) -> String {
  format!(
    "Order {} · {} · ${:.2}. Reply 0 for the menu.",
    &order.id[..8.min(order.id.len())],
    order.status,
    order.total_cents as f64 / 100.0
  )
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn invoice_includes_total() {
    let order = Order {
      id: "abcdefghij".into(),
      customer_id: "c1".into(),
      thread_id: "dm:+1".into(),
      status: "confirmed".into(),
      lines: vec![OrderLine {
        product_id: "p1".into(),
        name: "Widget".into(),
        quantity: 2.0,
        unit_price_cents: 500,
        unit: "ea".into(),
        quantity_base_milli: 2000,
        line_total_cents: 1000,
        sell_option_label: String::new(),
      }],
      total_cents: 1000,
      created_at: 0,
      updated_at: 0,
    };
    let s = format_invoice(&order, "Acme");
    assert!(s.contains("Acme"));
    assert!(s.contains("$10.00"));
    assert!(s.contains("Widget"));
  }

  #[test]
  fn status_transition_allowed() {
    assert!(validate_status_transition("draft", "confirmed").is_ok());
    assert!(validate_status_transition("draft", "cancelled").is_ok());
    assert!(validate_status_transition("draft", "paid").is_ok());
    assert!(validate_status_transition("draft", "fulfilled").is_ok());
    assert!(validate_status_transition("confirmed", "paid").is_ok());
    assert!(validate_status_transition("confirmed", "fulfilled").is_ok());
    assert!(validate_status_transition("confirmed", "cancelled").is_ok());
    assert!(validate_status_transition("paid", "fulfilled").is_ok());
    assert!(validate_status_transition("paid", "cancelled").is_ok());
    assert!(validate_status_transition("fulfilled", "paid").is_ok());
    assert!(validate_status_transition("fulfilled", "cancelled").is_ok());
    // Idempotent same-status
    assert!(validate_status_transition("paid", "paid").is_ok());
    assert!(validate_status_transition("cancelled", "cancelled").is_ok());
  }

  #[test]
  fn status_transition_forbidden() {
    let err = validate_status_transition("cancelled", "paid").unwrap_err();
    assert!(err.contains("terminal"), "{err}");

    let err = validate_status_transition("cancelled", "confirmed").unwrap_err();
    assert!(err.contains("terminal"), "{err}");

    let err = validate_status_transition("paid", "confirmed").unwrap_err();
    assert!(err.contains("cannot change"), "{err}");

    let err = validate_status_transition("fulfilled", "draft").unwrap_err();
    assert!(err.contains("cannot change"), "{err}");

    let err = validate_status_transition("confirmed", "draft").unwrap_err();
    assert!(err.contains("cannot change"), "{err}");

    let err = validate_status_transition("confirmed", "shipped").unwrap_err();
    assert!(err.contains("invalid status"), "{err}");
    assert!(err.contains("fulfilled"), "{err}");
  }

  #[test]
  fn set_status_enforces_transitions() {
    let dir = std::env::temp_dir().join(format!("signalx-orders-{}", Uuid::new_v4()));
    let _ = std::fs::create_dir_all(&dir);
    let store = OrderStore::new(&dir);
    {
      let mut list = store.orders.lock().unwrap();
      list.push(Order {
        id: "o1".into(),
        customer_id: "c1".into(),
        thread_id: "dm:+1".into(),
        status: "confirmed".into(),
        lines: vec![],
        total_cents: 100,
        created_at: 1,
        updated_at: 1,
      });
    }

    let paid = store.set_status("o1", "paid", 2).unwrap();
    assert_eq!(paid.status, "paid");
    assert_eq!(paid.updated_at, 2);

    let fulfilled = store.set_status("o1", "fulfilled", 3).unwrap();
    assert_eq!(fulfilled.status, "fulfilled");

    let cancelled = store.set_status("o1", "cancelled", 4).unwrap();
    assert_eq!(cancelled.status, "cancelled");

    let err = store.set_status("o1", "paid", 5).unwrap_err();
    assert!(err.contains("terminal"), "{err}");

    let _ = std::fs::remove_dir_all(&dir);
  }

  #[test]
  fn confirm_on_account_b_leaves_account_a_stock() {
    let root = std::env::temp_dir().join(format!("signalx-orders-iso-{}", Uuid::new_v4()));
    let dir_a = root.join("a");
    let dir_b = root.join("b");
    let _ = std::fs::create_dir_all(&dir_a);
    let _ = std::fs::create_dir_all(&dir_b);
    let product = |qty: i64| crate::commerce::Product {
      id: "p1".into(),
      name: "Widget".into(),
      description: String::new(),
      sku: String::new(),
      price_cents: 100,
      cost_cents: 0,
      supplier: String::new(),
      base_unit: "ea".into(),
      stock_unit: String::new(),
      sales_unit: String::new(),
      quantity_base_milli: qty,
      quantity_in_stock: qty / 1000,
      stock_qty: None,
      unit: "ea".into(),
      weight: 0.0,
      weight_unit: String::new(),
      image_path: String::new(),
      sell_options: vec![],
      low_stock_threshold_milli: 0,
      updated_at: 0,
    };
    let commerce_a = CommerceStore::new(&dir_a);
    commerce_a.upsert_product(product(5000), 1).unwrap();
    let commerce_b = CommerceStore::new(&dir_b);
    commerce_b.upsert_product(product(5000), 1).unwrap();
    let orders_b = OrderStore::new(&dir_b);
    let draft = orders_b
      .create_with_mode(
        &commerce_b,
        "c1".into(),
        "dm:+1".into(),
        vec![OrderLineInput {
          product_id: "p1".into(),
          quantity: 1.0,
          unit: "ea".into(),
          sell_option_id: String::new(),
        }],
        true,
        2,
      )
      .unwrap();
    assert_eq!(commerce_a.list_products()[0].quantity_base_milli, 5000);
    orders_b.confirm(&commerce_b, &draft.id, 3).unwrap();
    assert_eq!(commerce_b.list_products()[0].quantity_base_milli, 4000);
    assert_eq!(commerce_a.list_products()[0].quantity_base_milli, 5000);
    let _ = std::fs::remove_dir_all(&root);
  }
}
