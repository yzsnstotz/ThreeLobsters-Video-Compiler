#!/usr/bin/env bash
# Step 6: 故障抓取 — 若 Telegram 仍报 TLVC_TOKEN_FILE is not set 时执行。
# 打印每个用户 gateway 的 launchctl 环境及 openclaw 进程。
set -e
for u in ao000 ao001 ao002; do
  echo "== env debug for $u =="
  sudo -u "$u" -i bash -lc '_UID="$(id -u)"; launchctl print "gui/$_UID/ai.openclaw.gateway" 2>/dev/null | sed -n "1,140p" | grep -E "EnvironmentVariables|TLVC_" -n || true; ps aux | grep -i openclaw | grep -v grep || true'
done
