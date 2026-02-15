# Telegram 指令规格（TLVC Step2）

OpenClaw Telegram bot（ao000/ao001/ao002）对以下指令做**精确匹配**，直接执行 allowlisted 脚本，不走 LLM。

## 命令列表

| 命令 | 说明 |
|------|------|
| `/tlvc_status <epId>` | 查询 episode Step2 状态与 artifacts；执行 `tlvc_status --ep <epId>`，回复 stdout。 |
| `/tlvc_deliver <epId> <zipPath> [outDir]` | 投递 zip 到 episode；执行 `tlvc_deliver --ep <epId> --zip <zipPath> --out <outDir>`，回复 stdout + `artifacts_dir:`。 |

- **epId**：如 `ep_0007`，须匹配 `^ep_[0-9]{4}$`。
- **zipPath**：服务端绝对路径，如 `/Users/yzliu/work/tlvc/uploads/ep_0007.zip`。
- **outDir**：可选，默认由脚本/API 决定。

## 验收示例

- `/tlvc_status ep_0007` → 期望回复含 `step2: done`（或 running）及 `artifacts: sanitized=... topk=... lint=...`。
- `/tlvc_deliver ep_0007 /Users/yzliu/work/tlvc/uploads/ep_0007.zip` → 期望回复含 `top1:`、`outDir:` 或 `artifacts_dir:`。

**注意**：不再使用 `/status`、`/deliver`，仅使用 `/tlvc_status`、`/tlvc_deliver`。
