# TLVC Step2 Telegram 交付摘要

## 命令（精确匹配）

- **`/tlvc_status <epId>`** — 查 Step2 状态与 artifacts，直接 exec `tlvc_status --ep <epId>`，回复 stdout。
- **`/tlvc_deliver <epId> <zipPath> [outDir]`** — 投递 zip，直接 exec `tlvc_deliver`，回复 stdout + `artifacts_dir:`。

不再使用 `/status`、`/deliver`。

## 三用户一致

ao000、ao001、ao002 的 TG 入口文件（TG_ENTRY_FILE）中路由块一致，均使用上述命令名。更新路由块后每个用户需重启 gateway：

```bash
openclaw gateway stop && openclaw gateway start
```

## 验收命令示例

| 命令 | 预期 |
|------|------|
| `/tlvc_status ep_0007` | step2: done（或 running），artifacts: sanitized=... topk=... lint=... |
| `/tlvc_deliver ep_0007 /Users/yzliu/work/tlvc/uploads/ep_0007.zip` | 含 top1:、outDir:/artifacts_dir: 的 stdout |

详见 `TELEGRAM_COMMANDS_SPEC.md`、`ACCEPTANCE_DELIVER_TELEGRAM.md`、`TLVC-Step2-Telegram-Delivery-Report.md`。
