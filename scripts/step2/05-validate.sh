#!/usr/bin/env bash
# Step 5: 验证 token 属主 + tlvc_status 无需 env 可跑（yzliu 运行；stat 用 sudo 读其他用户文件）
set -euo pipefail
FAIL=0
for u in ao000 ao001 ao002; do
  OWNER=$(sudo stat -f "%Su %N" "/Users/$u/.secrets/tlvc.token" 2>/dev/null || echo "MISSING")
  if [[ "$OWNER" != "$u"* ]]; then
    echo "FAIL $u: token expected '$u ...', got: $OWNER"
    ((FAIL++)) || true
  else
    echo "PASS $u: token $OWNER"
  fi
  OUT=$(sudo -u "$u" -i bash -lc '~/.openclaw/workspace/tools/tlvc/tlvc_status --ep ep_0007 2>&1' || true)
  if echo "$OUT" | grep -q "TLVC_TOKEN_FILE is not set"; then
    echo "FAIL $u: tlvc_status says TLVC_TOKEN_FILE is not set"
    ((FAIL++)) || true
  elif echo "$OUT" | grep -qE "step2:|artifacts:"; then
    echo "PASS $u: tlvc_status ok"
  else
    echo "WARN $u: tlvc_status unexpected"
    ((FAIL++)) || true
  fi
done
echo "Validation: FAIL=$FAIL"
[[ "$FAIL" -eq 0 ]] || exit 1
