//! Orders and simple invoice text for Signal sales.

use crate::commerce::CommerceStore;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OrderLineInput {
  pub product_id: String,
  pub quantity: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OrderLine {
  pub product_id: String,
  pub name: String,
  pub quantity: i64,
  pub unit_price_cents: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Order {
  pub id: String,
  pub customer_id: String,
  pub thread_id: String,
  pub status: String, // draft | confirmed | paid | cancelled
  pub lines: Vec<OrderLine>,
  pub total_cents: i64,
  pub created_at: i64,
  pub updated_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
struct OrderFile {
  version: u32,
  orders: Vec<Order>,
}

#[derive(Clone)]
pub struct OrderStore {
  path: PathBuf,
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
      path,
      orders: Arc::new(Mutex::new(orders)),
    }
  }

  fn persist(&self) -> Result<(), String> {
    let orders = self.orders.lock().unwrap().clone();
    let file = OrderFile { version: 1, orders };
    let json = serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?;
    std::fs::write(&self.path, json).map_err(|e| e.to_string())
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
    if lines_in.is_empty() {
      return Err("order needs at least one line".to_string());
    }
    let products = commerce.list_products();
    let mut lines = Vec::new();
    let mut total = 0i64;
    for line in &lines_in {
      if line.quantity <= 0 {
        return Err("quantity must be > 0".to_string());
      }
      let p = products
        .iter()
        .find(|x| x.id == line.product_id)
        .ok_or_else(|| format!("product not found: {}", line.product_id))?;
      if p.quantity_in_stock < line.quantity {
        return Err(format!("insufficient stock for {}", p.name));
      }
    }
    for line in &lines_in {
      let p = products.iter().find(|x| x.id == line.product_id).unwrap();
      commerce.adjust_stock(&line.product_id, -line.quantity, now)?;
      let line_total = p.price_cents * line.quantity;
      total += line_total;
      lines.push(OrderLine {
        product_id: p.id.clone(),
        name: p.name.clone(),
        quantity: line.quantity,
        unit_price_cents: p.price_cents,
      });
    }
    let order = Order {
      id: Uuid::new_v4().to_string(),
      customer_id,
      thread_id,
      status: "confirmed".to_string(),
      lines,
      total_cents: total,
      created_at: now,
      updated_at: now,
    };
    self.orders.lock().unwrap().push(order.clone());
    self.persist()?;
    Ok(order)
  }

  pub fn set_status(&self, id: &str, status: &str, now: i64) -> Result<Order, String> {
    let allowed = ["draft", "confirmed", "paid", "cancelled"];
    if !allowed.contains(&status) {
      return Err("invalid status".to_string());
    }
    let mut out = None;
    {
      let mut list = self.orders.lock().unwrap();
      let o = list
        .iter_mut()
        .find(|x| x.id == id)
        .ok_or_else(|| "order not found".to_string())?;
      o.status = status.to_string();
      o.updated_at = now;
      out = Some(o.clone());
    }
    self.persist()?;
    out.ok_or_else(|| "order not found".to_string())
  }
}

pub fn format_invoice(order: &Order, business_name: &str) -> String {
  let mut lines = vec![
    format!("{} — Invoice", business_name),
    format!("Order {}", &order.id[..8.min(order.id.len())]),
    format!("Status: {}", order.status),
    String::new(),
  ];
  for line in &order.lines {
    lines.push(format!(
      "• {} × {} — ${:.2}",
      line.name,
      line.quantity,
      (line.unit_price_cents * line.quantity) as f64 / 100.0
    ));
  }
  lines.push(String::new());
  lines.push(format!("Total: ${:.2}", order.total_cents as f64 / 100.0));
  lines.push("Thank you!".to_string());
  lines.join("\n")
}

pub fn format_order_status(order: &Order) -> String {
  format!(
    "Order {} is {}. Total ${:.2}. Reply 0 for the main menu.",
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
        quantity: 2,
        unit_price_cents: 500,
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
}
