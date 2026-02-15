# TLVC Telegram 投递验收

## 前提

- tlvc-api 已启动（8789），token 已配置。
- ao000/ao001/ao002 的 TG 入口已注入路由块，命令为 **/tlvc_status**、**/tlvc_deliver**。

## 验收步骤

1. **状态查询**  
   在 Telegram 对任一本 bot 发送：  
   `/tlvc_status ep_0007`  
   期望：回复含 `step2: done` 或 `step2: running`，以及 `artifacts: sanitized=... topk=... lint=...`。

2. **投递**  
   发送：  
   `/tlvc_deliver ep_0007 /Users/yzliu/work/tlvc/uploads/ep_0007.zip`  
   期望：回复含 `top1:` 行及 `outDir:` 或 `artifacts_dir:` 行；无 token 泄露。

3. **再次查状态**  
   发送：  
   `/tlvc_status ep_0007`  
   期望：`step2: done`，artifacts 三件齐全。

## 失败判定

- 回复出现 “需要更多上下文” 或 “What’s ep_0007?” 等 LLM 闲聊 → 路由未生效，检查 TG_ENTRY_FILE 与 gateway 重启。
- 回复含完整 token → 不合格，检查脚本/日志脱敏。
