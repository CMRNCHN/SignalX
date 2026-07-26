# IVR Menu Responder Design

**Date:** 2026-07-26  
**Status:** Approved for implementation  
**Depends on:** Foundation hardening (single account, outbox-only send)

## Goal

Give SignalX a Telegram-style / phone-IVR menu over Signal text: customers reply with numbers (or keywords); the app walks a per-thread session and answers through the outbox. Handoff to a human pauses the bot on that thread.

## Non-goals (v1)

- Native Signal buttons / polls / reactions as primary UX
- Catalog browse or order-create nodes (stubs only; commerce is the next slice)
- Multi-account
- Groups (IVR ignored for `group:` threads)

## Product behavior

Default main menu (editable JSON later):

```
Welcome — reply with a number:
1 · Info
2 · Leave a note
3 · Talk to a person
0 · Main menu
```

- `1` → short static info reply, return to main (or stay on info node once)
- `2` → ask for free text; next inbound message is stored as a “note” slot and acknowledged; return to main
- `3` → handoff: bot stops on that thread; operator sees handed-off state in UI
- `0` / `menu` / `help` → reset to main
- Unknown input → short hint + re-show current menu
- Session idle timeout (default 30 minutes) → reset to main on next message

Global kill switch + per-thread opt-in. Default: IVR **off** globally until enabled in Settings. Per-thread must be enabled (or allowlist) before the bot answers — same spirit as auto-reply guardrails.

## Architecture (minimal)

One account, one process. Add a small IVR module inside `lib.rs` (or a focused `ivr` submodule file if easy) with:

1. **Menu definitions** — `ivr/menus.json` under app data  
2. **Sessions** — `ivr/sessions/{canonical_account}.json` map of `thread_id → session`  
3. **Engine** — pure function: `(session, inbound_text, menus) → (new_session, optional reply text, side effects)`  
4. **Hook** — after normalizing an inbound message in the receive loop, if IVR applies, run engine and `queue_outgoing_message` for the reply  
5. **Precedence** — if IVR handles the message (including handoff ack), skip AI auto-reply enqueue for that message

### Session record

```json
{
  "thread_id": "dm:+1…",
  "node_id": "main",
  "slots": { "note": "…" },
  "handed_off": false,
  "updated_at": 0,
  "expires_at": 0
}
```

### Menu / node shape (v1)

```json
{
  "version": 1,
  "entry": "main",
  "session_ttl_ms": 1800000,
  "nodes": {
    "main": {
      "prompt": "Welcome — reply with a number:\n1 · Info\n2 · Leave a note\n3 · Talk to a person\n0 · Main menu",
      "choices": {
        "1": { "goto": "info" },
        "2": { "goto": "ask_note" },
        "3": { "action": "handoff", "reply": "A person will take it from here. Hang tight." },
        "0": { "goto": "main" },
        "menu": { "goto": "main" },
        "help": { "goto": "main" }
      },
      "on_unknown": "Please reply with 1, 2, 3, or 0."
    },
    "info": {
      "prompt": "SignalX shop bot (demo). Reply 0 for the main menu.",
      "choices": { "0": { "goto": "main" }, "menu": { "goto": "main" } },
      "on_unknown": "Reply 0 for the main menu."
    },
    "ask_note": {
      "prompt": "Type your note in one message.",
      "capture_slot": "note",
      "after_capture": {
        "reply": "Got it — thanks.",
        "goto": "main"
      }
    }
  }
}
```

Engine rules:
- Normalize input: trim; lowercase keywords `menu`/`help`; strip wrapping whitespace.
- If `handed_off`, do nothing (operator owns the thread) until UI clears handoff / re-enables.
- If node has `capture_slot` and no pending choice match required, store full text in slot, send `after_capture.reply`, `goto`.
- Choice match: exact key in `choices` (after normalize for keywords; digits as entered).
- On `goto`, reply with target node’s `prompt` (and set `node_id`).
- On `action: handoff`, set `handed_off`, send reply, do not advance menu.

### Settings

Extend or add alongside auto-reply:

```json
{
  "enabled": false,
  "allowlist": [],
  "require_allowlist": true
}
```

IVR runs for a thread only if: global `enabled` AND (not group) AND NOT `handed_off` AND (allowlist empty with `require_allowlist: false`, OR thread on allowlist).  
v1 default: `enabled: false`, `require_allowlist: true`, empty allowlist — operator opts in per thread via UI (adds to allowlist + clears handoff).

### IPC / UI

- `cmd_get_ivr_settings` / `cmd_set_ivr_settings`
- `cmd_get_thread_ivr` → `{ thread_id, enabled, handed_off, node_id?, effective }`
- `cmd_set_thread_ivr` → `{ enabled: bool }` (updates allowlist; if enabling, clear `handed_off`)
- `cmd_clear_thread_handoff`
- Settings panel: global IVR toggle  
- Thread header: IVR on/off + “Resume bot” when handed off  

### Privacy

- Sessions store only slots the menu asked for, not full history.
- Replies only via outbox.
- No Ollama involvement in v1 routing.

## Success criteria

- With IVR enabled and thread allowlisted, inbound `1`/`2`/`3`/`0` behave as above.
- Groups never get IVR replies.
- Handoff stops further IVR replies until cleared.
- Workers still respect single-account foundation rules.
- Unit tests for engine transitions (no signal-cli).

## Follow-on

Wire `info` / future nodes to catalog and order intents once commerce exists.
