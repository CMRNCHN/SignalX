# Layout Intelligence Spec

Goals
- User controls sidebar width + composer height, density + contrast.
- Layout changes are smooth, constrained, persisted, and resettable.

UX requirements
- Divider handles: 6–10px hit area, visible on hover, double-click resets.
- Snap points:
  - sidebar: 320, 360, 420, 480
  - composer: 96, 120, 160, 220
- Workspaces:
  - Focus: sidebar narrow, composer small
  - Inbox: default
  - Ops: wide + high contrast
  - Compose: taller composer

Data model
- sidebarW, composerH, density, contrast, workspace, collapsed{}
