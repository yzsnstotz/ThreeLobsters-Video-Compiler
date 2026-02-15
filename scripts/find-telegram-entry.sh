#!/usr/bin/env bash
# Find the real Telegram instruction/prompt entry file for one OpenClaw user.
# Usage: run as that user with correct HOME, or: sudo -u ao000 env HOME=/Users/ao000 bash find-telegram-entry.sh
# Optional arg: username (ao000|ao001|ao002) to set HOME if not already set.
set -e
U="${1:-}"
if [[ -n "$U" ]]; then
  export HOME="/Users/$U"
fi
OPENCLAW="$HOME/.openclaw"
echo "=== User: $(whoami) HOME=$HOME ==="

TG_ENTRY_FILE=""
# Priority 1: ~/.openclaw/telegram/**
if [[ -d "$OPENCLAW/telegram" ]]; then
  while IFS= read -r -d '' f; do
    if grep -qiE "telegram|slash|command|router|instructions|system_prompt|customCommands" "$f" 2>/dev/null; then
      TG_ENTRY_FILE="$f"
      break
    fi
  done < <(find "$OPENCLAW/telegram" -maxdepth 5 -type f \( -name "*.md" -o -name "*.txt" \) 2>/dev/null)
fi
# Priority 2: ~/.openclaw/agents/**
if [[ -z "$TG_ENTRY_FILE" && -d "$OPENCLAW/agents" ]]; then
  while IFS= read -r -d '' f; do
    if grep -qiE "telegram|slash|command|router|instructions|system_prompt|customCommands" "$f" 2>/dev/null; then
      TG_ENTRY_FILE="$f"
      break
    fi
  done < <(find "$OPENCLAW/agents" -maxdepth 5 -type f \( -name "*.md" -o -name "*.txt" \) 2>/dev/null)
fi
# Priority 3: openclaw.json telegram channel entry
if [[ -z "$TG_ENTRY_FILE" && -f "$OPENCLAW/openclaw.json" ]]; then
  grep -n "telegram\|prompt\|instructions\|entry\|TOOLS\|AGENTS\|USER\|SOUL\|IDENTITY" "$OPENCLAW/openclaw.json" | head -n 80
  # Try to extract path from json (simple grep)
  for ref in TOOLS.md AGENTS.md USER.md SOUL.md IDENTITY.md; do
    if grep -q "$ref" "$OPENCLAW/openclaw.json" 2>/dev/null; then
      for base in "$OPENCLAW/workspace" "$OPENCLAW"; do
        [[ -f "$base/$ref" ]] && TG_ENTRY_FILE="$base/$ref" && break
      done
      [[ -n "$TG_ENTRY_FILE" ]] && break
    fi
  done
fi
# Priority 4: workspace/** with keyword hits
if [[ -z "$TG_ENTRY_FILE" && -d "$OPENCLAW/workspace" ]]; then
  while IFS= read -r -d '' f; do
    if grep -qiE "telegram|slash|command|router|instructions|system_prompt|customCommands|tlvc_status|tlvc_deliver" "$f" 2>/dev/null; then
      TG_ENTRY_FILE="$f"
      break
    fi
  done < <(find "$OPENCLAW/workspace" -maxdepth 4 -type f \( -name "*.md" -o -name "*.txt" \) 2>/dev/null | head -n 50)
fi
# Fallback: workspace/TOOLS.md or AGENTS.md
if [[ -z "$TG_ENTRY_FILE" ]]; then
  for f in "$OPENCLAW/workspace/TOOLS.md" "$OPENCLAW/workspace/AGENTS.md" "$OPENCLAW/workspace/USER.md"; do
    [[ -f "$f" ]] && TG_ENTRY_FILE="$f" && break
  done
fi

if [[ -z "$TG_ENTRY_FILE" ]]; then
  echo "TG_ENTRY_FILE=(not found)"
  exit 1
fi
echo "TG_ENTRY_FILE=$TG_ENTRY_FILE"
echo "--- First 60 lines of $TG_ENTRY_FILE ---"
head -n 60 "$TG_ENTRY_FILE"
