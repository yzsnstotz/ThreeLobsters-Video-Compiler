#!/usr/bin/env bash
# Step 2: 在每用户 TG 入口文件顶部插入哨兵行，重启 gateway，tail 日志验证是否加载
# 用法：先跑 01-locate-telegram-entry.sh 得到每用户 TG_ENTRY_FILE，再设置环境变量或改此脚本中的路径。
# 若未设置，默认使用 workspace/TOOLS.md。
set -e
for u in ao000 ao001 ao002; do
  echo "========== $u =========="
  ENTRY="/Users/$u/.openclaw/workspace/TOOLS.md"
  SENTINEL="# ROUTE_SENTINEL_TLVC $u"
  if ! sudo test -f "$ENTRY"; then
    echo "  MISSING $ENTRY (create or set ENTRY per user)"
    continue
  fi
  if sudo grep -q "ROUTE_SENTINEL_TLVC $u" "$ENTRY" 2>/dev/null; then
    echo "  Sentinel already present"
  else
    (echo "$SENTINEL"; sudo cat "$ENTRY") | sudo -u "$u" tee "$ENTRY.new" >/dev/null
    sudo -u "$u" mv "$ENTRY.new" "$ENTRY"
    echo "  Inserted: $SENTINEL"
  fi
  echo "  Restart gateway + tail log:"
  sudo -u "$u" -i bash -lc '
    openclaw gateway stop 2>/dev/null || true
    openclaw gateway start
    sleep 2
    tail -n 60 "$HOME/.openclaw/logs/gateway.log" 2>/dev/null || true
  ' || true
done
