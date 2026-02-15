#!/usr/bin/env bash
# Step 1: 定位每个用户实际处理 Telegram 输入的文件（telegram/agent/prompt/instructions）
# 在 yzliu 终端执行，会提示 sudo 密码。
set -e
for u in ao000 ao001 ao002; do
  echo "========== $u =========="
  sudo -u "$u" -i bash -lc 'echo "HOME=$HOME"; echo "OPENCLAW=$(command -v openclaw || echo MISSING)"; echo "Gateway:"; openclaw gateway status 2>/dev/null | head -n 25 || true; echo ""; echo "Find telegram entry candidates:"; ls -la "$HOME/.openclaw" 2>/dev/null | sed -n "1,80p"; find "$HOME/.openclaw" -maxdepth 4 -type f \( -iname "*telegram*" -o -iname "*agent*" -o -iname "*prompt*" -o -iname "*instructions*" -o -iname "*tools*" \) 2>/dev/null | sed -n "1,120p"'
done
