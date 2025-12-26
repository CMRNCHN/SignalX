# Advanced Automation Rules (DSL + Visual Editor)

Purpose:
Enable complex, multi-step reply workflows using a rule DSL and optional visual editor.

Includes:
- Rule DSL (triggers, conditions, actions)
- Visual editor (React)
- Rule engine (Rust)
- Feature-flagged execution

Integration:
- Backend: src-tauri/rules.rs
- Frontend: RuleEditor.tsx
- Storage: uses signal_data_storage
- Flag: automation.rules (default OFF)
