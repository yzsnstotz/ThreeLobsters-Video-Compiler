#!/usr/bin/env bash
# Step 4: 重载各用户 gateway LaunchAgent（需 sudo；仅对已安装 openclaw 的用户执行 openclaw 命令）
# 使用显式路径和 uid，不依赖 $HOME
set -euo pipefail
if [[ "$(id -u)" -eq 0 ]]; then echo "Do not run as root"; exit 1; fi
for u in ao000 ao001 ao002; do
  PL="/Users/$u/Library/LaunchAgents/ai.openclaw.gateway.plist"
  _UID=$(id -u "$u" 2>/dev/null || true)
  echo "== restart gateway for $u (uid $_UID) =="
  if ! sudo test -f "$PL" || [[ -z "$_UID" ]]; then
    echo "  Skip (no plist or uid)"
    continue
  fi
  sudo -u "$u" launchctl bootout "gui/$_UID" "$PL" 2>/dev/null || true
  sudo -u "$u" launchctl bootstrap "gui/$_UID" "$PL" 2>/dev/null || true
  sudo -u "$u" launchctl enable "gui/$_UID/ai.openclaw.gateway" 2>/dev/null || true
  sudo -u "$u" launchctl kickstart -k "gui/$_UID/ai.openclaw.gateway" 2>/dev/null || true
  sudo -u "$u" -i bash -lc 'openclaw gateway status 2>/dev/null | head -n 20' || echo "  (openclaw not in PATH for $u)"
done
