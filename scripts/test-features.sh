#!/bin/zsh
# SignalX Feature Verification Script
# Run this after launching the app to verify all features work

set -e

echo "=== SignalX Feature Verification ==="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

check() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $1"
    else
        echo -e "${RED}✗${NC} $1"
    fi
}

echo "1. Checking environment configuration..."
if [ -f ".signalx.env" ]; then
    echo -e "${GREEN}✓${NC} .signalx.env exists"
    if grep -q "SIGNALX_NUMBER=+1" .signalx.env; then
        echo -e "${GREEN}✓${NC} SIGNALX_NUMBER is configured"
    else
        echo -e "${YELLOW}⚠${NC} SIGNALX_NUMBER may not be set correctly"
    fi
    if grep -q "SIGNALX_SIGNALCLI_CONFIG" .signalx.env; then
        echo -e "${GREEN}✓${NC} SIGNALX_SIGNALCLI_CONFIG is set"
    else
        echo -e "${RED}✗${NC} SIGNALX_SIGNALCLI_CONFIG is missing"
    fi
else
    echo -e "${RED}✗${NC} .signalx.env not found"
fi

echo ""
echo "2. Checking dependencies..."
if command -v signal-cli >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} signal-cli is installed"
    signal-cli --version 2>&1 | head -1
else
    echo -e "${RED}✗${NC} signal-cli not found (install via: brew install signal-cli)"
fi

if command -v ollama >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} ollama is installed"
else
    echo -e "${YELLOW}⚠${NC} ollama not installed (optional, for AI features)"
fi

OLLAMA_URL="${SIGNALX_OLLAMA_URL:-http://localhost:11434}"
if [ -f ".signalx.env" ]; then
    ENV_URL="$(grep '^SIGNALX_OLLAMA_URL=' .signalx.env 2>/dev/null | head -1 | cut -d'=' -f2- | tr -d '[:space:]')"
    if [ -n "$ENV_URL" ]; then
        OLLAMA_URL="$ENV_URL"
    fi
fi
OLLAMA_URL="${OLLAMA_URL%/}"

if grep -q "^SIGNALX_OLLAMA_MODEL=" .signalx.env 2>/dev/null; then
    MODEL=$(grep "^SIGNALX_OLLAMA_MODEL=" .signalx.env | head -1 | cut -d'=' -f2- | tr -d '[:space:]')
    echo -e "${GREEN}✓${NC} Ollama model configured: $MODEL"
else
    echo -e "${YELLOW}⚠${NC} SIGNALX_OLLAMA_MODEL not set in .signalx.env (AI features disabled)"
fi

if command -v curl >/dev/null 2>&1; then
    if curl -sf --max-time 3 "${OLLAMA_URL}/api/tags" >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Ollama HTTP API reachable at ${OLLAMA_URL}"
    else
        echo -e "${YELLOW}⚠${NC} Ollama HTTP API not reachable at ${OLLAMA_URL} (start with: ollama serve)"
    fi
else
    echo -e "${YELLOW}⚠${NC} curl not found; skipping Ollama HTTP reachability check"
fi

echo ""
echo "3. Checking build artifacts..."
if [ -d "src-tauri/target/release/bundle/macos" ]; then
    if [ -d "src-tauri/target/release/bundle/macos/SignalX.app" ]; then
        echo -e "${GREEN}✓${NC} Production build exists"
        echo "   Location: src-tauri/target/release/bundle/macos/SignalX.app"
    else
        echo -e "${YELLOW}⚠${NC} Production build directory exists but app not found"
    fi
else
    echo -e "${YELLOW}⚠${NC} Production build not found (run: npm run tauri build)"
fi

echo ""
echo "4. Checking data directories..."
DATA_DIR="$HOME/Library/Application Support/SignalX"
if [ -d "$DATA_DIR" ]; then
    echo -e "${GREEN}✓${NC} App data directory exists: $DATA_DIR"
    if [ -d "$DATA_DIR/threads" ]; then
        THREAD_COUNT=$(find "$DATA_DIR/threads" -name "*.json" 2>/dev/null | wc -l | tr -d ' ')
        echo -e "${GREEN}✓${NC} Threads directory exists ($THREAD_COUNT thread files)"
    fi
    if [ -d "$DATA_DIR/exports" ]; then
        EXPORT_COUNT=$(find "$DATA_DIR/exports" -type f 2>/dev/null | wc -l | tr -d ' ')
        echo -e "${GREEN}✓${NC} Export directory exists ($EXPORT_COUNT exported files)"
    fi
else
    echo -e "${YELLOW}⚠${NC} App data directory not found (will be created on first run)"
fi

echo ""
echo "5. Fast persistence + UX invariants (go/no-go)..."

STRICT="${SIGNALX_TEST_STRICT:-0}" # set to 1 to make missing test inputs/files fail hard

fail() {
  echo -e "${RED}✗${NC} $1"
  exit 1
}
warn() {
  echo -e "${YELLOW}⚠${NC} $1"
}
require_or_warn() {
  if [ "$STRICT" = "1" ]; then
    fail "$1"
  else
    warn "$1"
  fi
}

sanitize_filename() {
  # Mirrors Rust sanitize_filename(): allow [A-Za-z0-9_-], replace others with "_"
  echo -n "$1" | python3 -c 'import sys; s=sys.stdin.read(); print("".join([(c if (c.isalnum() or c in "-_") else "_") for c in s]))'
}

normalize_contact_id() {
  local s="$(echo -n "$1" | tr -d '[:space:]')"
  if [[ "$s" == dm:* || "$s" == group:* ]]; then
    echo -n "$s"
    return
  fi
  if [[ "$s" == +* || "$s" == [0-9]* ]]; then
    echo -n "dm:$s"
    return
  fi
  echo -n "$s"
}

normalize_group_id() {
  local s="$(echo -n "$1" | tr -d '[:space:]')"
  if [[ "$s" == group:* ]]; then
    echo -n "$s"
  else
    echo -n "group:$s"
  fi
}

# Determine account id (used to locate per-account JSON files)
ACCOUNT_ID="${SIGNALX_TEST_ACCOUNT_ID:-${SIGNALX_NUMBER:-}}"
if [ -z "$ACCOUNT_ID" ] && [ -f ".signalx.env" ]; then
  ACCOUNT_ID="$(grep '^SIGNALX_NUMBER=' .signalx.env 2>/dev/null | head -1 | cut -d'=' -f2- | tr -d '[:space:]')"
fi

if [ -z "$ACCOUNT_ID" ]; then
  require_or_warn "No account id found (set SIGNALX_TEST_ACCOUNT_ID or SIGNALX_NUMBER). Skipping persistence checks."
else
  ACCOUNT_FILE="$(sanitize_filename "$ACCOUNT_ID")"
  CONTACTS_FILE="$DATA_DIR/contacts/$ACCOUNT_FILE.json"
  GROUPS_FILE="$DATA_DIR/groups/$ACCOUNT_FILE.json"
  THREADS_FILE="$DATA_DIR/threads/$ACCOUNT_FILE.json"

  if [ -f "$CONTACTS_FILE" ]; then
    echo -e "${GREEN}✓${NC} Contact meta file exists: $CONTACTS_FILE"
  else
    require_or_warn "Contact meta file missing: $CONTACTS_FILE (launch app + switch to account once)"
  fi

  if [ -f "$GROUPS_FILE" ]; then
    echo -e "${GREEN}✓${NC} Group meta file exists: $GROUPS_FILE"
  else
    require_or_warn "Group meta file missing: $GROUPS_FILE (launch app + switch to account once)"
  fi

  if [ -f "$THREADS_FILE" ]; then
    echo -e "${GREEN}✓${NC} Threads state file exists: $THREADS_FILE"
  else
    require_or_warn "Threads state file missing: $THREADS_FILE (launch app + switch to account once)"
  fi

  # Derived threads should never write into contact/group meta stores with wrong key prefixes.
  if [ -f "$CONTACTS_FILE" ]; then
    python3 - "$CONTACTS_FILE" <<'PY'
import json,sys
path=sys.argv[1]
d=json.load(open(path))
contacts=d.get("contacts") or {}
bad=[]
for k,v in contacts.items():
  if not isinstance(k,str):
    bad.append(f"non-string key: {k!r}")
    continue
  if not k.startswith("dm:"):
    bad.append(f"unexpected contact key prefix: {k}")
    continue
  if isinstance(v,dict):
    cid=v.get("contact_id")
    if cid and cid != k:
      bad.append(f"contact_id mismatch: key={k} contact_id={cid}")
if bad:
  print("\n".join(bad))
  sys.exit(2)
PY
    if [ $? -eq 0 ]; then
      echo -e "${GREEN}✓${NC} Contact meta keys look sane (no derived-thread pollution)"
    else
      require_or_warn "Contact meta keys look polluted (non-dm: keys found). See above."
    fi
  fi

  if [ -f "$GROUPS_FILE" ]; then
    python3 - "$GROUPS_FILE" <<'PY'
import json,sys
path=sys.argv[1]
d=json.load(open(path))
groups=d.get("groups") or {}
bad=[]
for k,v in groups.items():
  if not isinstance(k,str):
    bad.append(f"non-string key: {k!r}")
    continue
  if not k.startswith("group:"):
    bad.append(f"unexpected group key prefix: {k}")
    continue
  if isinstance(v,dict):
    gid=v.get("group_id")
    if gid and gid != k:
      bad.append(f"group_id mismatch: key={k} group_id={gid}")
if bad:
  print("\n".join(bad))
  sys.exit(2)
PY
    if [ $? -eq 0 ]; then
      echo -e "${GREEN}✓${NC} Group meta keys look sane"
    else
      require_or_warn "Group meta keys look polluted (non-group: keys found). See above."
    fi
  fi

  # Contact meta persistence (edit -> restart): set SIGNALX_TEST_CONTACT_ID and optional expected fields.
  if [ -n "${SIGNALX_TEST_CONTACT_ID:-}" ]; then
    CID="$(normalize_contact_id "$SIGNALX_TEST_CONTACT_ID")"
    if [ ! -f "$CONTACTS_FILE" ]; then
      require_or_warn "Cannot verify contact meta persistence: $CONTACTS_FILE missing"
    else
      python3 - "$CONTACTS_FILE" "$CID" "${SIGNALX_TEST_CONTACT_DISPLAY_NAME:-}" <<'PY'
import json,sys
path,cid,expected=sys.argv[1],sys.argv[2],sys.argv[3]
d=json.load(open(path))
contacts=d.get("contacts") or {}
if cid not in contacts:
  print(f"missing contact_id: {cid}")
  sys.exit(2)
m=contacts[cid] or {}
if expected and (m.get("display_name") != expected):
  print(f"display_name mismatch: expected={expected!r} got={m.get('display_name')!r}")
  sys.exit(3)
photo=m.get("photo_path")
print(photo or "")
PY
      rc=$?
      if [ $rc -eq 0 ]; then
        echo -e "${GREEN}✓${NC} Contact meta present for $CID"
      else
        require_or_warn "Contact meta persistence check failed for $CID"
      fi

      # Contact photo persistence: if the contact has a photo_path, ensure the referenced file exists.
      PHOTO_PATH="$(python3 - "$CONTACTS_FILE" "$CID" <<'PY'
import json,sys
path,cid=sys.argv[1],sys.argv[2]
d=json.load(open(path))
m=(d.get("contacts") or {}).get(cid) or {}
pp=m.get("photo_path")
print(pp or "")
PY
)"
      if [ -n "$PHOTO_PATH" ]; then
        if [[ "$PHOTO_PATH" == /* ]]; then
          [ -f "$PHOTO_PATH" ] && echo -e "${GREEN}✓${NC} Contact photo file exists: $PHOTO_PATH" || require_or_warn "Contact photo file missing: $PHOTO_PATH"
        else
          [ -f "$DATA_DIR/$PHOTO_PATH" ] && echo -e "${GREEN}✓${NC} Contact photo file exists: $DATA_DIR/$PHOTO_PATH" || require_or_warn "Contact photo file missing: $DATA_DIR/$PHOTO_PATH"
        fi
      else
        warn "No photo_path set for $CID (skipping photo persistence check)"
      fi
    fi
  fi

  # Group meta persistence (edit -> restart): set SIGNALX_TEST_GROUP_ID and optional expected display name.
  if [ -n "${SIGNALX_TEST_GROUP_ID:-}" ]; then
    GID="$(normalize_group_id "$SIGNALX_TEST_GROUP_ID")"
    if [ ! -f "$GROUPS_FILE" ]; then
      require_or_warn "Cannot verify group meta persistence: $GROUPS_FILE missing"
    else
      python3 - "$GROUPS_FILE" "$GID" "${SIGNALX_TEST_GROUP_DISPLAY_NAME:-}" <<'PY'
import json,sys
path,gid,expected=sys.argv[1],sys.argv[2],sys.argv[3]
d=json.load(open(path))
groups=d.get("groups") or {}
if gid not in groups:
  print(f"missing group_id: {gid}")
  sys.exit(2)
m=groups[gid] or {}
if expected and (m.get("display_name") != expected):
  print(f"display_name mismatch: expected={expected!r} got={m.get('display_name')!r}")
  sys.exit(3)
PY
      rc=$?
      if [ $rc -eq 0 ]; then
        echo -e "${GREEN}✓${NC} Group meta present for $GID"
      else
        require_or_warn "Group meta persistence check failed for $GID"
      fi
    fi
  fi
fi

# Account switch isolation: provide 2 accounts and (optionally) expected per-account contact meta.
if [ -n "${SIGNALX_TEST_ACCOUNT_ID_A:-}" ] && [ -n "${SIGNALX_TEST_ACCOUNT_ID_B:-}" ]; then
  A_ID="$SIGNALX_TEST_ACCOUNT_ID_A"
  B_ID="$SIGNALX_TEST_ACCOUNT_ID_B"
  A_FILE="$(sanitize_filename "$A_ID")"
  B_FILE="$(sanitize_filename "$B_ID")"

  A_CONTACTS="$DATA_DIR/contacts/$A_FILE.json"
  B_CONTACTS="$DATA_DIR/contacts/$B_FILE.json"

  if [ "$A_CONTACTS" = "$B_CONTACTS" ]; then
    require_or_warn "Account switch isolation failed: account A and B resolve to the same contacts file path"
  fi

  [ -f "$A_CONTACTS" ] && echo -e "${GREEN}✓${NC} Account A contacts file exists: $A_CONTACTS" || require_or_warn "Account A contacts file missing: $A_CONTACTS"
  [ -f "$B_CONTACTS" ] && echo -e "${GREEN}✓${NC} Account B contacts file exists: $B_CONTACTS" || require_or_warn "Account B contacts file missing: $B_CONTACTS"

  if [ -n "${SIGNALX_TEST_CONTACT_ID:-}" ] && [ -f "$A_CONTACTS" ] && [ -f "$B_CONTACTS" ]; then
    CID="$(normalize_contact_id "$SIGNALX_TEST_CONTACT_ID")"
    A_EXPECT="${SIGNALX_TEST_CONTACT_DISPLAY_NAME_A:-}"
    B_EXPECT="${SIGNALX_TEST_CONTACT_DISPLAY_NAME_B:-}"
    python3 - "$A_CONTACTS" "$B_CONTACTS" "$CID" "$A_EXPECT" "$B_EXPECT" <<'PY'
import json,sys
a_path,b_path,cid,a_exp,b_exp=sys.argv[1],sys.argv[2],sys.argv[3],sys.argv[4],sys.argv[5]
a=json.load(open(a_path)); b=json.load(open(b_path))
am=(a.get("contacts") or {}).get(cid) or {}
bm=(b.get("contacts") or {}).get(cid) or {}
if a_exp and am.get("display_name") != a_exp:
  print(f"Account A display_name mismatch for {cid}: expected={a_exp!r} got={am.get('display_name')!r}")
  sys.exit(2)
if b_exp and bm.get("display_name") != b_exp:
  print(f"Account B display_name mismatch for {cid}: expected={b_exp!r} got={bm.get('display_name')!r}")
  sys.exit(3)
if a_exp and b_exp and a_exp == b_exp:
  # Not a hard failure, but defeats the purpose of this isolation check.
  print("Warning: expected A and B display_name are identical; isolation check is weaker.")
sys.exit(0)
PY
    if [ $? -eq 0 ]; then
      echo -e "${GREEN}✓${NC} Account switch isolation check passed (per-account contact meta)"
    else
      require_or_warn "Account switch isolation check failed (per-account contact meta mismatch). See above."
    fi
  else
    warn "Account switch isolation: set SIGNALX_TEST_CONTACT_ID (+ expected names) for a stronger check"
  fi
fi

# Muted hidden-by-default: people-search filters default include_muted to false (serde).
if grep -q 'include_muted: bool,' src-tauri/src/lib.rs && \
   grep -B2 'include_muted: bool,' src-tauri/src/lib.rs | grep -q '#\[serde(default)\]'; then
  echo -e "${GREEN}✓${NC} Muted is hidden by default (include_muted defaults to false)"
else
  require_or_warn "Muted hidden-by-default check failed (PeopleSearchFilters include_muted default changed?)"
fi

echo "=== Manual Testing Checklist ==="
echo ""
echo "After launching the app (./SignalX-Dev.command), verify:"
echo ""
echo "  [ ] Active account loads in dropdown"
echo "  [ ] Health badge shows in sidebar (green/yellow/red)"
echo "  [ ] Health badge tooltip shows on hover"
echo "  [ ] Threads list appears"
echo "  [ ] Can select a thread"
echo "  [ ] Messages load when thread is selected"
echo "  [ ] Can send a message"
echo "  [ ] Incoming messages appear (test from another device)"
echo "  [ ] Export TXT button works"
echo "  [ ] Export JSON button works"
echo "  [ ] 'Open Folder' button opens Finder"
echo "  [ ] Search returns results"
echo "  [ ] Aliases can be set and displayed"
echo "  [ ] App restart preserves history"
echo ""
echo "If AI is configured:"
echo "  [ ] Summarize button produces output"
echo "  [ ] Draft button fills composer (doesn't auto-send)"
echo ""


