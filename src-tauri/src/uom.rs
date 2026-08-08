//! Unit-of-measure conversion for commerce (weight / volume / each).

/// Convert `amount` in `from_unit` into `base_unit`.
pub fn convert_to_base(amount: f64, from_unit: &str, base_unit: &str) -> Result<f64, String> {
  if !amount.is_finite() {
    return Err("amount must be finite".to_string());
  }
  let from = norm_unit(from_unit)?;
  let base = norm_unit(base_unit)?;
  if family(&from)? != family(&base)? {
    return Err(format!("cannot convert {from} to {base}"));
  }
  if from == base {
    return Ok(amount);
  }
  let from_canon = to_canonical(amount, &from)?;
  let base_factor = canonical_per_unit(&base)?;
  Ok(from_canon / base_factor)
}

/// Convert an amount measured in `base_unit` into `to_unit`.
pub fn convert_from_base(amount_base: f64, to_unit: &str, base_unit: &str) -> Result<f64, String> {
  if !amount_base.is_finite() {
    return Err("amount must be finite".to_string());
  }
  let to = norm_unit(to_unit)?;
  let base = norm_unit(base_unit)?;
  if family(&to)? != family(&base)? {
    return Err(format!("cannot convert {base} to {to}"));
  }
  if to == base {
    return Ok(amount_base);
  }
  let base_canon = to_canonical(amount_base, &base)?;
  let to_factor = canonical_per_unit(&to)?;
  Ok(base_canon / to_factor)
}

pub fn units_compatible(a: &str, b: &str) -> bool {
  match (family(a), family(b)) {
    (Ok(fa), Ok(fb)) => fa == fb,
    _ => false,
  }
}

fn norm_unit(raw: &str) -> Result<String, String> {
  let u = raw.trim().to_lowercase();
  let u = match u.as_str() {
    "" | "each" | "unit" | "units" => "ea".to_string(),
    "liter" | "litre" | "liters" | "litres" => "l".to_string(),
    "gram" | "grams" => "g".to_string(),
    "ounce" | "ounces" => "oz".to_string(),
    "pound" | "pounds" | "lbs" => "lb".to_string(),
    other => other.to_string(),
  };
  match u.as_str() {
    "ea" | "g" | "kg" | "oz" | "lb" | "ml" | "l" => Ok(u),
    _ => Err(format!("unsupported unit: {raw}")),
  }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Family {
  Each,
  Weight,
  Volume,
}

fn family(unit: &str) -> Result<Family, String> {
  let u = norm_unit(unit)?;
  Ok(match u.as_str() {
    "ea" => Family::Each,
    "g" | "kg" | "oz" | "lb" => Family::Weight,
    "ml" | "l" => Family::Volume,
    _ => return Err(format!("unsupported unit: {unit}")),
  })
}

/// Canonical measure: ea→1, weight→grams, volume→milliliters.
fn canonical_per_unit(unit: &str) -> Result<f64, String> {
  let u = norm_unit(unit)?;
  Ok(match u.as_str() {
    "ea" => 1.0,
    "g" => 1.0,
    "kg" => 1000.0,
    "oz" => 28.349523125,
    "lb" => 453.59237,
    "ml" => 1.0,
    "l" => 1000.0,
    _ => return Err(format!("unsupported unit: {unit}")),
  })
}

fn to_canonical(amount: f64, unit: &str) -> Result<f64, String> {
  Ok(amount * canonical_per_unit(unit)?)
}

/// Round base amount to milli-units (1/1000 of base unit).
pub fn to_milli(amount_base: f64) -> i64 {
  (amount_base * 1000.0).round() as i64
}

pub fn from_milli(milli: i64) -> f64 {
  milli as f64 / 1000.0
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn oz_to_grams_base() {
    let g = convert_to_base(1.0, "oz", "g").unwrap();
    assert!((g - 28.349523125).abs() < 1e-9);
  }

  #[test]
  fn half_oz_from_gram_stock() {
    let base_g = convert_to_base(0.5, "oz", "g").unwrap();
    assert!((base_g - 14.1747615625).abs() < 1e-9);
    let milli = to_milli(base_g);
    assert!(milli > 14_000 && milli < 15_000);
  }

  #[test]
  fn stock_oz_display_from_gram_base() {
    let oz = convert_from_base(28.349523125, "oz", "g").unwrap();
    assert!((oz - 1.0).abs() < 1e-9);
  }

  #[test]
  fn ea_incompatible_with_weight() {
    assert!(!units_compatible("ea", "g"));
    assert!(units_compatible("oz", "g"));
    assert!(convert_to_base(1.0, "ea", "g").is_err());
  }
}
