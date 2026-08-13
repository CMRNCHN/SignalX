# AGENTS.md

## Cursor Cloud specific instructions

SignalX is a **Tauri v2 desktop app**: a React/Vite frontend (`src/`, dev server on port 5173, `strictPort`) driving a Rust backend/daemon (`src-tauri/`). The published docs (`README.md`, `docs/QUICKSTART.md`, `docs/BUILD.md`) are macOS-oriented (Homebrew paths, `.command`/`.app` bundles); the notes below cover the Linux/cloud differences. Standard commands live in `package.json` scripts and `src-tauri/Cargo.toml` — refer to those rather than duplicating.

### Toolchain gotchas (already baked into the environment snapshot)
- **Rust must be stable ≥ 1.85** (the snapshot uses `rustup default stable`). A transitive dependency (`dlopen2_derive`) requires `edition2024`, so the older `1.83` toolchain that ships on the base image fails to even parse the manifest. If `cargo` errors with `feature 'edition2024' is required`, run `rustup default stable`.
- Tauri needs Linux **WebKitGTK/GTK system libraries** (`libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `librsvg2-dev`, `libayatana-appindicator3-dev`, etc.). These are installed in the snapshot, not via the update script.

### Build / lint / test
- Frontend typecheck + build (this repo has **no ESLint** config, so `tsc --noEmit` is the lint): `npm run build`.
- Rust unit tests (44 tests): `cd src-tauri && cargo test`. The first compile is slow (~1 min); it is cached afterward. `cargo build`/`cargo test` produce many dead-code warnings — these are expected and not errors.

### Running the app
- Full desktop GUI: `npm run tauri:dev`. It auto-starts Vite via `beforeDevCommand`, then compiles and opens the WebKit window. **A display is required** — in the cloud VM export `DISPLAY=:1` first (a `libEGL ... DRI3` warning is harmless; WebKit falls back to software rendering). Run it under `tmux` so it survives the shell.
- Frontend only (no backend IPC): `npm run dev` on `http://localhost:5173` — but Tauri `invoke()` calls fail without the Rust runtime, so prefer `tauri:dev` for real testing.
- Headless daemon (no GUI/display): `SIGNALX_HEADLESS=1 cargo run --manifest-path src-tauri/Cargo.toml -- --headless`.

### Runtime behavior notes
- The app **runs without any configuration**. When `SIGNALX_NUMBER`/`SIGNALX_SIGNALCLI_CONFIG` (via `.signalx.env`, see `.signalx.env.example`) are unset it shows a "Not configured / Link this Mac" banner but the local commerce/messaging UI still works.
- `signal-cli` (a Java binary) and Ollama are **optional external dependencies**, not installed by default. Without `signal-cli` the health badge is red and real Signal send/receive is disabled; local features (Catalog, Orders, Customers, IVR, Settings, aliases) still function and persist.
- Local app state persists to `~/.local/share/SignalX/` on Linux (e.g. `accounts/{id}/commerce/products.json`, `accounts/{id}/ivr/menus.json`, `threads/`, `contacts/`), **not** the macOS `~/Library/Application Support/SignalX` path in the docs. Legacy global `commerce/` / `ivr/` files migrate onto the configured number on first launch.
