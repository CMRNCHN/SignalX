# SignalX — Organization Quickstart

Implementation guide for the SignalX UI architecture, screen manifest, assets, and fixtures. Each phase is copy/paste ready and maps to the **current repo layout** (`src/`, `src-tauri/`, `docs/`).

> **Dev environment setup** (Rust, Tauri, signal-cli) lives in [`docs/QUICKSTART.md`](QUICKSTART.md). This doc is about **product structure and assets**.

---

## Phase 1 · Scaffold folders (5 min)

```bash
bash scripts/signalx_folder_structure.sh
```

Creates `docs/assets/ui/`, `docs/fixtures/`, and registry placeholders. Does **not** move application source — `src/` and `src-tauri/` stay as-is.

---

## Phase 2 · Drop UI screenshots (10 min)

Copy or rename your screen captures into `docs/assets/ui/`:

| File | Screen |
|------|--------|
| `01-inbox.webp` | Inbox · Maya Chen selected |
| `02-people.webp` | People · contact record |
| `03-catalog.webp` | Catalog · product edit |
| `04-orders.webp` | Orders · order detail |
| `05-settings-account.webp` | Settings · Account |
| `06-settings-delivery.webp` | Settings · Delivery |
| `07-menu-builder.webp` | Catalog · IVR menu builder |

```bash
# Example rename from artifact captures
cp /path/to/ui_01_inbox.webp docs/assets/ui/01-inbox.webp
# … repeat for 02–07
```

Open the gallery: `docs/assets/ui/signalx_gallery_template.html` in a browser (or serve `docs/assets/ui/` locally).

---

## Phase 3 · Read the architecture (15 min)

1. [`docs/signalx_architecture.md`](signalx_architecture.md) — modules, layouts, design tokens, data models
2. [`docs/signalx_screen_manifest.md`](signalx_screen_manifest.md) — per-screen panels, components, states

Cross-check against live code:

- Shell & panels → `src/App.tsx`
- Profile rail → `src/ProfileRail.tsx`
- Menu builder → `src/IvrMenuComposer.tsx`
- API types → `src/api.ts`
- Demo seed → `src-tauri/src/demo.rs`

---

## Phase 4 · Fixtures template (20 min)

1. Open [`docs/fixtures/signalx_fixtures_template.json`](fixtures/signalx_fixtures_template.json)
2. Compare fields to `src/api.ts` interfaces
3. For runtime demo data, the Rust seed in `src-tauri/src/demo.rs` is the source of truth — JSON template is for docs, tests, and external tooling

To re-seed demo data locally: delete threads for the account under `~/.local/share/SignalX/threads/` and restart the app.

---

## Phase 5 · Component registry audit (30 min)

Walk the manifest component IDs and confirm each maps to a file:

| Domain | Key files |
|--------|-----------|
| Shell | `src/App.tsx`, `src/styles.css` |
| Inbox / messaging | `src/App.tsx` (inbox panel), `ProfileRail.tsx` |
| People | `src/App.tsx` (people panel) |
| Catalog / orders | `src/App.tsx` (catalog, orders panels) |
| Settings | `src/App.tsx` (settings panel) |
| IVR | `src/IvrMenuComposer.tsx`, `src-tauri/src/ivr.rs` |
| Status / segments | `src/status.ts`, `src/segments.ts` |
| Empty states | `src/EmptyState.tsx` |

Add new shared components under `src/components/` when extracting from `App.tsx` (future refactor — not required today).

---

## Phase 6 · Design tokens (20 min)

Tokens live in `src/styles.css` `:root`:

- Surfaces: `--bg`, `--surface-1`, `--surface-2`
- Text: `--text`, `--text-dim` (AA-oriented secondary)
- Status: `--status-ok-*`, `--status-warn-*`, `--status-danger-*`, `--status-muted-*`
- Layout: `.shell`, `.shell-with-profile`, `.shell-three`

Status logic: `src/status.ts` (`orderStatusTone`, `orderStatusLabel`, `threadReplyLabel`).

---

## Phase 7 · Responsive breakpoints (30 min)

CSS breakpoints in `src/styles.css`:

- **≤768px** — icon-only nav, profile rail hidden, 3 columns
- **≤480px** — bottom tab nav, list/detail swap via `:has(.thread-row.active)`

Test: resize Tauri window or use devtools in browser preview (`npm run dev` — IPC limited).

---

## Phase 8 · API & backend alignment (45 min)

| Frontend | Backend |
|----------|---------|
| `src/api.ts` invoke wrappers | `src-tauri/src/lib.rs` Tauri commands |
| Commerce types | `src-tauri/src/commerce.rs`, `orders.rs` |
| IVR menus | `src-tauri/src/ivr.rs` |
| Threads / messages | `src-tauri/src/` thread store |
| Demo seed | `src-tauri/src/demo.rs` |

Run checks:

```bash
npm run build
cd src-tauri && cargo test
```

---

## Priority roadmap

| Priority | Item |
|----------|------|
| **P0** | Screen manifest matches shipped UI; assets in `docs/assets/ui/` |
| **P1** | Extract repeated panel chrome from `App.tsx` into layout components |
| **P1** | Keyboard nav (Tab through nav, filters, lists) |
| **P2** | Empty-state screenshots (zero inbox, zero search, zero orders) |
| **P2** | Tablet/mobile QA on real devices |
| **P2** | Undo for destructive catalog/order actions |

---

## One-liner checklist

```text
[ ] scripts/signalx_folder_structure.sh run
[ ] 01–07 screenshots in docs/assets/ui/
[ ] Gallery HTML opens with all images
[ ] Architecture + manifest reviewed against src/
[ ] Fixtures JSON aligned with api.ts
[ ] npm run build && cargo test green
```
