#!/usr/bin/env bash
# Step A: Make openclaw findable for ao001/ao002 (PATH in .zprofile + .bash_profile).
# Run on yzliu terminal (will prompt sudo password).
set -e
for u in ao001 ao002; do
  echo "========== $u =========="
  sudo -u "$u" -i bash -lc 'set -e; H="${HOME:-$(eval echo ~$(whoami))}"; BIN=""; if [ -x "$H/.local/bin/openclaw" ]; then BIN="$H/.local/bin"; fi; if [ -z "$BIN" ] && [ -x "/usr/local/bin/openclaw" ]; then BIN="/usr/local/bin"; fi; if [ -z "$BIN" ] && [ -x "/opt/homebrew/bin/openclaw" ]; then BIN="/opt/homebrew/bin"; fi; echo "BIN=$BIN"; [ -n "$BIN" ] || { echo "ERROR: openclaw binary not found for this user"; exit 2; }; for f in "$H/.zprofile" "$H/.bash_profile"; do touch "$f"; grep -q "OPENCLAW_BIN" "$f" || { printf "\n# OPENCLAW_BIN\nexport PATH=\"%s:\$PATH\"\n" "$BIN" >> "$f"; }; done; echo "command -v openclaw:"; command -v openclaw; openclaw --version'
done
echo "Done. Verify: sudo -u ao001 -i bash -lc \"command -v openclaw; openclaw --version\" (same for ao002)."
