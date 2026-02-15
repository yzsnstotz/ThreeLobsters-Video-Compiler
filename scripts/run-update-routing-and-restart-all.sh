#!/usr/bin/env bash
# Update TLVC routing block and restart gateway for ao000, ao001, ao002.
# Run from Mac mini as yzliu (will prompt for sudo password).
# Fixes: HOME set per user so we write to their .openclaw; use login shell for openclaw in PATH.
set -e
REPO_SCRIPTS="/Users/yzliu/work/tlvc/scripts"
for u in ao000 ao001 ao002; do
  echo "========== $u =========="
  sudo -u "$u" env "HOME=/Users/$u" bash "$REPO_SCRIPTS/update-telegram-routing-block.sh"
  sudo -u "$u" -i bash -c 'openclaw gateway stop 2>/dev/null; openclaw gateway start'
done
echo "========== Done. Verify with: sudo -u ao000 openclaw gateway status =========="
