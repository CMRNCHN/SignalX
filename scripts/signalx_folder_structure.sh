#!/usr/bin/env bash
# SignalX documentation & asset scaffold.
# Safe to run multiple times — creates dirs and placeholder READMEs only.
# Does NOT relocate src/ or src-tauri/ application code.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "SignalX folder scaffold → $ROOT"

# ── Documentation registry ─────────────────────────────────────────────
mkdir -p docs/org
mkdir -p docs/assets/ui
mkdir -p docs/fixtures

# ── Optional future extract targets (empty until refactor) ─────────────
mkdir -p src/components/{shell,inbox,people,catalog,orders,settings,ivr,shared}
mkdir -p src/hooks
mkdir -p src/lib

# ── Test fixtures mirror ───────────────────────────────────────────────
mkdir -p tests/fixtures

# ── Placeholder READMEs ────────────────────────────────────────────────
write_readme() {
  local dir="$1"
  local body="$2"
  if [[ ! -f "$dir/README.md" ]]; then
    printf '%s\n' "$body" > "$dir/README.md"
    echo "  created $dir/README.md"
  fi
}

write_readme "docs/assets/ui" "# UI screenshots

Place numbered screen captures here:

\`\`\`
01-inbox.webp
02-people.webp
03-catalog.webp
04-orders.webp
05-settings-account.webp
06-settings-delivery.webp
07-menu-builder.webp
\`\`\`

Open \`signalx_gallery_template.html\` in this folder to preview the series.
"

write_readme "docs/fixtures" "# Fixtures

\`signalx_fixtures_template.json\` — demo CRM data aligned with \`src/api.ts\` and \`src-tauri/src/demo.rs\`.
Use for docs, Storybook, or integration tests.
"

write_readme "src/components" "# Components (extract targets)

Shared UI extracted from \`App.tsx\` over time. Registry: \`docs/signalx_screen_manifest.md\`.
"

write_readme "tests/fixtures" "# Test fixtures

Copy or symlink from \`docs/fixtures/\` for automated tests.
"

# ── Copy gallery template if missing ───────────────────────────────────
GALLERY_SRC="docs/assets/ui/signalx_gallery_template.html"
if [[ ! -f "$GALLERY_SRC" ]]; then
  cat > "$GALLERY_SRC" <<'HTMLEOF'
<!-- See docs/assets/ui/signalx_gallery_template.html in repo for full gallery -->
HTMLEOF
  echo "  note: commit includes full gallery template separately"
fi

echo ""
echo "Done. Next steps:"
echo "  1. Copy screenshots → docs/assets/ui/01-inbox.webp … 07-menu-builder.webp"
echo "  2. Read docs/SIGNALX_QUICKSTART.md"
echo "  3. Review docs/signalx_architecture.md + docs/signalx_screen_manifest.md"
