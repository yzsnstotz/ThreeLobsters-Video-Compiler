#!/usr/bin/env bash
# TLVC Step2 Telegram setup for one OpenClaw user (ao000|ao001|ao002).
# Run AS that user: sudo -u ao000 bash /Users/yzliu/work/tlvc/scripts/tlvc-step2-telegram-setup.sh ao000
# Or run as yzliu with one arg: script copies token via sudo then runs remainder as that user.
set -e
TARGET_USER="${1:-}"
SKIP_TOKEN_COPY=""
[[ "$1" == "--skip-token-copy" ]] && { SKIP_TOKEN_COPY=1; TARGET_USER="${2:-}"; }
[[ -z "$TARGET_USER" && -z "$SKIP_TOKEN_COPY" ]] && TARGET_USER="${1:-}"
TLVC_REPO="/Users/yzliu/work/tlvc"
TLVC_TOKEN_SOURCE="$TLVC_REPO/.secrets/tlvc.token"
TLVC_API_BASE="${TLVC_API_BASE:-http://127.0.0.1:8789}"
EP="${EP:-ep_0007}"

if [[ -z "$TARGET_USER" ]]; then
  echo "Usage: $0 [--skip-token-copy] <ao000|ao001|ao002>" >&2
  exit 1
fi

# If we're yzliu and target is different user, copy token then re-run as that user (unless --skip-token-copy)
if [[ "$(whoami)" == "yzliu" && "$TARGET_USER" != "yzliu" && -z "$SKIP_TOKEN_COPY" ]]; then
  echo "Copying token to /Users/$TARGET_USER/.secrets/ (requires sudo)..."
  sudo mkdir -p "/Users/$TARGET_USER/.secrets"
  sudo install -m 600 "$TLVC_TOKEN_SOURCE" "/Users/$TARGET_USER/.secrets/tlvc.token"
  SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
  sudo -u "$TARGET_USER" bash -c "HOME=/Users/$TARGET_USER TLVC_API_BASE=$TLVC_API_BASE EP=$EP bash $SCRIPT_PATH $TARGET_USER"
  exit $?
fi

# From here: run as the target user (HOME already set)
HOME="${HOME:-/Users/$TARGET_USER}"
export HOME
TOOLS="$HOME/.openclaw/workspace/tools/tlvc"
OPENCLAW="$HOME/.openclaw"

echo "=== User: $(whoami) HOME=$HOME ==="

# ---- 2.1 Token ----
mkdir -p "$HOME/.secrets"
if [[ -r "$TLVC_TOKEN_SOURCE" ]]; then
  install -m 600 "$TLVC_TOKEN_SOURCE" "$HOME/.secrets/tlvc.token"
fi
if [[ ! -f "$HOME/.secrets/tlvc.token" ]]; then
  echo "WARN: token file missing at $HOME/.secrets/tlvc.token (copy from yzliu if needed)" >&2
else
  ls -la "$HOME/.secrets/tlvc.token"
  echo "tokenHint: present, len=$(wc -c < "$HOME/.secrets/tlvc.token") bytes"
fi

# ---- 2.2 Scripts: ensure tlvc_status exists, check tlvc_deliver ----
mkdir -p "$TOOLS"
if [[ ! -x "$TOOLS/tlvc_status" && -f "$TLVC_REPO/scripts/tlvc_status" ]]; then
  install -m 755 "$TLVC_REPO/scripts/tlvc_status" "$TOOLS/tlvc_status"
fi
test -x "$TOOLS/tlvc_status" || { echo "MISSING tlvc_status"; exit 2; }
test -x "$TOOLS/tlvc_deliver" || { echo "MISSING tlvc_deliver"; exit 2; }

# ---- 2.3 Allowlist ----
if [[ -f "$TOOLS/add-allowlist-entry.mjs" ]]; then
  (cd "$TOOLS" && node add-allowlist-entry.mjs) || true
fi
ALLOWLIST_FILE="$HOME/.openclaw/exec-approvals.json"
if [[ -f "$ALLOWLIST_FILE" ]]; then
  grep -E "tlvc_(deliver|status)" -n "$ALLOWLIST_FILE" || { echo "ALLOWLIST missing tlvc entries"; exit 3; }
else
  echo "ALLOWLIST file not found: $ALLOWLIST_FILE"; exit 3
fi

# ---- 2.4 Local verify ----
export TLVC_API_BASE
export TLVC_TOKEN_FILE="$HOME/.secrets/tlvc.token"
echo "--- tlvc_status --ep $EP ---"
"$TOOLS/tlvc_status" --ep "$EP" || true

# ---- 3. Locate TG_ENTRY_FILE ----
TG_ENTRY_FILE=""
if [[ -f "$OPENCLAW/openclaw.json" ]]; then
  grep -n "telegram" "$OPENCLAW/openclaw.json" | head -n 50
  grep -n -E "workspace/.*(TOOLS|AGENTS|USER|SOUL|IDENTITY)\.md" "$OPENCLAW/openclaw.json" || true
fi
CANDIDATES=()
for f in "$OPENCLAW/workspace/TOOLS.md" "$OPENCLAW/workspace/AGENTS.md" "$OPENCLAW/workspace/USER.md" "$OPENCLAW/workspace/IDENTITY.md" "$OPENCLAW/workspace/SOUL.md"; do
  [[ -f "$f" ]] && CANDIDATES+=("$f")
done
while IFS= read -r -d '' f; do
  CANDIDATES+=("$f")
done < <(find "$OPENCLAW" -maxdepth 4 -type f \( -name "*.md" -o -name "*.txt" \) 2>/dev/null | head -n 30)
for f in "${CANDIDATES[@]}"; do
  if grep -l -E "Telegram|/tlvc_status|/tlvc_deliver|slash|router|command routing|tlvc_status|tlvc_deliver" "$f" 2>/dev/null; then
    TG_ENTRY_FILE="$f"
    break
  fi
done
if [[ -z "$TG_ENTRY_FILE" && -n "${CANDIDATES[0]}" ]]; then
  TG_ENTRY_FILE="${CANDIDATES[0]}"
fi
if [[ -z "$TG_ENTRY_FILE" ]]; then
  TG_ENTRY_FILE="$OPENCLAW/workspace/TOOLS.md"
fi
if [[ ! -f "$TG_ENTRY_FILE" ]]; then
  touch "$TG_ENTRY_FILE"
fi
echo "TG_ENTRY_FILE=$TG_ENTRY_FILE"

# ---- 4. Inject routing block (idempotent) ----
ROUTE_BEGIN="【BEGIN TLVC TELEGRAM ROUTING】"
ROUTE_END="【END TLVC TELEGRAM ROUTING】"
# Ensure block uses /tlvc_status and /tlvc_deliver (prefix-exact), default outDir $HOME/tlvc_artifacts/<ep>
if grep -qF "$ROUTE_BEGIN" "$TG_ENTRY_FILE" 2>/dev/null && grep -qF 'tlvc_artifacts' "$TG_ENTRY_FILE" 2>/dev/null; then
  echo "Routing block already present (idempotent skip)"
else
  TMPF=$(mktemp)
  cat > "$TMPF" << 'ROUTEBLOCK'
【BEGIN TLVC TELEGRAM ROUTING】
Prefix-exact match only (do not match /status or /deliver):
- "/tlvc_status" -> exec ~/.openclaw/workspace/tools/tlvc/tlvc_status --ep <ep>
- "/tlvc_deliver" -> exec ~/.openclaw/workspace/tools/tlvc/tlvc_deliver --ep <ep> --zip <zip> --out <outDir-or-$HOME/tlvc_artifacts/<ep>>
Reply: stdout verbatim; on failure: "FAILED (exit=...)" + last 20 lines of stderr (no token).
【END TLVC TELEGRAM ROUTING】

ROUTEBLOCK
  if grep -qF "$ROUTE_BEGIN" "$TG_ENTRY_FILE" 2>/dev/null; then
    perl -i -0pe "s/\Q$ROUTE_BEGIN\E.*?\Q$ROUTE_END\E\n?//s" "$TG_ENTRY_FILE"
  fi
  cat "$TMPF" "$TG_ENTRY_FILE" > "${TG_ENTRY_FILE}.new" && mv "${TG_ENTRY_FILE}.new" "$TG_ENTRY_FILE"
  rm -f "$TMPF"
  echo "Injected routing block at top of $TG_ENTRY_FILE"
fi
echo "--- First 80 lines of $TG_ENTRY_FILE ---"
head -n 80 "$TG_ENTRY_FILE"
echo "--- BEGIN/END line numbers ---"
grep -n -E "【BEGIN TLVC TELEGRAM ROUTING】|【END TLVC TELEGRAM ROUTING】" "$TG_ENTRY_FILE" || true

# ---- 5. Restart gateway ----
openclaw gateway stop 2>/dev/null || true
openclaw gateway start
openclaw gateway status | head -n 30

echo "=== Setup done for $(whoami). Next: in Telegram send /tlvc_status $EP and expect step2 + artifacts lines. ==="
