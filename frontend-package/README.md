# SignalX frontend package

Hand-off of the React/Vite UI that drives the Tauri desktop app.

## What’s in here

| Path | Contents |
| --- | --- |
| `SCREEN_INDEX.md` | Every screen screenshot + design tokens + link to that screen’s computed styles |
| `screenshots/` | 1440×900 @2x PNGs of each panel, overlay, and scrolled catalog/orders/IVR view |
| `styles/styles.css` | Full stylesheet (`src/styles.css`) |
| `styles/tokens.json` | Computed `:root` custom properties |
| `styles/screens/` | Per-screen class tables (color, background, font, padding, radius, border) |
| `computed/` | Raw JSON dumps of every unique class combo on each screen |
| `source/` | App frontend as shipped: React/TS, CSS, Vite/TS configs, `package.json` |

Conversation screenshots use labeled **fixture** data (shop line, Maya Chen thread, catalog, orders) so layout and states are visible. The `source/` copy is the real app — it talks to Tauri IPC, not those fixtures.

## Stack

- React 19 + TypeScript + Vite 8
- IBM Plex Sans / Mono / Serif (loaded in `index.html`)
- Dark UI; layout is CSS grid (`.shell`: nav 220px, list 300px, conversation, optional 300px profile rail)
- Single-page app: nav `Panel` in `App.tsx` (no React Router)

## Source map

| File | Role |
| --- | --- |
| `src/main.tsx` | Mount |
| `src/App.tsx` | Shell, all panels, settings tabs, lock overlay, desktop gate |
| `src/styles.css` | Tokens + every component class |
| `src/api.ts` | Tauri `invoke` / event types |
| `src/runtime.ts` | `isTauriRuntime()` — browser shows desktop gate |
| `src/ProfileRail.tsx` | Thread CRM: standing, notes, AI summary, ledger |
| `src/IvrMenuComposer.tsx` | Buyer-menu visual/text editor |
| `src/DeviceLinkQr.tsx` | Device-link QR |
| `src/navIcons.tsx` | Sidebar icons |

## Screens (nav)

Messages, Search, Contacts, Groups, Catalog, Customers, Orders, Sales, Outbox, Auto-reply log, Settings (Account / Buyer menu / Auto-reply / Backup). Plus session lock, account menu, desktop gate.

Open `SCREEN_INDEX.md` for images beside styles.
