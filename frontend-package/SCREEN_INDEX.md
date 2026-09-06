# SignalX frontend screen index
Screens captured from the live React UI (`src/`) at 1440×900 @2x. Fixture data is labeled in screenshots; styles come from computed CSS for every unique class combination on that screen.

## Design tokens (`:root`)

| Token | Value |
| --- | --- |
| `--bg` | `#16171a` |
| `--bg-lift` | `#1e1f23` |
| `--bg-2` | `#26282d` |
| `--bg-3` | `#30333a` |
| `--surface-0` | `#1c1d21` |
| `--surface-1` | `#232529` |
| `--surface-2` | `#2c2e34` |
| `--surface-3` | `#363940` |
| `--panel` | `#232529` |
| `--panel-2` | `#2c2e34` |
| `--border` | `rgba(255, 255, 255, 0.045)` |
| `--border-strong` | `rgba(255, 255, 255, 0.09)` |
| `--text` | `#eef0f3` |
| `--text-dim` | `#8e949e` |
| `--muted` | `#8e949e` |
| `--accent` | `#eef0f3` |
| `--accent-soft` | `rgba(61, 139, 253, 0.14)` |
| `--accent-cta` | `#3d8bfd` |
| `--accent-cta-hover` | `#5a9dff` |
| `--danger` | `#f87171` |
| `--warn` | `#fbbf24` |
| `--ok` | `#34d399` |
| `--ok-soft` | `rgba(52, 211, 153, 0.12)` |
| `--ok-border` | `rgba(52, 211, 153, 0.28)` |
| `--ok-text` | `#a7f3d0` |
| `--warn-soft` | `rgba(251, 191, 36, 0.12)` |
| `--warn-border` | `rgba(251, 191, 36, 0.28)` |
| `--warn-text` | `#fde68a` |
| `--danger-soft` | `rgba(248, 113, 113, 0.12)` |
| `--danger-border` | `rgba(248, 113, 113, 0.28)` |
| `--danger-text` | `#fecaca` |
| `--cta-text` | `#93c5fd` |
| `--bubble-in` | `#2f3239` |
| `--bubble-out` | `#1f3a5c` |
| `--radius` | `14px` |
| `--radius-sm` | `10px` |
| `--radius-xs` | `7px` |
| `--radius-composer` | `16px` |
| `--radius-bubble` | `12px` |
| `--glass` | `rgba(36, 38, 44, 0.78)` |
| `--glass-border` | `rgba(255, 255, 255, 0.08)` |
| `--shadow` | `none` |
| `--shadow-float` | `0 12px 32px rgba(0, 0, 0, 0.4)` |
| `--space-1` | `4px` |
| `--space-2` | `8px` |
| `--space-3` | `12px` |
| `--space-4` | `16px` |
| `--space-5` | `20px` |
| `--pad-panel` | `14px` |
| `--pad-section` | `12px 14px` |

## Screens

### Desktop gate

![Desktop gate](screenshots/00-desktop-gate.png)

Browser-only gate when the UI is not in Tauri. `.shell.desktop-gate`, `.desktop-gate-panel`, `.brand-mark`, `.desktop-gate-cmd`, `.hint.tight`.

Class/style sheet: [`styles/screens/00-desktop-gate.md`](styles/screens/00-desktop-gate.md)

### Session lock

![Session lock](screenshots/01-session-lock.png)

PIN unlock overlay. `.lock-overlay`, `.lock-card`, `.lock-accounts`, `.lock-account.active`, `.field-label`, `.action-btn.primary`.

Class/style sheet: [`styles/screens/01-session-lock.md`](styles/screens/01-session-lock.md)

### Messages — no thread

![Messages — no thread](screenshots/02-messages-home.png)

Nav rail + thread list + empty conversation. `.shell.shell-with-profile`, `.rail`, `.nav-btn.active`, `.thread-col`, `.convo-empty`, `.quick-action`, `.profile-rail-empty`.

Class/style sheet: [`styles/screens/02-messages-home.md`](styles/screens/02-messages-home.md)

### Messages — conversation + profile

![Messages — conversation + profile](screenshots/03-messages-conversation.png)

Chat with in/out bubbles, outbox cards, CRM rail. `.convo`, `.bubble` / `.bubble-in` / `.bubble-out`, `.composer`, `.profile-rail`, `.status-pill`, `.auto-thread-badge`.

Class/style sheet: [`styles/screens/03-messages-conversation.md`](styles/screens/03-messages-conversation.md)

### Account menu

![Account menu](screenshots/04-account-menu.png)

Lock / switch account. `.account-switch`, `.account-menu`, `.account-menu button.danger`.

Class/style sheet: [`styles/screens/04-account-menu.md`](styles/screens/04-account-menu.md)

### Search

![Search](screenshots/05-search.png)

Message search hits. `.search-box`, `.thread-row`, `.snippet`, `.avatar-dot`.

Class/style sheet: [`styles/screens/05-search.md`](styles/screens/05-search.md)

### Contacts

![Contacts](screenshots/06-contacts.png)

Create + manage contacts. `.pane-section`, `.compose-strip.stacked`, `.filter-strip`, `.thread-row`.

Class/style sheet: [`styles/screens/06-contacts.md`](styles/screens/06-contacts.md)

### Groups

![Groups](screenshots/07-groups.png)

Group list with Auto badge. `.thread-col`, `.badge.danger`, `.compose-strip`.

Class/style sheet: [`styles/screens/07-groups.md`](styles/screens/07-groups.md)

### Catalog

![Catalog](screenshots/08-catalog.png)

Product form + list. `.thread-col.wide`, `.product-form`, `.form-card`, `.product-row`.

Class/style sheet: [`styles/screens/08-catalog.md`](styles/screens/08-catalog.md)

### Catalog (scrolled)

![Catalog (scrolled)](screenshots/08b-catalog-scrolled.png)

Lower catalog: packs, stock, product rows.

Class/style sheet: [`styles/screens/08b-catalog-scrolled.md`](styles/screens/08b-catalog-scrolled.md)

### Customers

![Customers](screenshots/09-customers.png)

Linked chats. `.thread-row`, `.ghost-btn`, `.badge.muted`.

Class/style sheet: [`styles/screens/09-customers.md`](styles/screens/09-customers.md)

### Orders

![Orders](screenshots/10-orders.png)

Place/quote form. `.order-target`, `.wide-body`, `.product-form`.

Class/style sheet: [`styles/screens/10-orders.md`](styles/screens/10-orders.md)

### Sales

![Sales](screenshots/11-sales.png)

Totals and top products. `.sales-summary`, `.sales-totals`, `.sales-by-status`, `.sales-top-list`.

Class/style sheet: [`styles/screens/11-sales.md`](styles/screens/11-sales.md)

### Outbox

![Outbox](screenshots/12-outbox.png)

Queued/failed sends. `.status-pill.status-danger`, `.bubble-err`, `.row-actions`.

Class/style sheet: [`styles/screens/12-outbox.md`](styles/screens/12-outbox.md)

### Auto-reply log

![Auto-reply log](screenshots/13-auto-reply-log.png)

Audit list. `.audit-list`, `.snippet`, `.reason`.

Class/style sheet: [`styles/screens/13-auto-reply-log.md`](styles/screens/13-auto-reply-log.md)

### Settings — Account

![Settings — Account](screenshots/14-settings-account.png)

Status, device link, roster. `.work-tabs`, `.settings-card`, `.diag-grid`, `.device-link-panel`.

Class/style sheet: [`styles/screens/14-settings-account.md`](styles/screens/14-settings-account.md)

### Settings — Buyer menu

![Settings — Buyer menu](screenshots/15-settings-ivr.png)

IVR toggles + composer. `.work-tab.active`, `.ivr-*` / composer classes.

Class/style sheet: [`styles/screens/15-settings-ivr.md`](styles/screens/15-settings-ivr.md)

### Settings — Auto-reply

![Settings — Auto-reply](screenshots/16-settings-auto-reply.png)

Allowlist and rate limits. `.toggle`, `.settings-card`.

Class/style sheet: [`styles/screens/16-settings-auto-reply.md`](styles/screens/16-settings-auto-reply.md)

### Settings — Backup

![Settings — Backup](screenshots/17-settings-backup.png)

Export/import bundle. `.settings-card`, `.ghost-btn.file-pick-btn`.

Class/style sheet: [`styles/screens/17-settings-backup.md`](styles/screens/17-settings-backup.md)
