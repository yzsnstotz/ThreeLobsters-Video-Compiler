#!/usr/bin/env bash
# TLVC Step2 Telegram 一键修复：按顺序调用分步脚本（不在此脚本内运行 openclaw；仅在各用户 sudo -u 下由子脚本执行）
# 在 Mac mini 上以 yzliu 身份执行。
set -euo pipefail
if [[ "$(id -u)" -eq 0 ]]; then
  echo "Refuse to run as root" >&2
  exit 1
fi
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/step2" && pwd)"
echo "== 00 check token src =="
bash "$DIR/00-check-token-src.sh"
echo "== 01 token copy =="
bash "$DIR/01-token-copy.sh"
echo "== 02 sync tools =="
bash "$DIR/02-sync-tools.sh"
echo "== 03 gateway plist inject =="
bash "$DIR/03-gateway-plist-inject.sh"
echo "== 04 gateway restart =="
bash "$DIR/04-gateway-restart.sh"
echo "== 05 validate =="
bash "$DIR/05-validate.sh"
echo "========== Done. Telegram: /tlvc_status ep_0007 and /tlvc_deliver ep_0007 /Users/yzliu/work/tlvc/uploads/ep_0007.zip =========="
