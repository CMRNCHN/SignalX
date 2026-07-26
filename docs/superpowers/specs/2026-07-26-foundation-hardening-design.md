# Foundation Hardening Design

**Date:** 2026-07-26  
**Status:** Approved for implementation planning  
**Scope:** Sub-project 1 of SignalX product rebuild

## Context

SignalX is becoming a single-number Signal desktop app: messenger, menu-style IVR for sales, local catalog/orders, and AI drafts — all local-first. Before IVR or commerce can safely send messages, the existing messenger must be trustworthy on exactly one Signal account.

A code review of `dev` vs `main` found account misrouting, unsanitized outbox paths, and related contract/docs drift. This sub-project fixes those foundations only.

## Goals

1. Bind the entire app to one Signal identity: `SIGNALX_NUMBER`.
2. Ensure outbound messages have exactly one send path (the outbox).
3. Prevent filesystem path escape via account IDs and `open_path`.
4. Lock down the webview (CSP, no production-devtools permission).
5. Align TypeScript contracts and operator docs with runtime reality.
6. Add unit tests for the invariants later features will rely on.

## Non-goals

- IVR / menu responder
- Catalog, customers, orders, invoices
- AI / auto-reply feature work beyond what already exists
- Multi-account (deleted, not deferred behind a flag)
- Scrubbing secrets from git history (separate ops task if the repo is shared)
- Large `lib.rs` module split (useful later; not required to harden)

## Design

### 1. Single account, everywhere

**Canonical identity.** At startup, read `SIGNALX_NUMBER`. Trim it and derive a stable storage key via the existing `sanitize_filename` helper (e.g. `+12025551212` → `_12025551212`). That sanitized form is the only account id used for:

- Thread / alias / contact / group / outbox file names
- In-memory account keys
- Receive-loop persistence target
- Outbox worker account id

**Receive and send.** The receive loop already calls `signal-cli` with `SIGNALX_NUMBER`. After this change it must also persist only under the canonical account id — never under a UI-selected “active” account. The outbox worker already sends as `SIGNALX_NUMBER`; it must only claim items for the canonical account id.

**Remove multi-account surface.**

| Remove | Reason |
|--------|--------|
| `cmd_set_active_account` | Allows arbitrary ids and misroutes storage |
| `cmd_list_accounts` | Implies multiple identities |
| `cmd_get_active_account` | Replace with a read of the configured number / canonical id if needed for diagnostics |
| UI account switcher in `App.tsx` | No longer meaningful |

`AccountManager` may remain as a thin holder of “the one loaded ThreadState,” but it must not expose account switching. Prefer simplifying call sites to “get the (only) thread state” rather than `get_active` / `set_active`.

**Orphan files.** Existing thread/outbox JSON under other stems stays on disk untouched. Do not list, load, migrate, or delete them in this phase.

**Missing config.** If `SIGNALX_NUMBER` or `SIGNALX_SIGNALCLI_CONFIG` is unset, the app starts into a clear “not configured” UI/diagnostics state and does not start receive/outbox workers. No half-working loops.

### 2. One send path

All user- and system-initiated outbound traffic goes through `queue_outgoing_message` → outbox worker → `signal-cli send`.

**Remove** `cmd_send_message` (and any UI/API callers) so future IVR/AI features cannot bypass the outbox.

Keep legacy in-thread outbox helpers only if still referenced by migration paths; otherwise leave dead code for a later cleanup unless it is trivially removable with the command.

### 3. Path containment

**OutboxStore.** Change `path_for` to use `sanitize_filename(account_id)` consistently with other stores (`AliasStore`, `ContactStore`, `AccountManager::storage_path_for`, etc.).

**`cmd_open_path`.** Resolve the requested path and allow open only if it is under the app data directory (canonicalized path prefix check). Reject anything else with a clear error. Purpose remains: reveal export folders/files the app wrote.

### 4. Webview lockdown

- Set a restrictive CSP in `src-tauri/tauri.conf.json` appropriate for Tauri + Vite: self for production assets; allow the Vite dev URL only as needed for `tauri dev`.
- Remove `core:webview:allow-internal-toggle-devtools` from production capabilities (`capabilities/default.json`). If a separate debug capability is required for local development, keep it out of the default production capability set.

### 5. Contract and docs honesty

- Align `OutboxSummary` in `src/api.ts` with Rust (`queued`, `sending`, `failed` only — drop unused `sent`).
- Spot-check event payload shapes (`message://new`, `outbox://updated`, etc.) against TypeScript listeners; fix type mismatches that would hide bugs.
- Update `docs/STATUS.md`, `docs/HANDOFF.md`, and any `npm run tauri:build` references so they describe the current GUI + single-account reality and the correct `npm run tauri build` invocation.

### 6. Tests

Add Rust unit tests (no `signal-cli` required) covering:

1. `sanitize_filename` behavior for phone numbers and path separators / `..`
2. Outbox `path_for` always resolves under the outbox directory (containment)
3. Account id canonicalization: raw `SIGNALX_NUMBER`-shaped inputs map to one storage key

These are the invariants IVR and commerce will assume.

## Error handling

| Condition | Behavior |
|-----------|----------|
| Missing `SIGNALX_NUMBER` / config | Diagnostics show not configured; workers do not start; UI explains what to set in `.signalx.env` |
| Invalid path to `open_path` | Error result; no `open` / `xdg-open` / `explorer` call |
| Outbox / receive failures | Existing retry/backoff and health events unchanged |

## Success criteria

- No UI or IPC path can switch accounts or invent an account id that changes storage/send identity.
- Grep shows no `cmd_set_active_account` / account switcher; `cmd_send_message` gone.
- Outbox files always land under `{app_data}/outbox/{sanitized}.json`.
- CSP is non-null; default capability lacks internal toggle-devtools.
- Unit tests above pass.
- Docs match how the app actually runs.

## Follow-on (out of scope here)

1. Menu responder (IVR)  
2. Catalog + customers  
3. Orders + invoices in-thread  
4. AI polish on the new flows  

## Risks

- **Orphan data confusion:** Users with old multi-stem files might wonder why they aren’t listed. Mitigate with a short note in STATUS/HANDOFF: only the configured number’s store is active.
- **Breaking IPC for any external callers of removed commands:** Acceptable; the only first-party client is `src/`.
