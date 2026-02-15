#!/usr/bin/env bash
# Replace old TLVC routing block with new (/tlvc_status, /tlvc_deliver) in TG_ENTRY_FILE.
# Usage: MUST run with target user's HOME so file is in that user's dir:
#   sudo -u ao000 env HOME=/Users/ao000 bash scripts/update-telegram-routing-block.sh [path]
# If path omitted: uses $HOME/.openclaw/workspace/TOOLS.md
set -e
FILE="${1:-$HOME/.openclaw/workspace/TOOLS.md}"
if [[ ! -f "$FILE" ]]; then
  echo "File not found: $FILE (HOME=$HOME)" >&2
  exit 1
fi
# Ensure we do not write to another user's dir (e.g. when invoked via sudo without HOME set)
case "$FILE" in
  "$HOME"/*) ;;
  *) echo "Refusing to write outside HOME ($HOME): $FILE" >&2; exit 1 ;;
esac
ROUTE_BEGIN="【BEGIN TLVC TELEGRAM ROUTING】"
ROUTE_END="【END TLVC TELEGRAM ROUTING】"
NEW_BLOCK='【BEGIN TLVC TELEGRAM ROUTING】
Prefix-exact match only (do not match /status or /deliver):
- "/tlvc_status" -> exec ~/.openclaw/workspace/tools/tlvc/tlvc_status --ep <ep>
- "/tlvc_deliver" -> exec ~/.openclaw/workspace/tools/tlvc/tlvc_deliver --ep <ep> --zip <zip> --out <outDir-or-$HOME/tlvc_artifacts/<ep>>
Reply: stdout verbatim; on failure: "FAILED (exit=...)" + last 20 lines of stderr (no token).
【END TLVC TELEGRAM ROUTING】
'
if grep -qF '"/tlvc_status"' "$FILE" 2>/dev/null && grep -qF 'tlvc_artifacts' "$FILE" 2>/dev/null; then
  echo "Already up to date: $FILE"
  exit 0
fi
TMPF=$(mktemp)
trap 'rm -f "$TMPF"' EXIT
if grep -qF "$ROUTE_BEGIN" "$FILE" 2>/dev/null; then
  perl -0pe "s/\Q$ROUTE_BEGIN\E.*?\Q$ROUTE_END\E\n?//s" "$FILE" > "$TMPF" && mv "$TMPF" "$FILE"
fi
printf '%s\n' "$NEW_BLOCK" | cat - "$FILE" > "${FILE}.new" && mv "${FILE}.new" "$FILE"
echo "Updated routing block in $FILE. Restart gateway: openclaw gateway stop && openclaw gateway start"
