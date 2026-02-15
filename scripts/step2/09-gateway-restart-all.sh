#!/usr/bin/env bash
# C) Restart gateway for ao000/ao001/ao002 and show status + log tail.
# Run on yzliu terminal. Ensure A (PATH fix) is done for ao001/ao002 first.
set -e
for u in ao000 ao001 ao002; do
  echo "========== $u =========="
  sudo -u "$u" -i bash -lc 'openclaw gateway stop 2>/dev/null || true; openclaw gateway start; sleep 2; openclaw gateway status | head -n 40 || true; echo "--- log tail ---"; tail -n 80 "$HOME/.openclaw/logs/gateway.log" 2>/dev/null || true'
done
