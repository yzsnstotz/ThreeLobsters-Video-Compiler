#!/usr/bin/env bash
# Step 5: 确认 /tlvc_status 未被 core/session 占用，搜索冲突引用
set -e
for u in ao000 ao001 ao002; do
  echo "========== $u =========="
  sudo -u "$u" -i bash -lc '
    grep -RIn "/tlvc_status" "$HOME/.openclaw" 2>/dev/null | head -n 40 || true
    echo "---"
    grep -RIn "tlvc_status" "$HOME/.openclaw" 2>/dev/null | head -n 60 || true
  '
done
