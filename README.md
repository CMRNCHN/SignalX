# SignalX Desktop Client (Tauri + React)

This repository contains the front‑end scaffold and build configuration for **SignalX**, a modern messaging and business assistant built with Tauri and React.  It provides a dark, graphite‑themed UI with soft pastel accents, modular panels (sidebar, dashboard, chat, AI tools, device sessions), and is designed to run as a native desktop application via the Tauri framework.

> **Note:** This scaffold does **not** include a complete back‑end or business logic implementation.  It provides a foundation for integrating SignalX’s back‑end capabilities (Signal CLI integration, AI services, Trackr business features).  The guidance below explains how to extend this scaffold.

## Production build (desktop)

- Install deps: `npm install`
- Build: `npm run tauri build`
- macOS output: `src-tauri/target/release/bundle/macos/SignalX.app` (a DMG is also produced in the same directory). The app reads/writes data under `~/Library/Application Support/SignalX/` (threads, aliases, search, exports).
- The packaged app runs without the Vite dev server; threads/messages load from the persisted JSON state and the background receive loop stays off the UI thread.

## Outbox (reliable outbound sends)

SignalX queues outbound messages into a per-account **outbox** and sends them in the background with retry/backoff. This is designed to be safe across restarts: pending/failed items are persisted and will resume automatically.

- **Persistence**: `~/Library/Application Support/SignalX/outbox/{account_id}.json` (schema versioned)
- **States**: `queued`, `sending`, `sent`, `failed`
- **Retry policy**: exponential backoff with jitter (capped), one send at a time per account

### Outbox events (frontend subscriptions)

- **`outbox-updated`**: `{ account_id, thread_id?, summary: { queued, sending, failed } }`
- **`outbox-item-updated`**: the full updated outbox item
- **`message-sent`**: emitted only after an outbox item is successfully sent and the normalized message is persisted

## Contacts/Groups: custom fields + search

SignalX supports per-account **contact** and **group** metadata, including first-class **custom fields**.

- **Custom field schema**: `{ id, key, type, searchable, value }`
  - `id`: stable UUID (used to keep edits/reorders stable)
  - `type`: `text | number | bool | date | tag` (values are stored as normalized strings)
  - `searchable`: if enabled, the field’s key/value participates in Contacts/Groups search
- **Contacts/Groups search**:
  - Search matches display name, alias/number (contacts), categories, and **searchable custom fields**
  - Non-searchable custom fields do **not** match the query
  - Filters include favorites, muted, category, photo (contacts), apple-linked (contacts), and a **Field** filter (`key` + “value contains”)
- **Events**: when metadata changes, the backend emits:
  - `contact-meta-updated`
  - `group-meta-updated`

## Agent mode (headless)

- Backend-only run loop: no Tauri window. On new messages it calls the existing AI draft pipeline with intent “prepare but do not send” and stores a pending draft per thread/message in the persisted ThreadState.
- Run during development: `SIGNALX_AGENT=1 cargo run --manifest-path src-tauri/Cargo.toml --release -- --agent`
- After a build: `./src-tauri/target/release/app --agent`
- Requirements: `SIGNALX_NUMBER`, `SIGNALX_SIGNALCLI_CONFIG`, and `SIGNALX_OLLAMA_MODEL` (for drafts). UI/consumers can fetch drafts via the `get_pending_replies(thread_id)` command.

## Thread export

- Backend command: `export_thread(thread_id, format)` where `format` is `json` or `txt`.
- Files are written to `~/Library/Application Support/SignalX/exports/{thread_id}-{timestamp}.{ext}`.
- JSON contains the raw normalized messages array; TXT is a simple chat log (`[timestamp] sender: content`).
- The React header includes an “Export” menu (TXT/JSON), shows the resulting path in a toast, and offers “Open Folder” to reveal the location.

## Features

- **Modern UI** – built with React and CSS modules, featuring a sidebar, pastel dashboard tiles, chat panel, AI tools panel, and device session overview.
- **Tauri configuration** – ready to compile into a lightweight native application once the Rust toolchain and Tauri CLI are installed.
- **TypeScript & Vite** – uses TypeScript for type safety and Vite for fast development/build scripts.

## Getting Started

1. **Clone or extract** this repository into your development environment.
2. Ensure you have the following installed:
   - **Node.js** (v16+ recommended)
   - **Rust & Cargo** – required for Tauri (see [Tauri prerequisites](https://tauri.app/v1/guides/prerequisites/)).
   - **Tauri CLI** – install with `cargo install tauri-cli`.
3. In the project root (`signalx_tauri`), install the dependencies:

   ```bash
   npm install
   ```

4. To run the React development server:

   ```bash
   npm run dev
   ```

   The UI will be available at `http://localhost:3000`.

5. To build and run the native Tauri application:

   ```bash
   npm run tauri:dev
   ```

   Or use the launcher:
   ```bash
   ./scripts/dev/SignalX-Dev.command
   ```

   For production builds, see [docs/BUILD.md](./docs/BUILD.md).

## Integrating Signal CLI (Back‑End)

To make this UI functional as a Signal client, you must integrate with the [Signal CLI](https://github.com/AsamK/signal-cli), which allows sending, receiving, and managing Signal messages from the command line.

1. **Install signal‑cli** on the host system where you’ll run SignalX.  On macOS it’s available via Homebrew (`brew install signal-cli`); for Linux follow the installation instructions in the signal‑cli repository.

2. **Link a Signal device** by running:

   ```bash
   signal-cli link -n "SignalX"
   ```

   Scan the QR code using your primary Signal device.  This registers SignalX as a secondary device.

3. **Call signal‑cli commands from your front‑end.**  There are two main approaches:

   - **Using Tauri’s `@tauri-apps/api/tauri` module** to invoke commands via the Rust backend.  You can add commands in `src-tauri/src/main.rs` that wrap signal‑cli via `std::process::Command`.  On the front‑end, use `invoke` to call these commands.
   - **Using Node’s `child_process`** in a separate backend service.  If you plan to keep business logic server‑side, create an Express/Koa API that wraps signal‑cli, then call those API endpoints from the React app.

Example invocation using Tauri:

```rust
// src-tauri/src/main.rs
use tauri::{command};

#[command]
fn send_signal_message(to: String, message: String) -> Result<String, String> {
    use std::process::Command;
    let output = Command::new("signal-cli")
        .args(["-u", &std::env::var("SIGNAL_CLI_ACCOUNT").unwrap(), "send", &to, "-m", &message])
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![send_signal_message])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

On the front‑end (React):

```tsx
import { invoke } from '@tauri-apps/api/tauri';

async function sendMessage(to: string, text: string) {
  try {
    const result = await invoke('send_signal_message', { to, message: text });
    console.log('Message sent', result);
  } catch (err) {
    console.error('Send failed', err);
  }
}
```

This example uses an environment variable `SIGNAL_CLI_ACCOUNT` set to your linked Signal phone number.  You can set environment variables in Tauri via `.env` files or your system shell.

4. **Receiving messages** is more involved.  You can run `signal-cli receive` periodically or watch for new messages via an external service, parse the JSON output, and push updates to the UI.  Consider running `signal-cli --json receive` in a background process and piping the results into your app.

## Integrating AI (OpenAI or other LLM)

The UI includes an “AI Tools” panel intended for generating suggestions, summarising conversations, or rewriting messages.  To power these features:

1. Obtain API credentials for your preferred language model (OpenAI, Anthropic, etc.).
2. In the front‑end, create functions that call the AI API with the desired prompts and conversation context.
3. Display the model’s responses in the AI panel.  Use pastel cards (as in `AIToolsPanel.tsx`) for quick actions like summarising or extracting tasks.

Example using OpenAI’s API (server‑side):

```ts
// /api/ai.ts (express route)
import { Configuration, OpenAIApi } from 'openai';
const configuration = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
const openai = new OpenAIApi(configuration);

export async function generateSuggestion(prompt: string) {
  const { data } = await openai.createChatCompletion({
    model: 'gpt-4o',
    messages: [ { role: 'user', content: prompt } ],
    max_tokens: 150
  });
  return data.choices[0]?.message?.content;
}
```

## Integrating Trackr Business Features

For the business version of SignalX, you may wish to connect to an inventory or pricing system (“Trackr”).  Since Trackr’s API and data model are not defined here, a typical approach is:

1. **Define your product and inventory schema** (e.g. products, units, prices by tier, available stock).
2. **Expose a REST or GraphQL API** that serves pricing and stock information to the front‑end.  You can implement this API in Node/Express or any backend of your choice.
3. **Call the API from the front‑end** (e.g. via `fetch` or Axios) when the user requests a price or inventory check.  Display the results in the chat or a dedicated panel.
4. **Cache and encrypt sensitive data** on disk using a secure store (see `signal_cli_tool/store_model.py` in the original CLI project for an example of AES‑GCM encryption).  Tauri’s file system API (`@tauri-apps/api/fs`) can be used to read and write encrypted JSON.

## Next Steps

- **Implement conversation history storage** using IndexedDB or a local database to persist messages between sessions.
- **Add user settings pages** (notification preferences, account management) as additional panels.
- **Add drag‑and‑drop reordering** to the modular panels for a fully customisable workspace.
- **Implement cross‑platform installers** via Tauri’s bundler (DMG/EXE/DEB/AppImage, etc.).

Feel free to adapt and expand this scaffold to suit your exact requirements.  The aesthetic and layout have been designed for clarity and productivity; the architecture is flexible enough to support both personal and business use cases.