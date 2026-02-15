# Step2 Telegram 端到端验收（三用户必须都过）

## 期望行为

### 1. `/tlvc_status ep_0007`

- **期望**：机器人回复**仅**脚本 stdout（两行或原样），例如：
  ```
  step2: done
  artifacts: sanitized=true topk=true lint=true
  ```
- **禁止**：出现 “What’s next?”、“让我检查一下…”、“我来帮你…” 等任何 LLM 补话。

### 2. `/tlvc_deliver ep_0007 /Users/yzliu/work/tlvc/uploads/ep_0007.zip`

- **期望**：回复包含 `top1:` 与 `outDir:` 或 `artifacts_dir:`，可为脚本原样 stdout。
- **禁止**：任何解释性、推销性文字。

## 失败分支（对照）

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| 有 step2 行但后面还有 “What’s next?” | 未 hard-return，send 后仍调用了 LLM | 在 Telegram handler 中 send 后立即 return，见 DIFF-Hard-Return-Telegram.md |
| “我来帮你配置 token” | 路由未生效或 exec 失败后被 LLM 接管 | 确认入口文件被加载（哨兵）、exec 路径与 env 正确、04 脚本三用户 direct run 均通过 |
| “Still no session ep_0007 found” | 内置 /status 或 session 命令抢占 | 用 05-grep 查冲突；必要时改为 /tlvc2_status、/tlvc2_deliver 并全量替换 |
| “TLVC_TOKEN_FILE is not set” | 执行的脚本无 fallback 或未同步 | 跑 04-verify-tlvc-status-per-user.sh，对 ao001 等缺 env 用户重新 02-sync-tools.sh |

## 验收步骤（D：你本机在 Telegram 执行，三 bot 都必须一致）

1. 对 **ao000 / ao001 / ao002** 的 Telegram bot **各发**：
   - `/tlvc_status ep_0007`  
   - **期望**：只返回脚本 stdout 两行（step2 / artifacts），不得再出现任何解释性文字。
2. 再**各发**：
   - `/tlvc_deliver ep_0007 /Users/yzliu/work/tlvc/uploads/ep_0007.zip`  
   - **期望**：只返回脚本 stdout（含 top1/outDir 或 artifacts_dir），不得再出现“我来帮你配置 token / what's next”。
3. 确认三用户回复均符合“期望行为”，无“禁止”内容。
4. （可选）截图或复制回复文本留存。
