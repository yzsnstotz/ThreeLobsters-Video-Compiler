#!/usr/bin/env bash
# Step 0: 检查 token 源文件存在（yzliu 上运行，无需 sudo，Cursor 可自动执行）
set -euo pipefail
TLVC_TOKEN_SRC="${TLVC_TOKEN_SRC:-/Users/yzliu/work/tlvc/.secrets/tlvc.token}"
if [[ ! -f "$TLVC_TOKEN_SRC" ]]; then
  echo "MISSING token src: $TLVC_TOKEN_SRC" >&2
  exit 1
fi
echo "OK: token src exists ($TLVC_TOKEN_SRC)"
