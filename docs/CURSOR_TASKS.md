# Cursor Task Queue

Four scoped backlog items from `docs/NEXT_STEPS.md`'s "long-term backlog", each
grounded against the current code so you can start implementing without a
fresh audit. Do them as **separate commits/PRs**, in the order listed —
each is independent, but the order goes smallest/safest to largest.

Before starting any task: read `docs/HANDOFF.md` (conventions) and
`AGENTS.md` (build/run commands, toolchain gotchas). After finishing a task:
`npm run build` (tsc + vite build) and `cd src-tauri && cargo test` must both
pass before you consider it done. Match existing code style — no new
formatting conventions, no new dependencies unless a task explicitly calls
for one.

---

## Task 1 — Global keyboard shortcuts

**Why:** Called out in `docs/NEXT_STEPS.md` under "Messenger completeness". Right
now there's exactly one global shortcut in the whole app.

**Current state:**
- The only global handler is `src/App.tsx:715-725` — a `keydown` listener in a
  `useEffect` that handles Cmd/Ctrl+K to focus the search input
  (`searchInputRef`). Everything else is scoped/local: `Enter`-to-submit in
  `IvrMenuComposer.tsx:471`, `App.tsx:1953` (unlock), `App.tsx:2170` (new DM),
  `App.tsx:3718`, `PanelResizer.tsx:30`, and `WhyTip.tsx:19` (Escape-dismiss on
  a tooltip, document-level).
- There is no shortcuts-help modal, no command palette, no settings section
  listing shortcuts anywhere in `src/`.

**What to build:**
1. A small `useGlobalShortcuts` hook (or extend the existing `useEffect` at
   `App.tsx:715`) that centralizes shortcut handling instead of scattering
   more one-off listeners.
2. Add shortcuts for the panels that already exist as nav targets in
   `App.tsx` (Messages, People, Catalog, Orders, Sales, Settings) — e.g.
   `g` then a letter, or `Cmd+1..6`, matching whatever feels native to a
   dark, keyboard-first shell like this one. Pick one scheme and be
   consistent; don't offer two.
3. `Escape` should close whatever modal/composer is currently open — check
   how `composer`/`menu`-style state is named per screen (e.g.
   `PeopleScreen.tsx`'s `composer`/`menu` state) and wire a consistent
   Escape behavior rather than one-off handlers.
4. Add a small "Keyboard shortcuts" reference — a `?` shortcut opening a
   simple modal listing them is enough; it does not need to live in Settings.

**Non-goals:** no customizable/remappable shortcuts, no vim-style modal
input. Keep it to fixed, documented bindings.

**Acceptance:** Cmd+K still works. New shortcuts navigate between panels and
Escape closes open overlays without needing a mouse. No conflicts with
existing scoped `onKeyDown` handlers (test typing in Settings' IVR JSON
editor and the message composer — shortcuts must not fire while typing in a
text field, except Escape).

---

## Task 2 — Inbound Signal attachments (persist + render)

**Why:** Top item under "Messenger completeness" in `docs/NEXT_STEPS.md`.
Outbound attachments already work; inbound ones are currently discarded.

**Current state:**
- `normalize_incoming_message` (`src-tauri/src/lib.rs:2309-2374`) checks
  `data_msg.get("attachments")` for a non-empty array (`has_attachments`,
  ~2321-2325) and when there's no text, sets `content` to the literal string
  `"[attachment]"` (~2326-2330). **No attachment bytes, filename, or path is
  ever extracted or persisted.** The full signal-cli envelope survives in
  `Message.raw_json: Option<Value>` (struct field, `lib.rs:234`; populated at
  `lib.rs:2352`), so the attachment metadata signal-cli reports (id, filename,
  content-type, and — if signal-cli downloaded it — a local path) is sitting
  there unused.
- The **outbound** pattern to mirror end-to-end:
  `write_outbox_attachment` (`lib.rs:3076-3096`) decodes base64, validates the
  extension via `normalize_attachment_ext` (`lib.rs:3065`), writes into
  `{app_data}/attachments/`, and stores the resulting path on
  `OutboxItem.attachment_path: Option<String>` (referenced `lib.rs:305`,
  `3156-3172`). `queue_outgoing_with_attachment` /
  `cmd_queue_outgoing_with_attachment` (`lib.rs:3102-3172`, `6148-6164`) is the
  full command → state → frontend wiring example — inbound should look
  structurally similar but in reverse (signal-cli hands you the file instead
  of you writing it).
- `ProfileRail.tsx` already has a **Media section** (lines 462-485) rendering
  `attachThumbs` — today outbound-only, with the empty-state hint "No shared
  outbound files or product images yet" (line 465). This is where inbound
  attachments should also surface once persisted.

**What to build:**
1. In `normalize_incoming_message`, parse the real attachment entries out of
   `data_msg["attachments"]` (id/filename/contentType/size — check what
   signal-cli's JSON-RPC actually reports; `raw_json` on an existing
   attachment message is your fastest way to see the real shape, or check
   signal-cli's own docs).
2. Add an `attachment_path: Option<String>` (mirror the outbound field name)
   to `Message`, persisted the same way outbound attachments are — copy or
   symlink signal-cli's downloaded file into `{app_data}/attachments/`
   (reuse `normalize_attachment_ext`/whatever validation the outbound path
   uses) so both directions store attachments the same way.
3. Update `content` for attachment-only messages to something more useful
   than the literal string `"[attachment]"` if you have a filename/type
   (e.g. show the filename), but keep a sane fallback.
4. Render inbound attachments in the message thread view (find wherever
   `Message.content` is rendered in the conversation view in `App.tsx` and
   add an image/file-preview branch when `attachment_path` is set — follow
   however outbound attachments are already rendered there, if they are).
5. Feed inbound attachments into `ProfileRail.tsx`'s existing Media section
   (lines 462-485) alongside `attachThumbs`, updating the empty-state copy
   once it's no longer outbound-only.

**Non-goals:** no video playback UI beyond a basic link/thumbnail, no
attachment editing, no re-upload/forward. Just persist + display.

**Acceptance:** send yourself an image from another Signal device to the
linked number; it should appear inline in the thread and in the profile
rail's Media section, and survive an app restart (i.e. it's actually
persisted to disk, not just held in memory).

---

## Task 3 — Unified Audit panel (IVR + commerce + outbox + auto-reply)

**Why:** Under "Operator reliability" in `docs/NEXT_STEPS.md`. Three of the
four data sources already exist independently; they just aren't in one
place.

**Current state:**
- **Commerce audit** already exists: `SalesScreen.tsx` (~lines 418-427) has a
  "Commerce audit" card rendering `CommerceAuditEvent[]`
  (`src/api.ts:303-311`: `id, kind, summary, order_id?, product_id?,
  thread_id?, created_at`), fetched via `api.listCommerceAudit(80)`
  (`App.tsx:119`), backed by `src-tauri/src/commerce_audit.rs`.
- **Auto-reply audit** already exists as its own panel:
  `panel === "audit"` in `App.tsx:2798+`, using `AutoReplyAuditEntry`
  (`src/api.ts:185-194`: `id, account_id, thread_id, message_id, draft,
  created_at, outcome, reason`), backed by `AutoReplyStore`/
  `AutoReplyAuditLog` in Rust (`lib.rs:2461-2550`, emitted via
  `emit_auto_reply_audit`, `lib.rs:3038`). **This is the log-shape pattern
  to replicate for IVR** (see below).
- **Outbox** has no dedicated audit trail or component file — its state is
  inline in `App.tsx` (`outbox`/`globalOutbox` state ~lines 332-333,
  425-426; `refreshGlobalOutbox`, line 1546; `OutboxItem` type with
  `state`/`attachment_path`/`last_error`). Treat outbox *failures/retries*
  as the auditable events here, not full history.
- **IVR has no interaction-level logging at all** — only settings/menu CRUD
  (`get_ivr_settings`, `get_thread_ivr`, etc., `lib.rs:6367-6398`, via
  `src-tauri/src/ivr.rs`). You will need to add new event logging, modeled
  directly on `AutoReplyAuditLog` (same struct shape: id, thread_id,
  timestamp, a short "what happened" summary, outcome).

**What to build:**
1. Add IVR interaction logging in `ivr.rs`, following `AutoReplyAuditLog`'s
   shape and persistence pattern (`lib.rs:2461-2550`) — log menu entry,
   digit picked, and order-placed-via-IVR events at minimum.
2. Add a lightweight outbox-failure log entry emitted wherever outbox retries
   or gives up (find the retry loop feeding `OutboxItem.last_error`).
3. Build one new panel/screen that merges all four sources into a single
   chronological feed, filterable by source (IVR / commerce / outbox /
   auto-reply) and by thread. Reuse the existing per-source data fetches
   (`listCommerceAudit`, the auto-reply audit fetch already backing
   `panel === "audit"`) rather than inventing new commands where one already
   exists — add only the two new ones (IVR, outbox-failure).
4. Decide where it lives in nav — a natural fit is promoting the existing
   `audit` panel into this unified one rather than adding a fifth nav item.

**Non-goals:** no per-event undo/replay, no export from this panel (backup
already covers export). Read-only feed.

**Acceptance:** trigger one event from each of the four sources (send an IVR
order, place a commerce order, force an outbox send failure, trigger a
guarded auto-reply) and confirm all four appear in the unified feed with
correct thread linkage and timestamps, filterable by source.

---

## Task 4 — Backup v2: password-protected export

**Why:** Under "Operator reliability" in `docs/NEXT_STEPS.md" — "encrypted
zip, scheduled local backups, optional identity-pack". Scope this task to
**encryption only** (see note on scheduling below).

**Current state:**
- `cmd_export_data_bundle` / `cmd_import_data_bundle` (`lib.rs:6331-6342`)
  delegate to `export_data_bundle_cmd` / `import_data_bundle_cmd`
  (`lib.rs:4321-4405`), which call into `src-tauri/src/backup.rs`.
  `export_data_bundle` (`backup.rs:268-357+`) builds the zip with the `zip`
  crate (`Cargo.toml:31`: `zip = { version = "2", features = ["deflate"] }`,
  using `ZipWriter` + `SimpleFileOptions` + `CompressionMethod::Deflated`).
- **No encryption or password support exists anywhere in `backup.rs`** —
  confirmed zero hits for password/encrypt/aes in that file.
- Bundle contents are gated by `BundleIncludeFlags` (`backup.rs:25-36`) and
  explicitly exclude Signal identity secrets (`backup.rs:1` comment,
  `is_forbidden_source_name` check at line 344) — preserve that exclusion,
  do not touch it.

**What to build:**
1. Check whether the `zip` crate v2 (already a dependency, feature
   `deflate`) supports AES encryption via a feature flag (it does have an
   `aes-crypto` feature in recent versions) — prefer that over hand-rolling
   crypto or adding a new crate, if the version pinned in `Cargo.toml`
   supports it. If not, that's a version bump of an existing dependency, not
   a new one.
2. Add an optional password parameter to `cmd_export_data_bundle` /
   `export_data_bundle_cmd`; when present, encrypt each zip entry.
3. Mirror on import: `cmd_import_data_bundle` / `import_data_bundle_cmd`
   needs an optional password parameter to decrypt before reading.
4. Frontend: find wherever Settings → System → Backup renders the
   export/import UI in `App.tsx` and add an optional password field for
   both flows (optional = leave blank for an unencrypted bundle, preserving
   today's behavior exactly when no password is given).

**Explicitly out of scope for this task — do not attempt:** scheduled local
backups. There is **no recurring-task infrastructure in the Rust backend at
all** — every `tokio::spawn`/`spawn_blocking` call (`lib.rs:359, 400, 3862,
3888, 4068, 4429-4433, 4560, 4761, 4812, 4867`) is a one-shot offload or the
single long-lived `receive_loop` (spawned once, `lib.rs:4867`). Scheduling
needs net-new infrastructure (e.g. a `tokio::time::interval` loop modeled on
`receive_loop`'s long-lived-task pattern) and is a separate, bigger task —
flag it back to me rather than bundling it in here.

**Acceptance:** export with a password set, confirm the resulting zip cannot
be opened with a standard unzip tool without the password, then import it
back successfully with the correct password and confirm a wrong password is
rejected cleanly (no partial/corrupt import). Export/import with no password
must behave exactly as it does today (regression check).
