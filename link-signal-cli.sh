#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/Users/cameroncohen/Developer/apps/signalx"
CONFIG_DIR="$APP_DIR/.signal-cli"
LOG="$APP_DIR/link-signal-cli.log"

export JAVA_HOME="$("/usr/libexec/java_home")"

export STASH_URL="http://localhost:9999/graphql"
export STASH_API_KEY=""
[ -f "$HOME/.stash_api_key" ] && export STASH_API_KEY="$(cat "$HOME/.stash_api_key")"
export LIB="/Users/cameroncohen/Library/CloudStorage/GoogleDrive-cameronallencohen@gmail.com/My Drive"

SIGNAL_CLI="$(command -v signal-cli || true)"
[ -n "$SIGNAL_CLI" ] || SIGNAL_CLI="/opt/homebrew/bin/signal-cli"

mkdir -p "$APP_DIR" "$CONFIG_DIR"
: > "$LOG"

echo "== java ==" | tee -a "$LOG"
java -version 2>&1 | tee -a "$LOG"

echo "" | tee -a "$LOG"
echo "== signal-cli ==" | tee -a "$LOG"
"$SIGNAL_CLI" --version 2>&1 | tee -a "$LOG"

echo "" | tee -a "$LOG"
echo "== linking (scan QR in Signal iPhone > Settings > Linked Devices) ==" | tee -a "$LOG"
URI="$("$SIGNAL_CLI" --config "$CONFIG_DIR" -v link -n "SignalX-Mac" 2>&1 | tee -a "$LOG" | tail -n 1)"
printf '%s\n' "$URI" | tee "$APP_DIR/tsdevice-uri.txt" >/dev/null
printf '%s\n' "$URI" | qrencode -t UTF8 | tee -a "$LOG"

echo "" | tee -a "$LOG"
echo "== waiting up to 180s for link to complete ==" | tee -a "$LOG"
deadline=$((SECONDS+180))
while [ $SECONDS -lt $deadline ]; do
  if "$SIGNAL_CLI" --config "$CONFIG_DIR" listAccounts 2>/dev/null | grep -q .; then
    break
  fi
  sleep 2
done

echo "" | tee -a "$LOG"
echo "== accounts ==" | tee -a "$LOG"
"$SIGNAL_CLI" --config "$CONFIG_DIR" listAccounts 2>&1 | tee -a "$LOG"

python3 - <<'PY'
import os, json, subprocess
url=os.environ["STASH_URL"]
key=os.environ.get("STASH_API_KEY","")
lib=os.environ["LIB"]
def curl(q,v=None):
  payload={"query":q}
  if v is not None: payload["variables"]=v
  cmd=["curl","-sS",url,"-H","Content-Type: application/json"]
  if key: cmd+=["-H",f"ApiKey: {key}"]
  cmd+=["-d",json.dumps(payload)]
  return json.loads(subprocess.check_output(cmd,text=True).strip())
print(json.dumps(curl('mutation($input: ConfigGeneralInput!){configureGeneral(input:$input){configFilePath stashes{path excludeVideo excludeImage}}}',{"input":{"stashes":[{"path":lib,"excludeVideo":False,"excludeImage":False}]}}),indent=2))
print(json.dumps(curl('mutation($input: ScanMetadataInput!){metadataScan(input:$input)}',{"input":{"paths":[lib],"rescan":True}}),indent=2))
print(json.dumps(curl('mutation($input: GenerateMetadataInput!){metadataGenerate(input:$input)}',{"input":{"covers":True,"previews":True,"sprites":True,"phashes":True,"imageThumbnails":True,"clipPreviews":True,"overwrite":False}}),indent=2))
PY
