//! Input validation helpers for commerce and IVR fields.

pub const MAX_NAME_LENGTH: usize = 200;
pub const MAX_SKU_LENGTH: usize = 100;
pub const MIN_PIN_LENGTH: usize = 4;
pub const MAX_PIN_LENGTH: usize = 8;
pub const MAX_STOCK_QUANTITY: f64 = 1_000_000.0;
pub const MAX_PRICE_CENTS: i64 = 999_999_999; // $9,999,999.99

pub struct ValidationError(pub String);

impl From<ValidationError> for String {
  fn from(e: ValidationError) -> Self {
    e.0
  }
}

pub fn validate_name(name: &str, field_name: &str) -> Result<(), ValidationError> {
  let trimmed = name.trim();
  if trimmed.is_empty() {
    return Err(ValidationError(format!("{} cannot be empty", field_name)));
  }
  if trimmed.len() > MAX_NAME_LENGTH {
    return Err(ValidationError(format!(
      "{} cannot exceed {} characters",
      field_name, MAX_NAME_LENGTH
    )));
  }
  Ok(())
}

pub fn validate_and_normalize_sku(sku: &str) -> Result<String, ValidationError> {
  let trimmed = sku.trim();

  if trimmed.is_empty() {
    return Ok(String::new()); // Empty SKU is allowed
  }

  // Normalize: uppercase and collapse internal whitespace
  let normalized = trimmed
    .split_whitespace()
    .collect::<Vec<_>>()
    .join(" ")
    .to_uppercase();

  if normalized.len() > MAX_SKU_LENGTH {
    return Err(ValidationError(format!(
      "SKU cannot exceed {} characters",
      MAX_SKU_LENGTH
    )));
  }

  Ok(normalized)
}

pub fn validate_numeric(value: f64, field_name: &str, allow_negative: bool, max_value: Option<f64>) -> Result<(), ValidationError> {
  if !value.is_finite() || value.is_nan() {
    return Err(ValidationError(format!("{} must be a valid number", field_name)));
  }

  if !allow_negative && value < 0.0 {
    return Err(ValidationError(format!("{} cannot be negative", field_name)));
  }

  if let Some(max) = max_value {
    if value > max {
      return Err(ValidationError(format!(
        "{} cannot exceed {}",
        field_name, max
      )));
    }
  }

  Ok(())
}

pub fn validate_stock_quantity(qty: f64) -> Result<(), ValidationError> {
  validate_numeric(qty, "Stock quantity", false, Some(MAX_STOCK_QUANTITY))
}

pub fn validate_price(price_cents: i64) -> Result<(), ValidationError> {
  if price_cents < 0 {
    return Err(ValidationError("Price cannot be negative".to_string()));
  }
  if price_cents > MAX_PRICE_CENTS {
    return Err(ValidationError(format!(
      "Price cannot exceed ${}",
      MAX_PRICE_CENTS / 100
    )));
  }
  Ok(())
}

pub fn validate_pin(pin: &str) -> Result<(), ValidationError> {
  let trimmed = pin.trim();

  if trimmed.len() < MIN_PIN_LENGTH {
    return Err(ValidationError(format!(
      "PIN must be at least {} digits",
      MIN_PIN_LENGTH
    )));
  }

  if trimmed.len() > MAX_PIN_LENGTH {
    return Err(ValidationError(format!(
      "PIN cannot exceed {} digits",
      MAX_PIN_LENGTH
    )));
  }

  if !trimmed.chars().all(|c| c.is_ascii_digit()) {
    return Err(ValidationError("PIN must contain only digits".to_string()));
  }

  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn validates_name() {
    assert!(validate_name("Product", "Name").is_ok());
    assert!(validate_name("  Product  ", "Name").is_ok());
    assert!(validate_name("", "Name").is_err());
    assert!(validate_name("   ", "Name").is_err());
  }

  #[test]
  fn normalizes_sku() {
    assert_eq!(validate_and_normalize_sku("abc").unwrap(), "ABC");
    assert_eq!(validate_and_normalize_sku("abc  def").unwrap(), "ABC DEF");
    assert_eq!(validate_and_normalize_sku("  abc  ").unwrap(), "ABC");
    assert_eq!(validate_and_normalize_sku("").unwrap(), "");
  }

  #[test]
  fn validates_stock_quantity() {
    assert!(validate_stock_quantity(0.5).is_ok());
    assert!(validate_stock_quantity(100.0).is_ok());
    assert!(validate_stock_quantity(-1.0).is_err());
    assert!(validate_stock_quantity(MAX_STOCK_QUANTITY + 1.0).is_err());
  }

  #[test]
  fn validates_price() {
    assert!(validate_price(100).is_ok());
    assert!(validate_price(999_999_999).is_ok());
    assert!(validate_price(-1).is_err());
    assert!(validate_price(1_000_000_000).is_err());
  }

  #[test]
  fn validates_pin() {
    assert!(validate_pin("1234").is_ok());
    assert!(validate_pin("12345678").is_ok());
    assert!(validate_pin("123").is_err());
    assert!(validate_pin("123456789").is_err());
    assert!(validate_pin("123a").is_err());
  }
}
