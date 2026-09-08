# SignalX — Agent Instructions

Two parts: **standing rules** that live in the repo and load automatically, and a **task queue** of scoped briefs you paste one at a time.

Do not paste the whole task queue into an agent. Every drift incident so far came from an agent holding more scope than the task needed.

---

# Part 1 — Standing rules

Write these once. They apply to every session after.

## `CLAUDE.md` (repo root — Claude Code loads this automatically)

```markdown
# SignalX — Agent Rules

## Architecture

- **Live product:** `src/` (React) + `src-tauri/` (Rust). This is what ships. Types in `src/api.ts` already mirror the Rust structs exactly — treat `api.ts` as the single source of truth for data shapes.
- **Phase 1 frontend:** exists only on `origin/cursor/cloud-agent-1788721043385-delzg`. It is a **design reference**, not a codebase. Its data model is 40–60% wrong (see `docs/PHASE1_TYPE_DELTA.md`). Never merge it. Port CSS and theme code from it only.
- **`src-tauri/src/demo.rs`:** restored from history, stale, unreferenced. Do not integrate it. Do not use it to generate fixtures.
- **Current direction:** port Phase 1's spacing/grid/theme into the live app. Do NOT port Phase 1's components, types, or fixtures. See `docs/SIGNALX_PHASE_2_3_4_PLAN_REV2.md`.

## Rules

1. **Do exactly one task. Stop. Report.** Do not continue to what seems like the obvious next step.
2. **Read-only means read-only.** If a task says audit, inspect, compare, or answer — write no source files. A markdown report is the only permitted output.
3. **Never touch `src-tauri/` or `src/api.ts`** unless the task names the file explicitly.
4. **Never redefine a type that exists in `src/api.ts`.** Import it.
5. **No worktrees, no branch switching, no merges** unless the task says so.
6. **Cite file and line for every factual claim.** If you contradict an earlier finding, say so explicitly rather than quietly correcting.
7. **If the task's premise is wrong** — files missing, branch different than described — stop and report. Do not improvise an adjacent task.
8. **Leave the build green.** `npm run tauri dev` must start after every task.

## Verification

After any task that changed files, output the result of `git status --short` and `git diff --stat`.
```

## `.cursor/rules/signalx.mdc`

```markdown
---
alwaysApply: true
---

Read CLAUDE.md in the repo root. All rules there apply here.

Additional:
- `src/api.ts` types are correct and match the Rust backend. Never rewrite them.
- Do not create files under `frontend/` — that path belongs to an abandoned experiment.
- Styling work only, unless the task explicitly says otherwise.
```

Install both:

```bash
cd ~/Developer/projects/SignalX && mkdir -p .cursor/rules && echo ".claude/" >> .gitignore
# paste the two blocks above into CLAUDE.md and .cursor/rules/signalx.mdc
git add CLAUDE.md .cursor/rules/signalx.mdc .gitignore && git commit -m "chore: agent rules"
```

---

# Part 2 — Task queue

Paste one brief. Wait. Review the diff. Then the next.

---

## Task 0 — Open questions (Claude Code, read-only)

Do this first. Phase 3 can't be planned without the answers.

```
Read-only task. Modify no source files.

Answer three questions from src/App.tsx and src/api.ts. Cite file and line for each.

1. Do inbound Signal messages arrive via Tauri events or a subscription, or does the UI poll on an interval?
2. The thread list renders message preview text, but ThreadSummary has only last_message_timestamp and no message text. Where does the preview come from?
3. The profile rail has a notes field with a save button, but ContactMeta has no notes field. Where are contact notes stored and what command persists them?

Write the answers to docs/OPEN_QUESTIONS.md. Change nothing else.
```

**Verify:** `git status --short` shows only `docs/OPEN_QUESTIONS.md`.

---

## Task 1 — Grid (do this yourself, not an agent)

One line, and it's most of the cramping.

```bash
cd ~/Developer/projects/SignalX && git checkout -b spacing-fix && grep -n "grid-template-columns" src/styles.css
```

Change the shell's fixed `212px 300px 1fr 300px` to:

```css
minmax(180px, 200px) minmax(280px, 320px) 1fr minmax(280px, 320px)
```

Run the app. Judge it before anything else moves.

---

## Task 2 — Tailwind + theme (Claude Code)

```
Branch: spacing-fix.

Three steps, then stop.

1. Install Tailwind v3 in the live app. darkMode: 'class'. Content globs over src/. Do NOT delete or modify src/styles.css — Tailwind coexists with it for now.

2. Port the light-mode token block from origin/cursor/cloud-agent-1788721043385-delzg, file frontend/src/index.css. Add the :root (dark, already matches) and .light variable definitions to the live stylesheet. Read the branch with `git show`, do not check it out.

3. Port ThemeContext.tsx from the same branch into src/context/. It has no backend coupling — it should port unchanged. Wire the Light/Dark/System toggle into the existing Settings screen.

Do not touch types, api.ts, src-tauri, or any component logic. Do not extract components. Stop after step 3 and report what changed.
```

**Verify:** app builds, theme toggle works, existing dark mode unchanged.

---

## Task 3 — Inbox spacing sweep (Cursor)

Cursor is better here — you want to watch it change.

```
Branch: spacing-fix. Styling only.

In the Inbox screen of src/App.tsx, replace ad-hoc padding, margin, and gap values with Tailwind utilities on this scale: 4px=1, 8px=2, 12px=3, 16px=4, 24px=6.

Targets:
- Panel padding: p-4
- List item padding: p-3
- Gap between sections: gap-4
- Gap between list items: gap-3

Change no logic, no types, no data flow, no JSX structure beyond className attributes. One screen only — do not touch People, Catalog, Orders, or any other screen.
```

**Verify:** `git diff` shows className changes and nothing else.

---

## Task 4+ — Remaining screens

Repeat Task 3's brief, one screen at a time, in this order: People → Orders → Catalog → Outbox → Sales → Audit → Settings.

Stop and look at the app after each. Do not batch them.

---

## Not yet

Component extraction (Phase 3) waits until every screen is restyled and Task 0's answers are in. Extraction is mechanical but touches everything; doing it before the styling settles means doing it twice.

---

# Tool split

| Work | Tool | Why |
|---|---|---|
| Repo investigation, audits | Claude Code | Reads whole files, runs git, verifies claims |
| Dependency setup, ports, file moves | Claude Code | Runs builds, confirms green |
| Visual/iterative styling | Cursor | Faster loop, you see it change |
| Component extraction (later) | Claude Code | Mechanical, multi-file, needs build verification |

**Never run both on the same files at once.** Finish a task, commit, then switch tools.
