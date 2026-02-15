# TLVC Telegram 工具与路由（TOOLS）

本文件可与各 OpenClaw 用户 `workspace/TOOLS.md` 或实际被加载的 TG 入口文件同步，保证三用户（ao000/ao001/ao002）一致。

## TLVC Telegram 指令（精确匹配，不走 LLM）

1. **`/tlvc_status <epId>`**  
   - 执行：`~/.openclaw/workspace/tools/tlvc/tlvc_status --ep <epId>`  
   - 回复：脚本 stdout（含 step2、artifacts 行）。

2. **`/tlvc_deliver <epId> <zipPath> [outDir]`**  
   - 执行：`~/.openclaw/workspace/tools/tlvc/tlvc_deliver --ep <epId> --zip <zipPath> --out <outDir>`  
   - 回复：stdout + 一行 `artifacts_dir: <outDir>`；失败时 `FAILED (exit=<code>):` + stderr 最后 20 行，且不包含 token。

**注意**：仅使用 `/tlvc_status`、`/tlvc_deliver`，不使用 `/status`、`/deliver`。

## 验收示例

- `/tlvc_status ep_0007` → 期望 `step2: done`（或 running）及 `artifacts: sanitized=... topk=... lint=...`。
- `/tlvc_deliver ep_0007 /Users/yzliu/work/tlvc/uploads/ep_0007.zip` → 期望含 `top1:`、`outDir:` 或 `artifacts_dir:`。

更新路由块后需重启 gateway：`openclaw gateway stop && openclaw gateway start`。
