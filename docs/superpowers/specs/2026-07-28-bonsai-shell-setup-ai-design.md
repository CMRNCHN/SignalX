# SignalX — dark Bonsai shell + setup/AI polish

Date: 2026-07-28

## Goal

Operator desktop UI: ChatCRM flat gray + Dream Homes modular columns + Bonsai tabs + dark liquid-glass composer + soft first-run device link (QR) + tighter commerce copy. Messenger IA unchanged; outbox-only; fail closed.

## Decisions

- Dark flat gray canvas (not light paper).
- Soft setup banner (not hard gate).
- Settings work tabs: System | Device link | IVR | Auto-reply.
- QR from existing `sgnl://` URI; Copy retained.
- Static invoice/IVR strings + commerce-aware Ollama draft prompt.

## Non-goals

Light theme, Tailwind/shadcn, hard setup gate, payments, attachments, multi-account.
