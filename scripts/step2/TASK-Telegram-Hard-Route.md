# Task: Telegram 纯程序化回执（硬路由 + 短路返回）

## 0) 结论与目标（先定死，避免走偏）

### 现象解释

| 用户 | 现象 | 根因推断 |
|------|------|----------|
| ao000 | 返回里夹了 “What’s next?” | 脚本 stdout 已返回，但**没有短路 return**，后续仍把 message 交给 LLM 补话。 |
| ao001 | 完全进入“我来帮你配置 token” | 路由未生效或 exec 失败后被 LLM 接管；或工具未跑到 / 执行的并非带 fallback 的脚本。 |
| ao002 | “Still no session ep_0007 found” | OpenClaw **内置 /status 或 session/status** 先匹配，或路由未被加载；当前指令名被核心命令体系抢占。 |

### 目标（必须达成）

- **/tlvc_status** 与 **/tlvc_deliver** 必须是 **硬路由 + 立即返回**：
  - 只回传工具 **stdout**（失败时 stderr tail），
  - **绝不**进入 LLM，
  - **绝不**追加 “What’s next?”、“让我检查一下…” 等解释性文字。
- 实现方式：在 **Telegram message handler 层** 做前缀匹配后 **直接 sendMessage(stdout) 并 return**（或 `handled=true`），禁止在 send 之后再调用 `handleWithLLM()` / `agent.respond()` / `continueConversation()`。

---

## 交付清单（必须）

1. 每用户**真正 TG 入口文件路径**（经 01-locate-telegram-entry.sh + 02 哨兵验证）→ 见 **DELIVERY-Checklist-Hard-Route.md**。
2. **Telegram provider 代码层 hard-return**（伪代码与改点见 **DIFF-Hard-Return-Telegram.md**；实现需在 OpenClaw 包内）。
3. ao000/ao001/ao002 的 **tlvc_status / tlvc_deliver 版本一致**（跑 **04-verify-tlvc-status-per-user.sh** 核验 shasum + 无 env 直接跑）。
4. **Telegram 验收**：三用户都只回执、无 LLM 话术 → 见 **06-e2e-acceptance.md**，并按 DELIVERY-Checklist 发两条消息验收。
