#!/usr/bin/env bash
# One-click Step2 acceptance: two fixtures, deterministic output to build/acceptance_logs/step2_accept_<ts>.
# Exit 0 = PASS, 1 = FAIL. Prints PASS/FAIL and log dir.

set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

TS=$(date +%Y%m%d-%H%M%S)
LOG_DIR="build/acceptance_logs/step2_accept_${TS}"
mkdir -p "$LOG_DIR"

PASS=0
FAIL=0

run_fixture() {
  local name="$1"
  local input="$2"
  local ep="$3"
  local expect_mode="$4"
  local subdir="${LOG_DIR}/${name}"
  mkdir -p "$subdir"

  echo "--- Fixture: $name (expect segment_mode=$expect_mode) ---"
  pnpm tlvc doctor step2 --ep "$ep" --in "$input" 2>&1 | tee "$subdir/doctor.txt"
  pnpm tlvc preprocess "$input" --ep "$ep" --out "$subdir/out" --k 3 2>&1 | tee "$subdir/step2.txt" || true

  local segments_file="$subdir/out/step2_preprocess/segments.topk.json"
  local lint_file="$subdir/out/step2_preprocess/lint_report.step2.json"

  if [[ ! -f "$segments_file" ]]; then
    echo "FAIL: $name - segments.topk.json not found"
    echo "FAIL: $name - segments.topk.json not found" >> "$subdir/summary.txt"
    ((FAIL++)) || true
    return
  fi

  local seg_count lint_ok mode no_seg
  seg_count=$(node -e "const j=require('fs').readFileSync('$segments_file','utf8'); const o=JSON.parse(j); console.log(o.segments?.length ?? -1)")
  lint_ok=$(node -e "const j=require('fs').readFileSync('$lint_file','utf8'); const o=JSON.parse(j); console.log(o.ok ? '1' : '0')" 2>/dev/null || echo "0")
  mode=$(node -e "const j=require('fs').readFileSync('$segments_file','utf8'); const o=JSON.parse(j); console.log(o.meta?.segment_mode ?? '')" 2>/dev/null || echo "")
  no_seg=$(node -e "const j=require('fs').readFileSync('$lint_file','utf8'); const o=JSON.parse(j); const e=(o.errors||[]).find(x=>x.code==='NO_SEGMENTS'); console.log(e ? '1' : '0')" 2>/dev/null || echo "0")

  {
    echo "segment_count: $seg_count"
    echo "lint_ok: $lint_ok"
    echo "segment_mode: $mode"
    echo "NO_SEGMENTS error: $no_seg"
    echo "--- top1 ---"
    node -e "
    const j=require('fs').readFileSync('$segments_file','utf8');
    const o=JSON.parse(j);
    const s=o.segments?.[0];
    if(s){ console.log('segment_id:', s.segment_id); console.log('msg_count:', (s.message_ids||[]).length); console.log('roles:', JSON.stringify(s.roles||{})); console.log('reasons top3:', (s.reasons||[]).slice(0,3).map(r=>r.rule_id+': '+r.detail).join(' | ')); }
    else console.log('(no top1)');
    "
    echo "--- lint summary ---"
    node -e "
    const j=require('fs').readFileSync('$lint_file','utf8');
    const o=JSON.parse(j);
    console.log(JSON.stringify(o.summary||{}, null, 2));
    "
  } | tee "$subdir/summary.txt"

  if [[ "$seg_count" -lt 1 ]]; then
    echo "FAIL: $name - segments empty"
    ((FAIL++)) || true
    return
  fi
  if [[ "$no_seg" == "1" ]]; then
    echo "FAIL: $name - NO_SEGMENTS in lint"
    ((FAIL++)) || true
    return
  fi
  if [[ -n "$expect_mode" && "$mode" != "$expect_mode" ]]; then
    echo "FAIL: $name - expected segment_mode=$expect_mode got $mode"
    ((FAIL++)) || true
    return
  fi
  echo "PASS: $name"
  ((PASS++)) || true
}

# Fixture1: inbox/ep_0007 (must yield non-empty segments; often fallback if no error triggers)
run_fixture "fixture1_inbox_ep0007" "inbox/ep_0007" "ep_0007" ""

# Fixture2: minimal HTML with 401 trigger -> expect error segmentation
run_fixture "fixture2_error_trigger" "scripts/fixtures/step2_error_trigger.html" "ep_9999" "error"

echo ""
echo "=============================================="
if [[ $FAIL -gt 0 ]]; then
  echo "RESULT: FAIL (pass=$PASS fail=$FAIL)"
  echo "Log dir: $LOG_DIR"
  exit 1
fi
echo "RESULT: PASS (pass=$PASS fail=$FAIL)"
echo "Log dir: $LOG_DIR"
exit 0
