python3 - <<'PY'
from pathlib import Path
import subprocess, datetime
root=Path("/Users/cameroncohen/Developer/apps/signalx/_worktrees")
print("SX MULTI-AGENT STATUS", datetime.datetime.now().strftime("%H:%M:%S"))
for d in sorted(root.iterdir()):
    if not (d/".git").exists(): continue
    s=subprocess.check_output(["git","status","-sb"], cwd=d).decode().splitlines()[0]
    print(f"{d.name:14} {s}")
PY
