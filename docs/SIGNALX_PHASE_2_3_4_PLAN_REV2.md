# SignalX Roadmap — Phases 2, 3, 4 (Revision 2)

**Supersedes:** `SIGNALX_PHASE_2_3_4_PLAN.md`. That plan assumed Phase 1 was the foundation and `src/App.tsx` was the thing to retire. `docs/PHASE1_TYPE_DELTA.md` shows the opposite. This revision reverses direction.

---

## What the audit changed

| Claim in Rev 1 | What the audit found |
|---|---|
| Phase 3 is a provider swap; components don't change | `Thread` 50%, `ThreadMessage` 40%, `Contact` 60%. Components are shaped around fixture types. Rewrite, not swap. |
| Phase 4 builds the visual IVR designer | `IvrMenuComposer.tsx` already exists in `src/` and speaks the real `IvrMenus` state machine. Phase 1's Menu Builder is a flat-menu toy. Nothing to build; something to delete. |
| Task 2.0 reconciles types — highest leverage in the roadmap | `src/api.ts` already mirrors the backend exactly. No reconciliation needed. |
| Segments sidebar filters on Favorite / VIP / core buyer | Backend has `favorite: boolean` plus `categories: string[]` — arbitrary user-defined tags. Fixed segments are wrong. The live app already does this correctly. |

**Conclusion:** Phase 1 is a good layout artifact and a bad data artifact. Keep the first, discard the second.

---

## What ports from Phase 1

**Portable as-is** (no backend types involved):
- `tailwind.config.ts`
- `index.css` — token definitions, dark + light
- `ThemeContext.tsx` — system preference detection, localStorage, toggle
- Grid layout: `minmax()` columns, `gap-2` shell, per-screen column templates
- Spacing scale and the decisions made with it
- `Nav`, `Button`, `Badge`, `Avatar`, `SearchBar` — presentational, minor prop reshaping

**Discard:**
- `SignalXContext.tsx` — fixtures; `api.ts` is the real source
- `types.ts` — 40–60% wrong
- `ThreadList`, `ThreadDetail`, `ContextRail`, `ContactList`, `ContactDetail` — logic assumes fixture shapes; the *markup and classes* are worth reading while rewriting, the components aren't worth porting
- `MenuBuilder/` — delete. `IvrMenuComposer.tsx` is the real one.

**Keep the branch** `origin/cursor/cloud-agent-1788721043385-delzg` as a design reference. Don't develop it further. Don't merge it.

---

## Phase 2 — Design system into the live app

**Goal:** the live Tauri app gets Phase 1's spacing, grid, and theme. Your original complaint, fixed in the product.

No component extraction yet. Styling only. This is deliberately the cheapest path to the thing that actually bothers you.

1. **Install Tailwind in the live app.** v3, `darkMode: 'class'`, content globs over `src/`. Coexists with `styles.css` — don't delete it yet.
2. **Port the tokens.** Move Phase 1's `:root` / `.light` variable blocks into the live stylesheet. The existing dark values already match; light is new.
3. **Port `ThemeContext.tsx`.** Zero backend coupling. Wire the toggle into the existing Settings screen.
4. **Restyle the shell.** Replace the fixed `212px | 300px | 1fr | 300px` grid with Phase 1's `minmax()` templates. One change, immediately visible.
5. **Sweep spacing screen by screen.** Replace ad-hoc padding/margin with Tailwind utilities. Inbox first — most complex, most used, proves the pattern.

**Exit:** live app has correct spacing and a working light mode. `styles.css` is materially smaller. No type changes, no behavior changes.

**Size: M.** Lower risk than anything in Rev 1 — presentation only, and every step is independently revertable.

---

## Phase 3 — Decompose `App.tsx`

**Goal:** the architectural cleanliness payoff, on a codebase that already works.

Extract screen by screen from the 3,903-line monolith, using Phase 1's file structure as the target layout:

```
src/components/
  shared/     Nav, Button, Badge, SearchBar, Avatar
  Inbox/      ThreadList, ThreadDetail, ContextRail, ThreadItem
  People/     ContactList, ContactDetail, ContactItem
  Catalog/    …
  Orders/     …
  ...
```

Order: Inbox → People → Orders → Catalog → Outbox → Sales → Audit → Settings.

Rules:
- One screen per commit. `npm run tauri dev` passes between each.
- Types come from `api.ts`. Never redefine a type that already exists there.
- A data-layer Context is optional here and only worth adding if prop-drilling gets painful. `api.ts` is already the abstraction; a second one may be ceremony.

**Exit:** no file over ~400 lines. Each screen independently editable.

**Size: L.** Mechanical, low-risk, interruptible — stop after any screen and the app still works.

---

## Phase 4 — New capability

Only after 2 and 3.

- **Responsive.** Tablet reflow, mobile drawer nav. The `minmax()` grid was built for it; media queries plus a drawer.
- **Keyboard navigation.** `j`/`k` thread nav, `⌘↵` send, `/` focus search.
- **Loading, empty, and error states** per screen — currently implicit.
- **IVR composer improvements**, if `IvrMenuComposer.tsx` needs them. Evaluate the existing one before assuming it does.

**Size: M.** Genuinely cuttable.

---

## Open questions

The audit didn't resolve these. Check `src/App.tsx` and `api.ts` before Phase 3 touches Inbox.

1. **Inbound messages: push or poll?** Does signal-cli emit Tauri events, or does the UI poll? Decides whether Inbox needs a subscription. Still unanswered after two attempts.
2. **Where does thread-list preview text come from?** `ThreadSummary` has `last_message_timestamp` but no message text — yet the live thread list renders previews. Either an extra call per thread or an endpoint the audit missed.
3. **Where do contact notes live?** The live profile rail has a notes field with a save button; `ContactMeta` has no notes field. Something else stores them.

---

## Sequencing note

Rev 1 treated "two frontends" as the emergency. It isn't — Phase 1 was never in the shipping path and now won't be. The real cost was the four days of planning built on a repo I hadn't read. Phase 2 is small, visible, and revertable; start there rather than planning further.
