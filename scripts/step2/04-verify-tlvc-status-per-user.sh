#!/usr/bin/env bash
# Step 4: 核验每用户 tlvc_status 版本、fallback 逻辑、无 env 直接跑
set -e
for u in ao000 ao001 ao002; do
  echo "========== $u =========="
  sudo -u "$u" -i bash -lc 'set -e; echo "which tlvc_status:"; ls -la "$HOME/.openclaw/workspace/tools/tlvc/tlvc_status" "$HOME/.openclaw/workspace/tools/tlvc/tlvc_status.ts" 2>/dev/null || true; echo "hashes:"; shasum -a 256 "$HOME/.openclaw/workspace/tools/tlvc/tlvc_status" "$HOME/.openclaw/workspace/tools/tlvc/tlvc_deliver" 2>/dev/null || true; echo "grep token fallback:"; grep -n "TLVC_TOKEN_FILE\|homedir\|\.secrets" "$HOME/.openclaw/workspace/tools/tlvc/tlvc_status" 2>/dev/null | head -20 || true; echo "direct run (no env):"; "$HOME/.openclaw/workspace/tools/tlvc/tlvc_status" --ep ep_0007 || true'
done
