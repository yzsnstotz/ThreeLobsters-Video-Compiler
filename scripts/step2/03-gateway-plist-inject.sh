#!/usr/bin/env bash
# Step 3: 向各用户 gateway plist 注入 TLVC_TOKEN_FILE、TLVC_API_BASE（需 sudo）
# 使用显式路径，不依赖 $HOME（sudo -u -i 下 $HOME 可能为空）
set -euo pipefail
if [[ "$(id -u)" -eq 0 ]]; then echo "Do not run as root"; exit 1; fi
for u in ao000 ao001 ao002; do
  PL="/Users/$u/Library/LaunchAgents/ai.openclaw.gateway.plist"
  TOKEN_FILE="/Users/$u/.secrets/tlvc.token"
  echo "== inject plist for $u ($PL) =="
  if ! sudo test -f "$PL"; then
    echo "  MISSING $PL (skip)"
    continue
  fi
  # Pass PL and TOKEN_FILE from outer (inner $HOME may be empty under sudo -u -i)
  sudo -u "$u" bash -c '
    /usr/libexec/PlistBuddy -c "Add :EnvironmentVariables dict" "'"$PL"'" 2>/dev/null || true
    /usr/libexec/PlistBuddy -c "Set :EnvironmentVariables:TLVC_TOKEN_FILE '"$TOKEN_FILE"'" "'"$PL"'" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:TLVC_TOKEN_FILE string '"$TOKEN_FILE"'" "'"$PL"'"
    /usr/libexec/PlistBuddy -c "Set :EnvironmentVariables:TLVC_API_BASE http://127.0.0.1:8789" "'"$PL"'" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:TLVC_API_BASE string http://127.0.0.1:8789" "'"$PL"'"
    plutil -lint "'"$PL"'"
    /usr/libexec/PlistBuddy -c "Print :EnvironmentVariables" "'"$PL"'"
  '
done
