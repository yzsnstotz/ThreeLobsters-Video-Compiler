#!/usr/bin/env bash
# Step 2: 同步 tlvc_status / tlvc_deliver 到各用户 tools 目录（需 sudo）
set -euo pipefail
REPO_SCRIPTS="${REPO_SCRIPTS:-/Users/yzliu/work/tlvc/scripts}"
test -x "$REPO_SCRIPTS/tlvc_status" || { echo "MISSING tlvc_status"; exit 1; }
test -x "$REPO_SCRIPTS/tlvc_deliver" || { echo "MISSING tlvc_deliver"; exit 1; }
if [[ "$(id -u)" -eq 0 ]]; then echo "Do not run as root"; exit 1; fi
for u in ao000 ao001 ao002; do
  echo "== sync tools for $u =="
  sudo mkdir -p "/Users/$u/.openclaw/workspace/tools/tlvc"
  sudo install -m 755 -o "$u" -g staff "$REPO_SCRIPTS/tlvc_status" "/Users/$u/.openclaw/workspace/tools/tlvc/tlvc_status"
  sudo install -m 755 -o "$u" -g staff "$REPO_SCRIPTS/tlvc_deliver" "/Users/$u/.openclaw/workspace/tools/tlvc/tlvc_deliver"
  sudo ls -la "/Users/$u/.openclaw/workspace/tools/tlvc/tlvc_status" "/Users/$u/.openclaw/workspace/tools/tlvc/tlvc_deliver"
done
