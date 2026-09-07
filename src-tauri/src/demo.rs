//! Sample CRM data so every panel has people, threads, products, and orders.
//! Seeds once when the active account has no threads.

use crate::commerce::{Customer, Product, SellOption};
use crate::ivr::{IvrChoice, IvrMenus, IvrSettings};
use crate::orders::{Order, OrderLine};
use crate::{
  now_ms, AutoReplyAuditEntry, AutoReplySettings, ContactMetaPatch, Direction, GroupMetaPatch,
  Message, OutboxItem, AppState,
};

pub const LOCAL_ACCOUNT_ID: &str = "_local";

pub const MAYA: &str = "dm:+14155550101";
pub const JORDAN: &str = "dm:+14155550102";
pub const PRIYA: &str = "dm:+12025550103";
pub const SAM: &str = "dm:+13035550104";
pub const SATURDAY: &str = "group:saturday-drop";

pub const PID_WIDGET: &str = "demo-hello-widget";
pub const PID_INCENSE: &str = "demo-cedar-incense";
pub const PID_COLDBREW: &str = "demo-cold-brew";
pub const PID_TOTE: &str = "demo-linen-tote";
pub const PID_HONEY: &str = "demo-honey-8oz";

const HOUR_MS: i64 = 3_600_000;

fn ago(hours: i64) -> i64 {
  now_ms().saturating_sub(hours * HOUR_MS)
}

fn product(
  id: &str,
  name: &str,
  description: &str,
  sku: &str,
  price_cents: i64,
  cost_cents: i64,
  supplier: &str,
  milli: i64,
  low_milli: i64,
  packs: Vec<SellOption>,
) -> Product {
  Product {
    id: id.to_string(),
    name: name.to_string(),
    description: description.to_string(),
    sku: sku.to_string(),
    price_cents,
    cost_cents,
    supplier: supplier.to_string(),
    base_unit: "ea".into(),
    stock_unit: String::new(),
    sales_unit: String::new(),
    quantity_base_milli: milli,
    quantity_in_stock: milli / 1000,
    stock_qty: None,
    unit: "ea".into(),
    weight: 0.0,
    weight_unit: String::new(),
    image_path: String::new(),
    sell_options: packs,
    low_stock_threshold_milli: low_milli,
    updated_at: now_ms(),
  }
}

fn msg(
  id: &str,
  thread: &str,
  hours_ago: i64,
  sender: &str,
  content: &str,
  incoming: bool,
) -> Message {
  Message {
    id: id.to_string(),
    thread_id: thread.to_string(),
    timestamp: ago(hours_ago),
    sender: sender.to_string(),
    recipient: if incoming {
      None
    } else {
      Some(thread.trim_start_matches("dm:").to_string())
    },
    content: content.to_string(),
    direction: if incoming {
      Direction::Incoming
    } else {
      Direction::Outgoing
    },
    raw_json: None,
  }
}

fn name_patch(name: &str, favorite: bool, muted: bool, auto: bool) -> ContactMetaPatch {
  ContactMetaPatch {
    display_name: Some(Some(name.to_string())),
    alias: None,
    categories: Some(vec![]),
    favorite: Some(favorite),
    muted: Some(muted),
    icon: None,
    apple_contact_id: None,
    custom_fields: None,
    auto_reply_enabled: Some(auto),
  }
}

fn seed_products(state: &AppState) -> std::collections::HashMap<String, String> {
  let now = now_ms();
  let existing: std::collections::HashMap<String, String> = state
    .commerce
    .list_products()
    .into_iter()
    .map(|p| (p.name.to_lowercase(), p.id))
    .collect();
  let honey_packs = vec![
    SellOption {
      id: "pack-honey-single".into(),
      label: "8 oz jar".into(),
      amount: 1.0,
      unit: "ea".into(),
      price_cents: Some(1400),
    },
    SellOption {
      id: "pack-honey-trio".into(),
      label: "Three-jar set".into(),
      amount: 3.0,
      unit: "ea".into(),
      price_cents: Some(3600),
    },
  ];
  let catalog = [
    product(
      PID_WIDGET,
      "Hello World Widget",
      "Desk toy that lights up when an order confirms.",
      "HW-001",
      999,
      220,
      "SignalX Labs",
      24_000,
      5_000,
      vec![],
    ),
    product(
      PID_INCENSE,
      "Cedar incense cones",
      "Box of 20 cones. Slow cedar burn, about 25 minutes each.",
      "INC-CED-20",
      1600,
      480,
      "North Shore Goods",
      40_000,
      8_000,
      vec![],
    ),
    product(
      PID_COLDBREW,
      "Cold brew concentrate",
      "32 oz bottle. Dilute 1:1. Keep refrigerated.",
      "CB-32",
      1800,
      610,
      "Harbor Roasters",
      6_000,
      8_000,
      vec![],
    ),
    product(
      PID_TOTE,
      "Linen tote",
      "Natural linen, one pocket. Restock next week.",
      "TOTE-LN",
      2800,
      900,
      "Millwork Co",
      0,
      2_000,
      vec![],
    ),
    product(
      PID_HONEY,
      "Wildflower honey",
      "Raw, unfiltered. 8 oz glass jar.",
      "HON-8",
      1400,
      400,
      "Ridge Apiary",
      18_000,
      4_000,
      honey_packs,
    ),
  ];
  let mut ids = std::collections::HashMap::new();
  for p in catalog {
    let key = p.id.clone();
    if let Some(existing_id) = existing.get(&p.name.to_lowercase()) {
      ids.insert(key, existing_id.clone());
      continue;
    }
    let saved_id = match state.commerce.upsert_product(p, now) {
      Ok(saved) => saved.id,
      Err(_) => key.clone(),
    };
    ids.insert(key, saved_id);
  }
  ids
}

fn drop_duplicate_named_products(state: &AppState) {
  let keep: std::collections::HashSet<String> = [
    PID_WIDGET, PID_INCENSE, PID_COLDBREW, PID_TOTE, PID_HONEY,
  ]
  .into_iter()
  .map(|s| s.to_string())
  .collect();
  let names: std::collections::HashSet<String> = state
    .commerce
    .list_products()
    .into_iter()
    .filter(|p| keep.contains(&p.id))
    .map(|p| p.name.to_lowercase())
    .collect();
  for p in state.commerce.list_products() {
    if names.contains(&p.name.to_lowercase()) && !keep.contains(&p.id) {
      let _ = state.commerce.delete_product(&p.id);
    }
  }
}

fn seed_people(state: &AppState, account: &str) {
  let _ = state.contact_store.upsert_patch(
    account,
    MAYA,
    name_patch("Maya Chen", true, false, false),
  );
  let _ = state.contact_store.upsert_patch(
    account,
    JORDAN,
    name_patch("Jordan Hale", false, false, false),
  );
  let _ = state.contact_store.upsert_patch(
    account,
    PRIYA,
    name_patch("Priya Shah", false, false, true),
  );
  let _ = state.contact_store.upsert_patch(
    account,
    SAM,
    name_patch("Sam Ortiz", false, true, false),
  );
  let _ = state.group_store.upsert_patch(
    account,
    SATURDAY,
    GroupMetaPatch {
      display_name: Some(Some("Saturday drop".into())),
      categories: Some(vec!["wholesale".into()]),
      favorite: Some(true),
      muted: Some(false),
      icon: None,
      custom_fields: None,
      member_notes: Some(vec![
        "+14155550101".into(),
        "+14155550102".into(),
        "+12025550103".into(),
      ]),
      auto_reply_enabled: Some(false),
    },
  );
  let _ = state.alias_manager.set_alias(account, "+14155550101", "Maya Chen");
}

fn seed_threads(state: &AppState, account: &str) {
  let ts = state.account_manager.get_or_create(account);
  let rows: Vec<(Message, Vec<String>)> = vec![
    (
      msg("m-maya-1", MAYA, 30, "+14155550101", "Hey — do you still have the cedar incense?", true),
      vec![MAYA.to_string()],
    ),
    (
      msg("m-maya-2", MAYA, 29, "me", "Yes, boxes of 20. $16. I can hold one.", false),
      vec![MAYA.to_string()],
    ),
    (
      msg("m-maya-3", MAYA, 28, "+14155550101", "Hold two? I’ll pick up Saturday.", true),
      vec![MAYA.to_string()],
    ),
    (
      msg("m-maya-4", MAYA, 6, "me", "Packed. Invoice is in this chat — paid, thank you.", false),
      vec![MAYA.to_string()],
    ),
    (
      msg("m-maya-5", MAYA, 1, "+14155550101", "Can you add a honey jar to the next drop?", true),
      vec![MAYA.to_string()],
    ),
    (
      msg("m-jordan-1", JORDAN, 20, "+14155550102", "Need a quote for 3 widgets and a tote.", true),
      vec![JORDAN.to_string()],
    ),
    (
      msg("m-jordan-2", JORDAN, 19, "me", "Tote is out of stock until next week. Widgets are in — sending a quote for those.", false),
      vec![JORDAN.to_string()],
    ),
    (
      msg("m-jordan-3", JORDAN, 4, "+14155550102", "Ok, send the quote. I’ll wait on the tote.", true),
      vec![JORDAN.to_string()],
    ),
    (
      msg("m-priya-1", PRIYA, 12, "+12025550103", "1", true),
      vec![PRIYA.to_string()],
    ),
    (
      msg("m-priya-2", PRIYA, 12, "me", "Cedar incense cones · $16.00 · 40 left\nCold brew concentrate · $18.00 · 6 left (low)\nHello World Widget · $9.99 · 24 left\nWildflower honey · $14.00 · 18 left\n\nReply 2 to order, or 0 for the menu.", false),
      vec![PRIYA.to_string()],
    ),
    (
      msg("m-priya-3", PRIYA, 11, "+12025550103", "I’ll take the cold brew. Two bottles.", true),
      vec![PRIYA.to_string()],
    ),
    (
      msg("m-priya-4", PRIYA, 10, "me", "Locked in 2× Cold brew concentrate. Total $36.00. Reply 0 for the menu.", false),
      vec![PRIYA.to_string()],
    ),
    (
      msg("m-sam-1", SAM, 8, "+13035550104", "Is this the shop line?", true),
      vec![SAM.to_string()],
    ),
    (
      msg("m-sam-2", SAM, 7, "me", "Yes — Saturday drop and DMs. What are you looking for?", false),
      vec![SAM.to_string()],
    ),
    (
      msg("m-group-1", SATURDAY, 26, "+14155550101", "Route is the usual — 10am start at the mill.", true),
      vec![SATURDAY.to_string(), MAYA.to_string(), JORDAN.to_string()],
    ),
    (
      msg("m-group-2", SATURDAY, 25, "me", "Confirmed. Maya has two incense, Priya two cold brew. Jordan’s tote is waitlisted.", false),
      vec![SATURDAY.to_string()],
    ),
    (
      msg("m-group-3", SATURDAY, 3, "+14155550102", "I’ll skip this week if the tote isn’t in.", true),
      vec![SATURDAY.to_string()],
    ),
  ];
  for (m, parts) in rows {
    ts.add_message(m, parts);
  }
}

fn pid(ids: &std::collections::HashMap<String, String>, key: &str) -> String {
  ids.get(key).cloned().unwrap_or_else(|| key.to_string())
}

fn seed_customers_orders(state: &AppState, account: &str, ids: &std::collections::HashMap<String, String>) {
  let now = now_ms();
  let customers = [
    Customer {
      id: "cust-maya".into(),
      thread_id: MAYA.into(),
      display_name: "Maya Chen".into(),
      notes: "Favorite. Saturday pickup. Prefers incense and honey.".into(),
      updated_at: now,
    },
    Customer {
      id: "cust-jordan".into(),
      thread_id: JORDAN.into(),
      display_name: "Jordan Hale".into(),
      notes: "Waiting on linen tote restock. Quote out for widgets.".into(),
      updated_at: now,
    },
    Customer {
      id: "cust-priya".into(),
      thread_id: PRIYA.into(),
      display_name: "Priya Shah".into(),
      notes: "Uses the buyer menu. Auto-reply on.".into(),
      updated_at: now,
    },
  ];
  for c in customers {
    let _ = state.commerce.upsert_customer(c, now);
  }

  let orders = [
    Order {
      id: "ord-maya-paid".into(),
      customer_id: "cust-maya".into(),
      thread_id: MAYA.into(),
      status: "paid".into(),
      lines: vec![OrderLine {
        product_id: pid(ids, PID_INCENSE),
        name: "Cedar incense cones".into(),
        quantity: 2.0,
        unit_price_cents: 1600,
        unit: "ea".into(),
        quantity_base_milli: 2_000,
        line_total_cents: 3200,
        sell_option_label: String::new(),
      }],
      total_cents: 3200,
      created_at: ago(28),
      updated_at: ago(6),
    },
    Order {
      id: "ord-maya-open".into(),
      customer_id: "cust-maya".into(),
      thread_id: MAYA.into(),
      status: "confirmed".into(),
      lines: vec![OrderLine {
        product_id: pid(ids, PID_HONEY),
        name: "Wildflower honey".into(),
        quantity: 1.0,
        unit_price_cents: 1400,
        unit: "ea".into(),
        quantity_base_milli: 1_000,
        line_total_cents: 1400,
        sell_option_label: "8 oz jar".into(),
      }],
      total_cents: 1400,
      created_at: ago(1),
      updated_at: ago(1),
    },
    Order {
      id: "ord-jordan-quote".into(),
      customer_id: "cust-jordan".into(),
      thread_id: JORDAN.into(),
      status: "draft".into(),
      lines: vec![OrderLine {
        product_id: pid(ids, PID_WIDGET),
        name: "Hello World Widget".into(),
        quantity: 3.0,
        unit_price_cents: 999,
        unit: "ea".into(),
        quantity_base_milli: 3_000,
        line_total_cents: 2997,
        sell_option_label: String::new(),
      }],
      total_cents: 2997,
      created_at: ago(4),
      updated_at: ago(4),
    },
    Order {
      id: "ord-priya-brew".into(),
      customer_id: "cust-priya".into(),
      thread_id: PRIYA.into(),
      status: "fulfilled".into(),
      lines: vec![OrderLine {
        product_id: pid(ids, PID_COLDBREW),
        name: "Cold brew concentrate".into(),
        quantity: 2.0,
        unit_price_cents: 1800,
        unit: "ea".into(),
        quantity_base_milli: 2_000,
        line_total_cents: 3600,
        sell_option_label: String::new(),
      }],
      total_cents: 3600,
      created_at: ago(11),
      updated_at: ago(8),
    },
    Order {
      id: "ord-maya-old".into(),
      customer_id: "cust-maya".into(),
      thread_id: MAYA.into(),
      status: "cancelled".into(),
      lines: vec![OrderLine {
        product_id: pid(ids, PID_TOTE),
        name: "Linen tote".into(),
        quantity: 1.0,
        unit_price_cents: 2800,
        unit: "ea".into(),
        quantity_base_milli: 1_000,
        line_total_cents: 2800,
        sell_option_label: String::new(),
      }],
      total_cents: 2800,
      created_at: ago(40),
      updated_at: ago(38),
    },
  ];
  for o in orders {
    let _ = state.orders.insert_seeded(o);
  }

  state.commerce_audit.record(
    "order_paid",
    "Maya Chen paid $32.00 — Cedar incense cones ×2",
    Some("ord-maya-paid".into()),
    Some(pid(ids, PID_INCENSE)),
    Some(MAYA.into()),
    ago(6),
  );
  state.commerce_audit.record(
    "quote_sent",
    "Quote $29.97 to Jordan Hale — Hello World Widget ×3",
    Some("ord-jordan-quote".into()),
    Some(pid(ids, PID_WIDGET)),
    Some(JORDAN.into()),
    ago(4),
  );
  state.commerce_audit.record(
    "order_fulfilled",
    "Priya Shah fulfilled — Cold brew concentrate ×2",
    Some("ord-priya-brew".into()),
    Some(pid(ids, PID_COLDBREW)),
    Some(PRIYA.into()),
    ago(8),
  );

  let _ = state.outbox_store.add_item(OutboxItem {
    id: "outbox-jordan-quote".into(),
    account_id: account.to_string(),
    thread_id: JORDAN.into(),
    recipient: "+14155550102".into(),
    content: "Quote for 3× Hello World Widget — $29.97. Reply yes to confirm.".into(),
    attachment_path: None,
    created_at: ago(3),
    last_attempt_at: None,
    attempt_count: 0,
    state: "queued".into(),
    last_error: None,
  });

  state.auto_reply.append_audit(AutoReplyAuditEntry {
    id: "audit-priya-sent".into(),
    account_id: account.to_string(),
    thread_id: PRIYA.into(),
    message_id: "m-priya-1".into(),
    draft: "Cedar incense cones · $16.00 · 40 left".into(),
    created_at: ago(12),
    outcome: "sent".into(),
    reason: None,
  });
  state.auto_reply.append_audit(AutoReplyAuditEntry {
    id: "audit-sam-blocked".into(),
    account_id: account.to_string(),
    thread_id: SAM.into(),
    message_id: "m-sam-1".into(),
    draft: String::new(),
    created_at: ago(8),
    outcome: "blocked".into(),
    reason: Some("thread not on allowlist".into()),
  });
}

fn bind_ivr(state: &AppState, ids: &std::collections::HashMap<String, String>) {
  let mut menus = IvrMenus::default_demo();
  if let Some(main) = menus.nodes.get_mut("main") {
    main.prompt = "Hi — reply with a number:\n1 · See products\n2 · Place an order\n3 · Talk to us\n4 · Check order\n5 · Cedar incense\n6 · Cold brew\n0 · Menu".into();
    main.choices.insert(
      "5".into(),
      IvrChoice {
        goto: Some("order_qty".into()),
        action: Some("offer_product".into()),
        reply: Some("Cedar incense cones — $16 a box of 20. How many boxes?".into()),
        product_id: Some(pid(ids, PID_INCENSE)),
      },
    );
    main.choices.insert(
      "6".into(),
      IvrChoice {
        goto: Some("order_qty".into()),
        action: Some("offer_product".into()),
        reply: Some("Cold brew concentrate — $18 / 32 oz. How many bottles?".into()),
        product_id: Some(pid(ids, PID_COLDBREW)),
      },
    );
    main.on_unknown = Some("Reply 1–6, or 0 for the menu.".into());
  }
  let _ = state.ivr.set_menus(menus);
  let _ = state.ivr.set_settings(IvrSettings {
    enabled: true,
    allowlist: vec![PRIYA.into(), MAYA.into()],
    require_allowlist: true,
    hide_zero_stock: true,
  });
  let mut auto = AutoReplySettings::default();
  auto.enabled = true;
  auto.allowlist = vec![PRIYA.into()];
  let _ = state.auto_reply.set_settings(auto);
}

/// Fill empty local stores so Inbox / People / Catalog / Orders have records.
pub fn seed_if_empty(state: &AppState, account: &str) {
  let ts = state.account_manager.get_or_create(account);
  if ts.get_threads().is_empty() {
    eprintln!("SignalX: loading sample CRM data for {account}");
    let ids = seed_products(state);
    seed_people(state, account);
    seed_threads(state, account);
    seed_customers_orders(state, account, &ids);
    bind_ivr(state, &ids);
  }
  drop_duplicate_named_products(state);
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::ivr::IvrMenus;

  #[test]
  fn bound_digits_point_at_demo_products() {
    let mut menus = IvrMenus::default_demo();
    menus.nodes.get_mut("main").unwrap().choices.insert(
      "5".into(),
      IvrChoice {
        goto: Some("order_qty".into()),
        action: Some("offer_product".into()),
        reply: None,
        product_id: Some(PID_INCENSE.into()),
      },
    );
    let c = menus.nodes["main"].choices.get("5").unwrap();
    assert_eq!(c.product_id.as_deref(), Some(PID_INCENSE));
    assert_eq!(c.action.as_deref(), Some("offer_product"));
  }
}
