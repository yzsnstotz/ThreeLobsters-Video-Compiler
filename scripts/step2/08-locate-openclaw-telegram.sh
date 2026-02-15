#!/usr/bin/env bash
# B0: Locate OpenClaw install and Telegram handler source per user.
# Run on yzliu terminal (sudo for ao001/ao002).
set -e
for u in ao000 ao001 ao002; do
  echo "========== $u =========="
  sudo -u "$u" -i bash -lc 'openclaw gateway status 2>/dev/null | sed -n "1,120p" || true; echo "--- candidates ---"; ls -la "$HOME/openclaw/openclaw/dist/index.js" 2>/dev/null || true; ls -la "$HOME/openclaw/openclaw/dist" 2>/dev/null | head -n 20 || true; echo "--- grep telegram/sendMessage (src) ---"; grep -RIn "sendMessage\|handleMessage\|processUpdate\|telegram" "$HOME/openclaw" --include="*.ts" --include="*.js" 2>/dev/null | head -n 60 || true; echo "--- grep exec allowlist ---"; grep -RIn "exec.*allowlist\|allowlisted\|runScript" "$HOME/openclaw" --include="*.ts" --include="*.js" 2>/dev/null | head -n 30 || true'
done
