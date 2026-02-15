# 交付清单：Telegram 纯程序化回执（硬路由）

## 0) 结论与目标（已写在 TASK-Telegram-Hard-Route.md）

- **现象**：ao000 有 stdout 但被 LLM 补话；ao001 被 LLM 接管；ao002 被内置 session/status 抢占。
- **目标**：/tlvc_status 与 /tlvc_deliver 硬路由 + 立即返回，只回传工具 stdout，绝不进入 LLM。

---

## 1) 定位每用户实际处理 Telegram 输入的文件

**你执行（会提示 sudo 密码）：**

```bash
bash /Users/yzliu/work/tlvc/scripts/step2/01-locate-telegram-entry.sh
```

**交付**：三段输出（ao000 / ao001 / ao002），每段包含：
- `HOME`、`OPENCLAW`、gateway status 前 25 行
- `ls -la $HOME/.openclaw` 前 80 行
- `find ... *telegram*|*agent*|*prompt*|*instructions*|*tools*` 前 120 行

→ 从输出中确认每用户 **实际存在的 telegram/agent/prompt/instructions 文件列表**，并记下最可能的 **TG_ENTRY_FILE** 路径。

---

## 2) 哨兵验证：入口文件是否被加载

**2.1 插入哨兵（每用户一行，在入口文件顶部）**

- ao000：`# ROUTE_SENTINEL_TLVC ao000`
- ao001：`# ROUTE_SENTINEL_TLVC ao001`
- ao002：`# ROUTE_SENTINEL_TLVC ao002`

**你执行：**

```bash
bash /Users/yzliu/work/tlvc/scripts/step2/02-insert-sentinel-and-check-log.sh
```

（脚本默认入口为 `~/.openclaw/workspace/TOOLS.md`；若 1) 得到其他路径，需改脚本中 `ENTRY=` 或按用户传参。）

**2.2 看 gateway 日志是否加载该文件**

脚本内已含：重启 gateway + `tail -n 60` gateway.log。若日志里**完全看不到**入口文件内容被解析的痕迹，说明 Telegram agent 不是从该文件读的，需在 1) 结果上继续扩大搜索（例如 openclaw.json 里引用的其它路径）。

---

## 3) 彻底短路 LLM：Telegram 层 hard-return

- **说明与伪代码**：见 **DIFF-Hard-Return-Telegram.md**。
- **代码位置**：在 **OpenClaw** 包内（非 tlvc 仓库），如各用户 `~/.openclaw/openclaw/` 或安装的 openclaw 包；在「收到 Telegram 消息 → 调用 LLM 之前」的 handler 里加前缀匹配 + exec + sendMessage + **return**。
- **diff 要点**：在调用 `handleWithLLM` / `agent.respond` 之前插入 `/tlvc_status`、`/tlvc_deliver` 分支，执行 allowlisted 脚本后 `sendMessage(stdout)` 并 **return**，不再进入 LLM。

若 OpenClaw 为闭源/不可改，则只能依赖文档约束 + 避免命令冲突（见 5）。

---

## 4) ao001 “TLVC_TOKEN_FILE is not set” 与版本一致

**你执行：**

```bash
bash /Users/yzliu/work/tlvc/scripts/step2/04-verify-tlvc-status-per-user.sh
```

**预期**：
- “direct run (no env)” 三用户都**不**报 `TLVC_TOKEN_FILE is not set`。
- 三用户 `tlvc_status`（及 `tlvc_deliver`）的 **shasum 一致**（说明同步的是同一份脚本）。

若 ao001 仍报错：对该用户重新跑 **02-sync-tools.sh**，再跑 04 复验。

---

## 5) ao002 “Still no session…”：命令冲突

**你执行：**

```bash
bash /Users/yzliu/work/tlvc/scripts/step2/05-grep-tlvc-conflict.sh
```

若发现 `/tlvc_status` 在 core/session 等逻辑里被占用，则：
- 全量改为 **/tlvc2_status**、**/tlvc2_deliver**（路由块、文档、DIFF 伪代码、验收全部替换）。

---

## 6) 端到端验收

- **期望行为与失败分支**：见 **06-e2e-acceptance.md**。
- **你必须实际在 Telegram 发**：
  1. `/tlvc_status ep_0007` → 仅两行或脚本 stdout，无 “What’s next?” 等。
  2. `/tlvc_deliver ep_0007 /Users/yzliu/work/tlvc/uploads/ep_0007.zip` → 含 top1: 与 outDir:/artifacts_dir:，无解释性文字。

**交付**：三用户都通过上述两条的验收（截图或粘贴回复文本即可）。

---

## 清单汇总（必须全部完成）

| # | 项 | 状态 |
|---|----|------|
| 1 | 每用户真正 TG 入口文件路径（经 01 + 02 验证） | 待你跑 01/02 后填写 |
| 2 | Telegram provider 代码层 hard-return（见 DIFF 文档；若可改 OpenClaw 则落实 diff） | 见 DIFF-Hard-Return-Telegram.md |
| 3 | ao000/ao001/ao002 tlvc_status、tlvc_deliver 版本一致（shasum）+ 无 env 直接跑通过 | 跑 04 核验 |
| 4 | Telegram 验收：三用户只回执、无 LLM 话术 | 按 06 发两条消息并对照 |
