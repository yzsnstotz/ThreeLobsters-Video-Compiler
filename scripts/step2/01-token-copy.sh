#!/usr/bin/env bash
# Step 1: 复制 token 到各用户 ~/.secrets，owner 为对应用户（需 sudo）
set -euo pipefail
TLVC_TOKEN_SRC="${TLVC_TOKEN_SRC:-/Users/yzliu/work/tlvc/.secrets/tlvc.token}"
test -f "$TLVC_TOKEN_SRC" || { echo "MISSING $TLVC_TOKEN_SRC"; exit 1; }
if [[ "$(id -u)" -eq 0 ]]; then echo "Do not run as root"; exit 1; fi
for u in ao000 ao001 ao002; do
  echo "== token copy for $u =="
  TMPTOKEN="/tmp/tlvc.token.$u.$$"
  cp "$TLVC_TOKEN_SRC" "$TMPTOKEN"
  chmod 644 "$TMPTOKEN"
  sudo -u "$u" -i bash -lc 'mkdir -p "$HOME/.secrets"; install -m 600 "'"$TMPTOKEN"'" "$HOME/.secrets/tlvc.token"; ls -la "$HOME/.secrets/tlvc.token"'
  rm -f "$TMPTOKEN"
done
