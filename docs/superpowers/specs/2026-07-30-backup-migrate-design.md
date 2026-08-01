# SignalX — backup / migrate (local-first)

Date: 2026-07-30  
Status: design only (no feature code in this pass)  
Related: plan §4 in `docs/superpowers/plans/2026-07-30-order-outbox-attach-backup.md`

## Goal

Operator can export a **portable data bundle** of SignalX app state and import it on the same or another Mac for migrate / disaster recovery — without shipping Signal identity secrets by default.

## Today (keep as-is)

`export_account` / `cmd_export_account` writes **messages only** (`txt` or `json`) into `{app_data}/exports/account-{sanitized}-{ts}.{ext}`. Optional `from_ts` / `to_ts`. Empty message set → error. This remains the lightweight “export chat transcript” path; the bundle is a separate product surface.

## Bundle v1 — include

Zip (preferred) or a single directory written under `{app_data}/exports/`, named `signalx-bundle-{sanitized_account}-{ts}.zip`.

| Path / payload | Why |
|----------------|-----|
| `manifest.json` | `schema_version`, account id (sanitized), export timestamp, SignalX app version, include flags |
| `threads/{account}.json` | Thread list + messages (daemon store) |
| `commerce/` | `products.json`, `customers.json`, `orders.json` (+ `product-images/` if present) |
| `outbox/{account}.json` | Queued / failed / in-flight outbox items |
| `ivr/` | `menus.json`, settings, allowlists, per-thread enable/handoff, sessions (optional but useful) |
| `auto_reply_settings.json` (+ audit optional) | Auto-reply config |
| `contacts/`, `groups/` | Local CRM / group meta if present |
| `attachments/` | Outbound attachment copies under app data (when that slice ships) |

Include only files for the **active** sanitized account where stores are account-keyed.

## Bundle v1 — exclude (default)

| Exclude | Why |
|---------|-----|
| `.signalx.env` | Number, paths, Ollama model — secrets / machine-local |
| `SIGNALX_SIGNALCLI_CONFIG` tree / signal-cli keys | Identity; re-link on the target machine |
| Absolute host paths inside JSON | Rewrite to bundle-relative on export; resolve under app data on import |
| Other accounts’ orphan thread/outbox stems | One-account invariant |

Optional later (off by default, explicit checkbox + scary confirm): include a sealed note that signal-cli config was intentionally omitted, or a separate “identity pack” — **not** in v1.

## Export / import UX (Settings)

Settings → System (or a small **Backup** subsection):

1. **Export chat (messages)** — existing `exportAccount` (txt/json). Unchanged label/behavior.
2. **Export data bundle** — builds the zip above; show path on success (reuse export dir + `open_path` under app data).
3. **Import data bundle** — pick zip; choose mode; confirm; then **quit/restart required**.

Copy must say: backup does **not** move Signal registration; Device link / `.signalx.env` still required on the new machine.

## Merge vs replace

| Mode | Behavior |
|------|----------|
| **Replace** (default for migrate) | After confirm, overwrite listed stores with bundle contents for the active account. Backup current files to `exports/pre-import-{ts}/` first. |
| **Merge** | Messages: union by message id (keep existing on conflict). Commerce: upsert by product/customer/order id. Outbox: union by outbox id (skip duplicates). IVR menus: take higher `version`, else keep local. Settings: prefer bundle for global flags; union allowlists. |

Fail closed: wrong `schema_version`, missing `manifest.json`, or sanitized account mismatch → refuse import (no partial write). Account mismatch needs an explicit override only if we ever support “restore onto same number after sanitize drift” — skip in v1; require match.

## Restart requirement

Import writes files on disk while stores may be memory-cached. After a successful import:

1. Show “Restart SignalX to apply imported data.”
2. Disable further write-heavy UI until restart (or force quit via a single “Quit now” button).
3. On next launch, load stores from disk as today — no hot-reload of AccountManager / commerce / IVR in v1.

## Non-goals

- Cloud sync, scheduled backups, multi-device live replication
- Exporting/importing signal-cli registration or multi-account switcher
- Replacing `export_account` message export
- In-place hot import without restart
- Payment / billing history outside orders already on disk
- Encrypting the zip (operator can use disk encryption / zip password later)

## Thin v1 implementation steps

1. **Spec freeze** (this doc) + keep `export_account` untouched.
2. **Manifest + packer** in Rust: walk include list → zip under `exports/`; unit-test path containment (`path_is_under_root`) and secret exclusion.
3. **IPC**: `export_data_bundle` → `{success, data: {path, bytes, counts}}`; `import_data_bundle(path, mode)` → validate → stage → swap → `{success, data: {restart_required: true}}`.
4. **Settings UI**: two buttons + mode radio + confirm dialog; wire paths only (no App architecture change beyond Settings).
5. **Optional stub before full zip**: Settings “Export data bundle (WIP)” that dumps `commerce/*.json` + `ivr/menus.json` next to a messages export — disabled or labeled WIP until packer lands.
6. **Smoke**: export → wipe commerce/orders in a copy of app data → import replace → restart → catalog/orders/IVR match; merge smoke with overlapping ids.

## Success criteria

- Operator can move catalog, customers, orders, IVR config, and threads to a new install without copying `.signalx.env` or signal-cli keys.
- Message-only export still works.
- Import never silently overwrites; replace is explicit; restart is mandatory.
