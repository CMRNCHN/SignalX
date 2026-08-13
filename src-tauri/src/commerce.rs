//! Local product catalog and customers tied to Signal threads.

use crate::uom::{
  convert_from_base, convert_to_base, from_milli, to_milli, units_compatible,
};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use uuid::Uuid;

/// Allowed UOMs (base / stock / sales / sell-option units).
pub const MEASURE_UNITS: &[&str] = &["ea", "lb", "kg", "oz", "g", "ml", "l"];
/// Allowed package / net weight units.
pub const WEIGHT_UNITS: &[&str] = &["g", "kg", "oz", "lb"];

fn default_measure_unit() -> String {
  "ea".to_string()
}

/// Optional pack/size you sell (e.g. “Half oz”, “100 g”).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SellOption {
  #[serde(default)]
  pub id: String,
  pub label: String,
  pub amount: f64,
  pub unit: String,
  /// Fixed pack price in ¢. If omitted, price = base rate × converted amount.
  #[serde(default)]
  pub price_cents: Option<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Product {
  pub id: String,
  pub name: String,
  #[serde(default)]
  pub description: String,
  #[serde(default)]
  pub sku: String,
  /// Sell price per **base_unit** (¢).
  pub price_cents: i64,
  /// Your cost per **base_unit** (¢).
  #[serde(default)]
  pub cost_cents: i64,
  /// Where you got it (supplier / source).
  #[serde(default)]
  pub supplier: String,
  /// Canonical UOM. Inventory truth is `quantity_base_milli`.
  #[serde(default = "default_measure_unit")]
  pub base_unit: String,
  /// Optional inventory UI unit (empty → base).
  #[serde(default)]
  pub stock_unit: String,
  /// Optional default sales unit (empty → base).
  #[serde(default)]
  pub sales_unit: String,
  /// Stock in 1/1000 of `base_unit`.
  #[serde(default)]
  pub quantity_base_milli: i64,
  /// Legacy integer stock (migrated into milli on load/upsert).
  #[serde(default)]
  pub quantity_in_stock: i64,
  /// UI stock entry amount in `stock_unit` (or base). When set (≥0 finite), recomputes milli.
  #[serde(default)]
  pub stock_qty: Option<f64>,
  /// Legacy single unit — used when base_unit was never set.
  #[serde(default = "default_measure_unit")]
  pub unit: String,
  /// Optional package/net weight metadata (not the UOM system).
  #[serde(default)]
  pub weight: f64,
  #[serde(default)]
  pub weight_unit: String,
  #[serde(default)]
  pub image_path: String,
  #[serde(default)]
  pub sell_options: Vec<SellOption>,
  /// Alert when `quantity_base_milli` is at or below this (0 = no threshold).
  #[serde(default)]
  pub low_stock_threshold_milli: i64,
  pub updated_at: i64,
}

impl Product {
  pub fn migrate_legacy(&mut self) {
    if self.base_unit.trim().is_empty() {
      self.base_unit = if self.unit.trim().is_empty() {
        "ea".to_string()
      } else {
        self.unit.clone()
      };
    }
    if self.quantity_base_milli == 0 && self.quantity_in_stock != 0 {
      // Interpret legacy stock as whole units of legacy `unit` (== base after migrate).
      self.quantity_base_milli = self.quantity_in_stock.saturating_mul(1000);
    }
  }

  pub fn effective_base_unit(&self) -> String {
    let b = self.base_unit.trim();
    if b.is_empty() {
      format_unit_label(&self.unit)
    } else {
      format_unit_label(b)
    }
  }

  pub fn effective_stock_unit(&self) -> String {
    let s = self.stock_unit.trim();
    if s.is_empty() {
      self.effective_base_unit()
    } else {
      format_unit_label(s)
    }
  }

  pub fn effective_sales_unit(&self) -> String {
    let s = self.sales_unit.trim();
    if s.is_empty() {
      self.effective_base_unit()
    } else {
      format_unit_label(s)
    }
  }

  pub fn stock_display(&self) -> Result<(f64, String), String> {
    let base = self.effective_base_unit();
    let stock_u = self.effective_stock_unit();
    let amt = convert_from_base(from_milli(self.quantity_base_milli), &stock_u, &base)?;
    Ok((amt, stock_u))
  }

  pub fn is_low_stock(&self) -> bool {
    self.low_stock_threshold_milli > 0
      && self.quantity_base_milli <= self.low_stock_threshold_milli
  }

  /// Price in ¢ for selling `amount` of `unit` (uses sell option fixed price when id matches).
  pub fn quote_sale(
    &self,
    amount: f64,
    unit: &str,
    sell_option_id: Option<&str>,
  ) -> Result<(i64 /*line_total*/, i64 /*base_milli*/), String> {
    if let Some(oid) = sell_option_id.filter(|s| !s.is_empty()) {
      let opt = self
        .sell_options
        .iter()
        .find(|o| o.id == oid)
        .ok_or_else(|| "sell option not found".to_string())?;
      let base = self.effective_base_unit();
      let base_amt = convert_to_base(opt.amount, &opt.unit, &base)?;
      let milli = to_milli(base_amt);
      let total = if let Some(p) = opt.price_cents {
        if p < 0 {
          return Err("sell option price must be >= 0".to_string());
        }
        p
      } else {
        price_for_base_amount(self.price_cents, base_amt)?
      };
      return Ok((total, milli));
    }
    let base = self.effective_base_unit();
    let base_amt = convert_to_base(amount, unit, &base)?;
    let milli = to_milli(base_amt);
    let total = price_for_base_amount(self.price_cents, base_amt)?;
    Ok((total, milli))
  }
}

fn price_for_base_amount(price_cents_per_base: i64, base_amt: f64) -> Result<i64, String> {
  if price_cents_per_base < 0 {
    return Err("price must be >= 0".to_string());
  }
  if !base_amt.is_finite() || base_amt < 0.0 {
    return Err("amount must be >= 0".to_string());
  }
  Ok((price_cents_per_base as f64 * base_amt).round() as i64)
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

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StockLedgerEntry {
  pub id: String,
  pub product_id: String,
  pub delta_milli: i64,
  #[serde(default)]
  pub reason: String,
  pub created_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
struct StockLedgerFile {
  version: u32,
  entries: Vec<StockLedgerEntry>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CsvImportPreview {
  pub upserts: usize,
  pub creates: usize,
  pub errors: Vec<String>,
  pub sample: Vec<String>,
}

#[derive(Clone)]
struct CommerceDisk {
  products_path: PathBuf,
  customers_path: PathBuf,
  stock_ledger_path: PathBuf,
  images_dir: PathBuf,
  app_data_dir: PathBuf,
}

#[derive(Clone)]
pub struct CommerceStore {
  disk: Arc<Mutex<CommerceDisk>>,
  products: Arc<Mutex<Vec<Product>>>,
  customers: Arc<Mutex<Vec<Customer>>>,
  stock_ledger: Arc<Mutex<Vec<StockLedgerEntry>>>,
}

pub fn normalize_measure_unit(raw: &str) -> Result<String, String> {
  let u = raw.trim().to_lowercase();
  let u = if u.is_empty() { "ea".to_string() } else { u };
  let u = if u == "each" || u == "unit" {
    "ea".to_string()
  } else {
    u
  };
  if !MEASURE_UNITS.contains(&u.as_str()) {
    return Err(format!(
      "unit must be one of: {}",
      MEASURE_UNITS.join(", ")
    ));
  }
  Ok(u)
}

pub fn normalize_weight(weight: f64, weight_unit: &str) -> Result<(f64, String), String> {
  if !weight.is_finite() || weight < 0.0 {
    return Err("weight must be >= 0".to_string());
  }
  let wu = weight_unit.trim().to_lowercase();
  if weight == 0.0 {
    return Ok((0.0, String::new()));
  }
  if wu.is_empty() {
    return Err("weight_unit required when weight > 0 (g, kg, oz, lb)".to_string());
  }
  if !WEIGHT_UNITS.contains(&wu.as_str()) {
    return Err(format!(
      "weight_unit must be one of: {}",
      WEIGHT_UNITS.join(", ")
    ));
  }
  Ok((weight, wu))
}

/// Human label for stock/price unit (e.g. `lb`).
pub fn format_unit_label(unit: &str) -> String {
  let u = unit.trim().to_lowercase();
  if u.is_empty() || u == "ea" {
    "ea".to_string()
  } else {
    u
  }
}

/// Short measure + weight snippet for lists / IVR.
pub fn format_product_measure(p: &Product) -> String {
  let mut parts = Vec::new();
  let base = p.effective_base_unit();
  let sales = p.effective_sales_unit();
  if sales != base {
    parts.push(format!("sell {}", sales));
  } else if base != "ea" {
    parts.push(format!("per {}", base));
  }
  if p.weight > 0.0 && !p.weight_unit.is_empty() {
    let w = if (p.weight - p.weight.trunc()).abs() < f64::EPSILON {
      format!("{}", p.weight as i64)
    } else {
      format!("{:.2}", p.weight)
    };
    parts.push(format!("{} {}", w, p.weight_unit));
  }
  parts.join(" · ")
}

impl CommerceStore {
  pub fn new(app_data_dir: &Path) -> Self {
    let dir = app_data_dir.join("commerce");
    let images_dir = dir.join("product-images");
    let _ = std::fs::create_dir_all(&dir);
    let _ = std::fs::create_dir_all(&images_dir);
    let products_path = dir.join("products.json");
    let customers_path = dir.join("customers.json");

    let products = if products_path.is_file() {
      std::fs::read_to_string(&products_path)
        .ok()
        .and_then(|s| serde_json::from_str::<ProductFile>(&s).ok())
        .map(|f| {
          f.products
            .into_iter()
            .map(|mut p| {
              p.migrate_legacy();
              p
            })
            .collect::<Vec<_>>()
        })
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

    let stock_ledger_path = dir.join("stock_ledger.json");
    let stock_ledger = if stock_ledger_path.is_file() {
      std::fs::read_to_string(&stock_ledger_path)
        .ok()
        .and_then(|s| serde_json::from_str::<StockLedgerFile>(&s).ok())
        .map(|f| f.entries)
        .unwrap_or_default()
    } else {
      Vec::new()
    };

    Self {
      disk: Arc::new(Mutex::new(CommerceDisk {
        products_path,
        customers_path,
        stock_ledger_path,
        images_dir,
        app_data_dir: app_data_dir.to_path_buf(),
      })),
      products: Arc::new(Mutex::new(products)),
      customers: Arc::new(Mutex::new(customers)),
      stock_ledger: Arc::new(Mutex::new(stock_ledger)),
    }
  }

  /// Replace in-memory catalog with files under `account_data_dir`.
  pub fn reload_from(&self, account_data_dir: &Path) {
    let fresh = Self::new(account_data_dir);
    *self.disk.lock().unwrap() = fresh.disk.lock().unwrap().clone();
    *self.products.lock().unwrap() = fresh.products.lock().unwrap().clone();
    *self.customers.lock().unwrap() = fresh.customers.lock().unwrap().clone();
    *self.stock_ledger.lock().unwrap() = fresh.stock_ledger.lock().unwrap().clone();
  }

  fn persist_stock_ledger(&self) -> Result<(), String> {
    let entries = self.stock_ledger.lock().unwrap().clone();
    let file = StockLedgerFile {
      version: 1,
      entries,
    };
    let json = serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?;
    let path = self.disk.lock().unwrap().stock_ledger_path.clone();
    std::fs::write(&path, json).map_err(|e| e.to_string())
  }

  fn persist_products(&self) -> Result<(), String> {
    let products = self.products.lock().unwrap().clone();
    let file = ProductFile {
      version: 1,
      products,
    };
    let json = serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?;
    let path = self.disk.lock().unwrap().products_path.clone();
    std::fs::write(&path, json).map_err(|e| e.to_string())
  }

  fn persist_customers(&self) -> Result<(), String> {
    let customers = self.customers.lock().unwrap().clone();
    let file = CustomerFile {
      version: 1,
      customers,
    };
    let json = serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?;
    let path = self.disk.lock().unwrap().customers_path.clone();
    std::fs::write(&path, json).map_err(|e| e.to_string())
  }

  pub fn list_products(&self) -> Vec<Product> {
    let mut v = self.products.lock().unwrap().clone();
    for p in &mut v {
      p.migrate_legacy();
    }
    v.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    v
  }

  pub fn upsert_product(&self, mut p: Product, now: i64) -> Result<Product, String> {
    p.name = p.name.trim().to_string();
    if p.name.is_empty() {
      return Err("product name required".to_string());
    }
    if p.price_cents < 0 || p.cost_cents < 0 {
      return Err("price and cost must be >= 0".to_string());
    }
    p.migrate_legacy();
    p.base_unit = normalize_measure_unit(&p.base_unit)?;
    p.unit = p.base_unit.clone();
    p.stock_unit = if p.stock_unit.trim().is_empty() {
      String::new()
    } else {
      let su = normalize_measure_unit(&p.stock_unit)?;
      if !units_compatible(&su, &p.base_unit) {
        return Err(format!(
          "stock_unit {su} incompatible with base_unit {}",
          p.base_unit
        ));
      }
      su
    };
    p.sales_unit = if p.sales_unit.trim().is_empty() {
      String::new()
    } else {
      let su = normalize_measure_unit(&p.sales_unit)?;
      if !units_compatible(&su, &p.base_unit) {
        return Err(format!(
          "sales_unit {su} incompatible with base_unit {}",
          p.base_unit
        ));
      }
      su
    };
    p.supplier = p.supplier.trim().to_string();

    // Prefer stock_qty (UI) → milli; else explicit milli; else legacy quantity_in_stock.
    if let Some(qty) = p.stock_qty {
      if !qty.is_finite() || qty < 0.0 {
        return Err("stock must be >= 0".to_string());
      }
      let stock_u = p.effective_stock_unit();
      let base_amt = convert_to_base(qty, &stock_u, &p.base_unit)?;
      p.quantity_base_milli = to_milli(base_amt);
    } else if p.quantity_base_milli < 0 {
      return Err("stock must be >= 0".to_string());
    } else if p.quantity_base_milli == 0 && p.quantity_in_stock > 0 {
      let stock_u = p.effective_stock_unit();
      let base_amt = convert_to_base(p.quantity_in_stock as f64, &stock_u, &p.base_unit)?;
      p.quantity_base_milli = to_milli(base_amt);
    }
    p.stock_qty = None;
    // Sync legacy whole-unit field for older UI (floor of stock_unit display).
    p.quantity_in_stock = p
      .stock_display()
      .map(|(amt, _)| amt.floor() as i64)
      .unwrap_or(0)
      .max(0);

    let (w, wu) = normalize_weight(p.weight, &p.weight_unit)?;
    p.weight = w;
    p.weight_unit = wu;
    p.sku = p.sku.trim().to_string();
    p.description = p.description.trim().to_string();
    p.image_path = p.image_path.trim().to_string();

    let mut opts = Vec::new();
    for mut opt in p.sell_options.drain(..) {
      opt.label = opt.label.trim().to_string();
      if opt.label.is_empty() {
        continue;
      }
      if !opt.amount.is_finite() || opt.amount <= 0.0 {
        return Err(format!("sell option '{}' amount must be > 0", opt.label));
      }
      opt.unit = normalize_measure_unit(&opt.unit)?;
      if !units_compatible(&opt.unit, &p.base_unit) {
        return Err(format!(
          "sell option '{}' unit incompatible with base {}",
          opt.label, p.base_unit
        ));
      }
      if let Some(pc) = opt.price_cents {
        if pc < 0 {
          return Err(format!("sell option '{}' price must be >= 0", opt.label));
        }
      }
      if opt.id.trim().is_empty() {
        opt.id = Uuid::new_v4().to_string();
      }
      opts.push(opt);
    }
    p.sell_options = opts;

    p.updated_at = now;
    if p.id.trim().is_empty() {
      p.id = Uuid::new_v4().to_string();
    }
    {
      let mut list = self.products.lock().unwrap();
      if let Some(existing) = list.iter_mut().find(|x| x.id == p.id) {
        if p.image_path.is_empty() {
          p.image_path = existing.image_path.clone();
        }
        *existing = p.clone();
      } else {
        list.push(p.clone());
      }
    }
    self.persist_products()?;
    Ok(p)
  }

  pub fn set_product_image(
    &self,
    product_id: &str,
    bytes: &[u8],
    ext: &str,
    now: i64,
  ) -> Result<Product, String> {
    if bytes.is_empty() {
      return Err("image is empty".to_string());
    }
    if bytes.len() > 5_000_000 {
      return Err("image too large (max 5MB)".to_string());
    }
    let ext_lc = ext.trim().trim_start_matches('.').to_lowercase();
    let ext_norm = match ext_lc.as_str() {
      "png" => "png",
      "jpg" | "jpeg" => "jpg",
      "webp" => "webp",
      "gif" => "gif",
      _ => return Err("unsupported image type (use png/jpg/webp/gif)".to_string()),
    };
    let id = product_id.trim();
    if id.is_empty() {
      return Err("product id required".to_string());
    }
    // Ensure product exists
    {
      let list = self.products.lock().unwrap();
      if !list.iter().any(|p| p.id == id) {
        return Err("product not found".to_string());
      }
    }
    let disk = self.disk.lock().unwrap().clone();
    let fname = format!("{}.{}", id.replace('/', "_"), ext_norm);
    let full = disk.images_dir.join(&fname);
    std::fs::write(&full, bytes).map_err(|e| e.to_string())?;
    let rel = full
      .strip_prefix(&disk.app_data_dir)
      .unwrap_or(&full)
      .to_string_lossy()
      .to_string();
    let mut out = None;
    {
      let mut list = self.products.lock().unwrap();
      let p = list
        .iter_mut()
        .find(|x| x.id == id)
        .ok_or_else(|| "product not found".to_string())?;
      // best-effort remove previous file if different
      if !p.image_path.is_empty() && p.image_path != rel {
        let _ = std::fs::remove_file(disk.app_data_dir.join(&p.image_path));
      }
      p.image_path = rel;
      p.updated_at = now;
      out = Some(p.clone());
    }
    self.persist_products()?;
    out.ok_or_else(|| "product not found".to_string())
  }

  pub fn clear_product_image(&self, product_id: &str, now: i64) -> Result<Product, String> {
    let mut out = None;
    {
      let mut list = self.products.lock().unwrap();
      let p = list
        .iter_mut()
        .find(|x| x.id == product_id)
        .ok_or_else(|| "product not found".to_string())?;
      if !p.image_path.is_empty() {
        let app_data = self.disk.lock().unwrap().app_data_dir.clone();
        let _ = std::fs::remove_file(app_data.join(&p.image_path));
      }
      p.image_path.clear();
      p.updated_at = now;
      out = Some(p.clone());
    }
    self.persist_products()?;
    out.ok_or_else(|| "product not found".to_string())
  }

  pub fn read_product_image(&self, product_id: &str) -> Result<(Vec<u8>, String), String> {
    let path = {
      let list = self.products.lock().unwrap();
      list
        .iter()
        .find(|x| x.id == product_id)
        .map(|p| p.image_path.clone())
        .ok_or_else(|| "product not found".to_string())?
    };
    if path.is_empty() {
      return Err("no image".to_string());
    }
    let full = self.disk.lock().unwrap().app_data_dir.join(&path);
    let bytes = std::fs::read(&full).map_err(|e| e.to_string())?;
    let mime = if path.ends_with(".png") {
      "image/png"
    } else if path.ends_with(".webp") {
      "image/webp"
    } else if path.ends_with(".gif") {
      "image/gif"
    } else {
      "image/jpeg"
    };
    Ok((bytes, mime.to_string()))
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

  /// Adjust stock by a delta measured in **base milli-units**.
  pub fn adjust_stock_milli(&self, id: &str, delta_milli: i64, now: i64) -> Result<Product, String> {
    self.adjust_stock_milli_with_reason(id, delta_milli, "", now)
  }

  pub fn adjust_stock_milli_with_reason(
    &self,
    id: &str,
    delta_milli: i64,
    reason: &str,
    now: i64,
  ) -> Result<Product, String> {
    let mut out = None;
    {
      let mut list = self.products.lock().unwrap();
      let p = list
        .iter_mut()
        .find(|x| x.id == id)
        .ok_or_else(|| "product not found".to_string())?;
      p.migrate_legacy();
      let next = p.quantity_base_milli + delta_milli;
      if next < 0 {
        return Err("insufficient stock".to_string());
      }
      p.quantity_base_milli = next;
      p.quantity_in_stock = p
        .stock_display()
        .map(|(amt, _)| amt.floor() as i64)
        .unwrap_or(0)
        .max(0);
      p.updated_at = now;
      out = Some(p.clone());
    }
    self.persist_products()?;
    {
      let mut ledger = self.stock_ledger.lock().unwrap();
      ledger.push(StockLedgerEntry {
        id: Uuid::new_v4().to_string(),
        product_id: id.to_string(),
        delta_milli,
        reason: reason.trim().to_string(),
        created_at: now,
      });
      if ledger.len() > 5000 {
        let drain = ledger.len() - 5000;
        ledger.drain(0..drain);
      }
    }
    let _ = self.persist_stock_ledger();
    out.ok_or_else(|| "product not found".to_string())
  }

  pub fn list_stock_ledger(&self, product_id: Option<&str>, limit: usize) -> Vec<StockLedgerEntry> {
    let mut v = self.stock_ledger.lock().unwrap().clone();
    if let Some(pid) = product_id {
      v.retain(|e| e.product_id == pid);
    }
    v.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    v.into_iter().take(limit.max(1)).collect()
  }

  /// Legacy: delta in whole `stock_unit` (or base) amounts.
  pub fn adjust_stock(&self, id: &str, delta: i64, now: i64) -> Result<Product, String> {
    self.adjust_stock_with_reason(id, delta, "", now)
  }

  pub fn adjust_stock_with_reason(
    &self,
    id: &str,
    delta: i64,
    reason: &str,
    now: i64,
  ) -> Result<Product, String> {
    let base_unit;
    let stock_unit;
    {
      let list = self.products.lock().unwrap();
      let p = list
        .iter()
        .find(|x| x.id == id)
        .ok_or_else(|| "product not found".to_string())?;
      let mut tmp = p.clone();
      tmp.migrate_legacy();
      base_unit = tmp.effective_base_unit();
      stock_unit = tmp.effective_stock_unit();
    }
    let base_amt = convert_to_base(delta as f64, &stock_unit, &base_unit)?;
    self.adjust_stock_milli_with_reason(id, to_milli(base_amt), reason, now)
  }

  pub fn export_products_csv(&self) -> String {
    let mut out = String::from(
      "id,sku,name,description,price_cents,cost_cents,supplier,base_unit,stock_unit,sales_unit,quantity_base_milli,low_stock_threshold_milli\n",
    );
    for p in self.list_products() {
      let mut p = p;
      p.migrate_legacy();
      out.push_str(&format!(
        "{},{},{},{},{},{},{},{},{},{},{},{}\n",
        csv_escape(&p.id),
        csv_escape(&p.sku),
        csv_escape(&p.name),
        csv_escape(&p.description),
        p.price_cents,
        p.cost_cents,
        csv_escape(&p.supplier),
        csv_escape(&p.base_unit),
        csv_escape(&p.stock_unit),
        csv_escape(&p.sales_unit),
        p.quantity_base_milli,
        p.low_stock_threshold_milli,
      ));
    }
    out
  }

  /// Parse CSV; dry_run=true returns preview without writing.
  pub fn import_products_csv(&self, csv: &str, dry_run: bool, now: i64) -> Result<CsvImportPreview, String> {
    let mut lines = csv.lines().filter(|l| !l.trim().is_empty());
    let header = lines
      .next()
      .ok_or_else(|| "CSV is empty".to_string())?
      .to_lowercase();
    let cols: Vec<String> = split_csv_line(&header);
    let idx = |name: &str| cols.iter().position(|c| c.as_str() == name);
    let i_id = idx("id");
    let i_sku = idx("sku");
    let i_name = idx("name").ok_or_else(|| "CSV needs a name column".to_string())?;
    let i_desc = idx("description");
    let i_price = idx("price_cents");
    let i_cost = idx("cost_cents");
    let i_supplier = idx("supplier");
    let i_base = idx("base_unit");
    let i_stock_u = idx("stock_unit");
    let i_sales_u = idx("sales_unit");
    let i_qty = idx("quantity_base_milli");
    let i_low = idx("low_stock_threshold_milli");

    let existing = self.list_products();
    let mut upserts = 0usize;
    let mut creates = 0usize;
    let mut errors = Vec::new();
    let mut sample = Vec::new();
    let mut pending: Vec<Product> = Vec::new();

    for (row_i, line) in lines.enumerate() {
      let row = split_csv_line(line);
      let get = |i: Option<usize>| -> String {
        i.and_then(|ix| row.get(ix).cloned()).unwrap_or_default()
      };
      let name = get(Some(i_name)).trim().to_string();
      if name.is_empty() {
        errors.push(format!("row {}: name required", row_i + 2));
        continue;
      }
      let id = get(i_id).trim().to_string();
      let sku = get(i_sku).trim().to_string();
      let match_existing = existing.iter().find(|p| {
        (!id.is_empty() && p.id == id) || (!sku.is_empty() && !p.sku.is_empty() && p.sku == sku)
      });
      let mut product = match match_existing {
        Some(p) => {
          upserts += 1;
          p.clone()
        }
        None => {
          creates += 1;
          Product {
            id: if id.is_empty() {
              Uuid::new_v4().to_string()
            } else {
              id.clone()
            },
            name: name.clone(),
            description: String::new(),
            sku: sku.clone(),
            price_cents: 0,
            cost_cents: 0,
            supplier: String::new(),
            base_unit: "ea".into(),
            stock_unit: String::new(),
            sales_unit: String::new(),
            quantity_base_milli: 0,
            quantity_in_stock: 0,
            stock_qty: None,
            unit: "ea".into(),
            weight: 0.0,
            weight_unit: String::new(),
            image_path: String::new(),
            sell_options: vec![],
            low_stock_threshold_milli: 0,
            updated_at: now,
          }
        }
      };
      product.name = name;
      if !sku.is_empty() {
        product.sku = sku;
      }
      if let Some(d) = i_desc {
        product.description = get(Some(d));
      }
      if let Some(px) = i_price {
        if let Ok(v) = get(Some(px)).parse::<i64>() {
          product.price_cents = v;
        }
      }
      if let Some(cx) = i_cost {
        if let Ok(v) = get(Some(cx)).parse::<i64>() {
          product.cost_cents = v;
        }
      }
      if let Some(sx) = i_supplier {
        product.supplier = get(Some(sx));
      }
      if let Some(bx) = i_base {
        let b = get(Some(bx));
        if !b.is_empty() {
          if let Ok(u) = normalize_measure_unit(&b) {
            product.base_unit = u;
          }
        }
      }
      if let Some(su) = i_stock_u {
        product.stock_unit = get(Some(su));
      }
      if let Some(su) = i_sales_u {
        product.sales_unit = get(Some(su));
      }
      if let Some(qx) = i_qty {
        if let Ok(v) = get(Some(qx)).parse::<i64>() {
          product.quantity_base_milli = v.max(0);
        }
      }
      if let Some(lx) = i_low {
        if let Ok(v) = get(Some(lx)).parse::<i64>() {
          product.low_stock_threshold_milli = v.max(0);
        }
      }
      product.migrate_legacy();
      if sample.len() < 5 {
        sample.push(format!("{} ({})", product.name, product.sku));
      }
      pending.push(product);
    }

    let preview = CsvImportPreview {
      upserts,
      creates,
      errors: errors.clone(),
      sample,
    };
    if dry_run {
      return Ok(preview);
    }
    if !errors.is_empty() && pending.is_empty() {
      return Err(errors.join("; "));
    }
    for p in pending {
      self.upsert_product(p, now)?;
    }
    Ok(preview)
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

fn csv_escape(s: &str) -> String {
  if s.contains(',') || s.contains('"') || s.contains('\n') {
    format!("\"{}\"", s.replace('"', "\"\""))
  } else {
    s.to_string()
  }
}

fn split_csv_line(line: &str) -> Vec<String> {
  let mut out = Vec::new();
  let mut cur = String::new();
  let mut in_quotes = false;
  let mut chars = line.chars().peekable();
  while let Some(c) = chars.next() {
    match c {
      '"' => {
        if in_quotes && chars.peek() == Some(&'"') {
          cur.push('"');
          chars.next();
        } else {
          in_quotes = !in_quotes;
        }
      }
      ',' if !in_quotes => {
        out.push(cur);
        cur = String::new();
      }
      _ => cur.push(c),
    }
  }
  out.push(cur);
  out
}

/// Format catalog for IVR SMS-style reply (keep short).
pub fn format_catalog_list(products: &[Product], max_items: usize) -> String {
  if products.is_empty() {
    return "No products in the catalog yet. Reply 0 for the main menu.".to_string();
  }
  let mut lines = vec!["Products:".to_string()];
  for (i, p) in products.iter().take(max_items).enumerate() {
    let mut p = p.clone();
    p.migrate_legacy();
    let base = p.effective_base_unit();
    let sales = p.effective_sales_unit();
    let dollars = p.price_cents as f64 / 100.0;
    let price = if base == "ea" {
      format!("${:.2}", dollars)
    } else {
      format!("${:.2}/{}", dollars, base)
    };
    let stock = p
      .stock_display()
      .map(|(amt, u)| {
        if (amt - amt.trunc()).abs() < 1e-6 {
          format!("{} {} left", amt as i64, u)
        } else {
          format!("{:.2} {} left", amt, u)
        }
      })
      .unwrap_or_else(|_| "stock ?".into());
    let mut extra = String::new();
    if sales != base {
      extra.push_str(&format!(" · sell by {}", sales));
    }
    if !p.sell_options.is_empty() {
      let labels: Vec<&str> = p.sell_options.iter().map(|o| o.label.as_str()).collect();
      extra.push_str(&format!(" · packs: {}", labels.join(", ")));
    }
    lines.push(format!(
      "{}. {} — {} ({}){}",
      i + 1,
      p.name,
      price,
      stock,
      extra
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

  fn sample_ea() -> Product {
    Product {
      id: "1".into(),
      name: "Widget".into(),
      description: String::new(),
      sku: "W1".into(),
      price_cents: 1299,
      cost_cents: 400,
      supplier: String::new(),
      base_unit: "ea".into(),
      stock_unit: String::new(),
      sales_unit: String::new(),
      quantity_base_milli: 4000,
      quantity_in_stock: 4,
      stock_qty: None,
      unit: "ea".into(),
      weight: 0.0,
      weight_unit: String::new(),
      image_path: String::new(),
      sell_options: vec![],
      low_stock_threshold_milli: 0,
      updated_at: 0,
    }
  }

  fn sample_sugar() -> Product {
    Product {
      id: "2".into(),
      name: "Sugar".into(),
      description: String::new(),
      sku: String::new(),
      price_cents: 2, // $0.02 per gram
      cost_cents: 1,
      supplier: "Bulk Foods Co".into(),
      base_unit: "g".into(),
      stock_unit: "oz".into(),
      sales_unit: "oz".into(),
      quantity_base_milli: to_milli(convert_to_base(1.0, "oz", "g").unwrap()), // 1 oz
      quantity_in_stock: 0,
      stock_qty: None,
      unit: "g".into(),
      weight: 0.0,
      weight_unit: String::new(),
      image_path: String::new(),
      sell_options: vec![SellOption {
        id: "half".into(),
        label: "Half oz".into(),
        amount: 0.5,
        unit: "oz".into(),
        price_cents: None,
      }],
      low_stock_threshold_milli: 0,
      updated_at: 0,
    }
  }

  #[test]
  fn format_empty_catalog() {
    let s = format_catalog_list(&[], 10);
    assert!(s.contains("No products"));
  }

  #[test]
  fn format_lists_price_and_stock() {
    let s = format_catalog_list(&[sample_ea()], 10);
    assert!(s.contains("Widget"));
    assert!(s.contains("$12.99"));
    assert!(s.contains("4 ea left") || s.contains("4 left"));
  }

  #[test]
  fn sugar_half_oz_quote_and_stock() {
    let p = sample_sugar();
    let (total, milli) = p.quote_sale(0.0, "oz", Some("half")).unwrap();
    assert!(milli > 14_000 && milli < 15_000);
    // 0.5 oz ≈ 14.17 g * 2¢ ≈ 28¢
    assert!((28..=29).contains(&total));
    let (amt, u) = p.stock_display().unwrap();
    assert_eq!(u, "oz");
    assert!(
      (amt - 1.0).abs() < 1e-3,
      "expected ~1 oz stock, got {amt}"
    );
  }

  #[test]
  fn normalize_measure_and_weight() {
    assert_eq!(normalize_measure_unit("").unwrap(), "ea");
    assert_eq!(normalize_measure_unit("Each").unwrap(), "ea");
    assert!(normalize_measure_unit("stone").is_err());
    assert_eq!(normalize_weight(0.0, "").unwrap(), (0.0, String::new()));
    assert!(normalize_weight(1.0, "").is_err());
    assert_eq!(normalize_weight(2.5, "KG").unwrap(), (2.5, "kg".into()));
  }

  #[test]
  fn upsert_rejects_bad_unit() {
    let dir = std::env::temp_dir().join(format!("signalx-commerce-u-{}", std::process::id()));
    let _ = std::fs::create_dir_all(&dir);
    let store = CommerceStore::new(&dir);
    let err = store
      .upsert_product(
        Product {
          id: String::new(),
          name: "X".into(),
          description: String::new(),
          sku: String::new(),
          price_cents: 100,
          cost_cents: 0,
          supplier: String::new(),
          base_unit: "stone".into(),
          stock_unit: String::new(),
          sales_unit: String::new(),
          quantity_base_milli: 1000,
          quantity_in_stock: 1,
          stock_qty: None,
          unit: "stone".into(),
          weight: 0.0,
          weight_unit: String::new(),
          image_path: String::new(),
          sell_options: vec![],
          low_stock_threshold_milli: 0,
          updated_at: 0,
        },
        1,
      )
      .unwrap_err();
    assert!(err.contains("unit") || err.contains("unsupported"));
    let _ = std::fs::remove_dir_all(&dir);
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
          cost_cents: 0,
          supplier: String::new(),
          base_unit: "ea".into(),
          stock_unit: String::new(),
          sales_unit: String::new(),
          quantity_base_milli: 1000,
          quantity_in_stock: 1,
          stock_qty: None,
          unit: "ea".into(),
          weight: 0.0,
          weight_unit: String::new(),
          image_path: String::new(),
          sell_options: vec![],
          low_stock_threshold_milli: 0,
          updated_at: 0,
        },
        1,
      )
      .unwrap();
    assert!(store.adjust_stock(&p.id, -2, 2).is_err());
    assert_eq!(
      store.adjust_stock(&p.id, -1, 3).unwrap().quantity_base_milli,
      0
    );
    let _ = std::fs::remove_dir_all(&dir);
  }

  #[test]
  fn reload_from_does_not_touch_other_account_stock() {
    let root = std::env::temp_dir().join(format!(
      "signalx-commerce-iso-{}",
      std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis()
    ));
    let dir_a = root.join("a");
    let dir_b = root.join("b");
    let _ = std::fs::create_dir_all(&dir_a);
    let _ = std::fs::create_dir_all(&dir_b);
    let store_a = CommerceStore::new(&dir_a);
    let pa = store_a
      .upsert_product(
        Product {
          id: "shared".into(),
          name: "Widget".into(),
          description: String::new(),
          sku: String::new(),
          price_cents: 100,
          cost_cents: 0,
          supplier: String::new(),
          base_unit: "ea".into(),
          stock_unit: String::new(),
          sales_unit: String::new(),
          quantity_base_milli: 5000,
          quantity_in_stock: 5,
          stock_qty: None,
          unit: "ea".into(),
          weight: 0.0,
          weight_unit: String::new(),
          image_path: String::new(),
          sell_options: vec![],
          low_stock_threshold_milli: 0,
          updated_at: 0,
        },
        1,
      )
      .unwrap();
    let store_b = CommerceStore::new(&dir_b);
    let pb = store_b
      .upsert_product(
        Product {
          id: "shared".into(),
          name: "Widget".into(),
          description: String::new(),
          sku: String::new(),
          price_cents: 100,
          cost_cents: 0,
          supplier: String::new(),
          base_unit: "ea".into(),
          stock_unit: String::new(),
          sales_unit: String::new(),
          quantity_base_milli: 5000,
          quantity_in_stock: 5,
          stock_qty: None,
          unit: "ea".into(),
          weight: 0.0,
          weight_unit: String::new(),
          image_path: String::new(),
          sell_options: vec![],
          low_stock_threshold_milli: 0,
          updated_at: 0,
        },
        1,
      )
      .unwrap();
    // Live store switches to B and decrements
    store_a.reload_from(&dir_b);
    store_a.adjust_stock(&pb.id, -2, 2).unwrap();
    store_a.reload_from(&dir_a);
    let again = store_a.list_products();
    assert_eq!(again[0].id, pa.id);
    assert_eq!(again[0].quantity_base_milli, 5000);
    let _ = std::fs::remove_dir_all(&root);
  }
}
