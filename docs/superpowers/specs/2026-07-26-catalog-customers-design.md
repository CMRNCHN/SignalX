# Catalog + Customers Design

**Date:** 2026-07-26  
**Status:** Approved (product north star)  
**Depends on:** Foundation hardening, IVR v1

## Goal

Local product catalog and customer records tied to Signal threads, editable in the GUI, readable by the IVR “browse products” path.

## Data (app data `commerce/`)

**Product** — `id`, `name`, `description`, `sku`, `price_cents`, `quantity_in_stock`, `updated_at`  
**Customer** — `id`, `thread_id` (e.g. `dm:+1…`), `display_name`, `notes`, `updated_at`

Files: `commerce/products.json`, `commerce/customers.json`. Single-account app — no per-account split.

## Behavior

- GUI panels: Products (list/add/edit/stock), Customers (list; create/link from selected thread).
- IVR: replace demo `info` node with `browse` that replies a short product list (name · price · stock); `0` back to main. Menu JSON updated in default demo + migrate on load if `info` still present.
- Privacy: catalog/customers never sent to Ollama; IVR only sends the list text the customer asked for via outbox.

## Non-goals

- Orders/invoices (next slice)
- Multi-currency, variants, images
- Sync to external inventory

## Success

- CRUD products + customers in UI  
- IVR browse lists live catalog  
- Unit tests for catalog list formatting / stock decrement helper (orders will use later)
