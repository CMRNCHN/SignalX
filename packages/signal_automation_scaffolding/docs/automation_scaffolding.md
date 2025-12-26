# Automation Scaffolding Spec

Safety model
- Default action: DRAFT (never send automatically)
- Auto-send requires:
  - feature flag ai.send_auto = true
  - per-thread "ARMED" toggle visible in UI

Flow
incoming -> classify -> pick rule -> produce action:
- NONE | DRAFT | QUEUE_SEND
- draft text
- optional tags/confidence
