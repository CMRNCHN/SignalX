#!/usr/bin/env bash
set -euo pipefail
APP_DIR="/Users/cameroncohen/Developer/apps/signalx"
CONFIG_DIR="$APP_DIR/signal-cli-config"
LOG="$APP_DIR/link-live.log"
PNG="$APP_DIR/signal-link-qr.png"
URI_FILE="$APP_DIR/signal-link-uri.txt"
mkdir -p "$CONFIG_DIR"
while true; do
  : > "$LOG"
  rm -f "$PNG" "$URI_FILE"
  python3 -u - <<PY
import os, subprocess, sys, re
app_dir=os.environ["APP_DIR"]
config_dir=os.environ["CONFIG_DIR"]
log_path=os.environ["LOG"]
png=os.environ["PNG"]
uri_file=os.environ["URI_FILE"]
p=subprocess.Popen(["signal-cli","--config",config_dir,"-v","link","-n","SignalX-Mac"],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,bufsize=1)
uri=None
with open(log_path,"w") as log:
  for line in p.stdout:
    log.write(line); log.flush()
    sys.stdout.write(line); sys.stdout.flush()
    if uri is None and line.startswith("sgnl://linkdevice"):
      uri=line.strip()
      open(uri_file,"w").write(uri+"\n")
      subprocess.run(["qrencode","-o",png,"-s","24","-m","1",uri],check=False)
      subprocess.run(["qrencode","-t","UTF8",uri],check=False)
      sys.stdout.write("\nSCAN THIS NOW: Signal → Settings → Linked Devices\n\n"); sys.stdout.flush()
p.wait()
rc=p.returncode
sys.exit(rc if rc is not None else 1)
PY
  sleep 1
done
