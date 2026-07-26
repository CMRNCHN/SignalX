//! Local product catalog and customers tied to Signal threads.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Product {
  pub id: String,
  pub name: String,
  #[serde(default)]
  pub description: String,
  #[serde(default)]
  pub sku: String,
  pub price_cents: i64,
  pub quantity_in_stock: i64,
  pub updated_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Customer {
  pub id: String,
  pub thread_id: String,
  #[serde(default)]
  pub display_name: String,
  #[serde(default)]
  pub notes: String,
  pub updated_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
struct ProductFile {
  version: u32,
  products: Vec<Product>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
struct CustomerFile {
  version: u32,
  customers: Vec<Customer>,
}

#[derive(Clone)]
pub struct CommerceStore {
  products_path: PathBuf,
  customers_path: PathBuf,
  products: Arc<Mutex<Vec<Product>>>,
  customers: Arc<Mutex<Vec<Customer>>>,
}

impl CommerceStore {
  pub fn new(app_data_dir: &Path) -> Self {
    let dir = app_data_dir.join("commerce");
    let _ = std::fs::create_dir_all(&dir);
    let products_path = dir.join("products.json");
    let customers_path = dir.join("customers.json");

    let products = if products_path.is_file() {
      std::fs::read_to_string(&products_path)
        .ok()
        .and_then(|s| serde_json::from_str::<ProductFile>(&s).ok())
        .map(|f| f.products)
        .unwrap_or_default()
    } else {
      Vec::new()
    };
    let customers = if customers_path.is_file() {
      std::fs::read_to_string(&customers_path)
        .ok()
        .and_then(|s| serde_json::from_str::<CustomerFile>(&s).ok())
        .map(|f| f.customers)
        .unwrap_or_default()
    } else {
      Vec::new()
    };

    Self {
      products_path,
      customers_path,
      products: Arc::new(Mutex::new(products)),
      customers: Arc::new(Mutex::new(customers)),
    }
  }

  fn persist_products(&self) -> Result<(), String> {
    let products = self.products.lock().unwrap().clone();
    let file = ProductFile {
      version: 1,
      products,
    };
    let json = serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?;
    std::fs::write(&self.products_path, json).map_err(|e| e.to_string())
  }

  fn persist_customers(&self) -> Result<(), String> {
    let customers = self.customers.lock().unwrap().clone();
    let file = CustomerFile {
      version: 1,
      customers,
    };
    let json = serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?;
    std::fs::write(&self.customers_path, json).map_err(|e| e.to_string())
  }

  pub fn list_products(&self) -> Vec<Product> {
    let mut v = self.products.lock().unwrap().clone();
    v.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    v
  }

  pub fn upsert_product(&self, mut p: Product, now: i64) -> Result<Product, String> {
    p.name = p.name.trim().to_string();
    if p.name.is_empty() {
      return Err("product name required".to_string());
    }
    if p.price_cents < 0 || p.quantity_in_stock < 0 {
      return Err("price and stock must be >= 0".to_string());
    }
    p.updated_at = now;
    if p.id.trim().is_empty() {
      p.id = Uuid::new_v4().to_string();
    }
    {
      let mut list = self.products.lock().unwrap();
      if let Some(existing) = list.iter_mut().find(|x| x.id == p.id) {
        *existing = p.clone();
      } else {
        list.push(p.clone());
      }
    }
    self.persist_products()?;
    Ok(p)
  }

  pub fn delete_product(&self, id: &str) -> Result<bool, String> {
    let before;
    {
      let mut list = self.products.lock().unwrap();
      before = list.len();
      list.retain(|p| p.id != id);
    }
    self.persist_products()?;
    Ok(before != self.products.lock().unwrap().len())
  }

  pub fn adjust_stock(&self, id: &str, delta: i64, now: i64) -> Result<Product, String> {
    let mut out = None;
    {
      let mut list = self.products.lock().unwrap();
      let p = list
        .iter_mut()
        .find(|x| x.id == id)
        .ok_or_else(|| "product not found".to_string())?;
      let next = p.quantity_in_stock + delta;
      if next < 0 {
        return Err("insufficient stock".to_string());
      }
      p.quantity_in_stock = next;
      p.updated_at = now;
      out = Some(p.clone());
    }
    self.persist_products()?;
    out.ok_or_else(|| "product not found".to_string())
  }

  pub fn list_customers(&self) -> Vec<Customer> {
    let mut v = self.customers.lock().unwrap().clone();
    v.sort_by(|a, b| a.display_name.to_lowercase().cmp(&b.display_name.to_lowercase()));
    v
  }

  pub fn upsert_customer(&self, mut c: Customer, now: i64) -> Result<Customer, String> {
    c.thread_id = c.thread_id.trim().to_string();
    if c.thread_id.is_empty() {
      return Err("thread_id required".to_string());
    }
    if c.thread_id.starts_with("group:") {
      return Err("customers must be DM threads".to_string());
    }
    c.display_name = c.display_name.trim().to_string();
    c.notes = c.notes.trim().to_string();
    c.updated_at = now;
    if c.id.trim().is_empty() {
      c.id = Uuid::new_v4().to_string();
    }
    {
      let mut list = self.customers.lock().unwrap();
      // One customer per thread
      if let Some(existing) = list.iter_mut().find(|x| x.thread_id == c.thread_id || x.id == c.id) {
        c.id = existing.id.clone();
        *existing = c.clone();
      } else {
        list.push(c.clone());
      }
    }
    self.persist_customers()?;
    Ok(c)
  }

  pub fn delete_customer(&self, id: &str) -> Result<bool, String> {
    let before;
    {
      let mut list = self.customers.lock().unwrap();
      before = list.len();
      list.retain(|c| c.id != id);
    }
    self.persist_customers()?;
    Ok(before != self.customers.lock().unwrap().len())
  }

  pub fn customer_by_thread(&self, thread_id: &str) -> Option<Customer> {
    self
      .customers
      .lock()
      .unwrap()
      .iter()
      .find(|c| c.thread_id == thread_id)
      .cloned()
  }
}

/// Format catalog for IVR SMS-style reply (keep short).
pub fn format_catalog_list(products: &[Product], max_items: usize) -> String {
  if products.is_empty() {
    return "No products in the catalog yet. Reply 0 for the main menu.".to_string();
  }
  let mut lines = vec!["Products:".to_string()];
  for (i, p) in products.iter().take(max_items).enumerate() {
    let dollars = p.price_cents as f64 / 100.0;
    lines.push(format!(
      "{}. {} — ${:.2} ({} left)",
      i + 1,
      p.name,
      dollars,
      p.quantity_in_stock
    ));
  }
  if products.len() > max_items {
    lines.push(format!("…and {} more.", products.len() - max_items));
  }
  lines.push("Reply 0 for the main menu.".to_string());
  lines.join("\n")
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn format_empty_catalog() {
    let s = format_catalog_list(&[], 10);
    assert!(s.contains("No products"));
  }

  #[test]
  fn format_lists_price_and_stock() {
    let products = vec![Product {
      id: "1".into(),
      name: "Widget".into(),
      description: String::new(),
      sku: "W1".into(),
      price_cents: 1299,
      quantity_in_stock: 4,
      updated_at: 0,
    }];
    let s = format_catalog_list(&products, 10);
    assert!(s.contains("Widget"));
    assert!(s.contains("$12.99"));
    assert!(s.contains("4 left"));
  }

  #[test]
  fn adjust_stock_rejects_negative() {
    let dir = std::env::temp_dir().join(format!("signalx-commerce-{}", std::process::id()));
    let _ = std::fs::create_dir_all(&dir);
    let store = CommerceStore::new(&dir);
    let p = store
      .upsert_product(
        Product {
          id: String::new(),
          name: "X".into(),
          description: String::new(),
          sku: String::new(),
          price_cents: 100,
          quantity_in_stock: 1,
          updated_at: 0,
        },
        1,
      )
      .unwrap();
    assert!(store.adjust_stock(&p.id, -2, 2).is_err());
    assert_eq!(store.adjust_stock(&p.id, -1, 3).unwrap().quantity_in_stock, 0);
    let _ = std::fs::remove_dir_all(&dir);
  }
}
