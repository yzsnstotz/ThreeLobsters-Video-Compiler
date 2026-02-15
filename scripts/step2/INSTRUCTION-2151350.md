# Cursor 指令 2151350 — 执行顺序（必须按顺序）

在 **yzliu 终端**依次执行以下步骤。

---

## A) 让 ao001/ao002 能找到 openclaw（PATH 修复 + 版本核验）

**目标**：`sudo -u ao001 -i bash -lc 'command -v openclaw; openclaw --version'` 必须成功（ao002 同理）。

1. **可选诊断**（查看 SHELL/PATH 与 openclaw 所在目录）：
   ```bash
   for u in ao001 ao002; do echo "========== $u =========="; sudo -u "$u" -i bash -lc 'echo "SHELL=$SHELL"; echo "PATH=$PATH"; command -v openclaw || true; ls -la "$HOME/.local/bin/openclaw" 2>/dev/null || true; ls -la "/usr/local/bin/openclaw" 2>/dev/null || true; ls -la "/opt/homebrew/bin/openclaw" 2>/dev/null || true'; done
   ```

2. **执行 PATH 修复**（写入 `~/.zprofile` 与 `~/.bash_profile`）：
   ```bash
   bash /Users/yzliu/work/tlvc/scripts/step2/07-path-fix-ao001-ao002.sh
   ```

3. **验收**：两用户都能输出版本号：
   ```bash
   sudo -u ao001 -i bash -lc 'command -v openclaw; openclaw --version'
   sudo -u ao002 -i bash -lc 'command -v openclaw; openclaw --version'
   ```

---

## B) 真正修复：OpenClaw Telegram provider “硬返回”

### B0 定位 Telegram provider 源码

```bash
bash /Users/yzliu/work/tlvc/scripts/step2/08-locate-openclaw-telegram.sh
```

根据输出确定每用户 OpenClaw 中「处理 Telegram 消息、在调用 LLM 之前」的**改动文件路径**。

### B1 在 OpenClaw 代码里加 hard-route

- OpenClaw 源码不在 tlvc 仓库内，位于各用户目录（如 `/Users/ao000/openclaw`）。需在**该仓库**中修改：在 B0 得到的 handler 文件中，在调用 `handleWithLLM()` / `agent.respond()` **之前**插入：前缀匹配 `/tlvc_status`、`/tlvc_deliver` → exec allowlisted 脚本 → `sendMessage(stdout)` → **立即 return**。
- 逻辑与代码见：**`scripts/step2/DIFF-Hard-Return-Telegram.md`**（含改动文件路径说明、关键 diff、为何之前会进入 LLM）。若需 Cursor 直接改 OpenClaw，请在 Cursor 中打开 OpenClaw 仓库（如 `/Users/ao000/openclaw`）再按 DIFF 插入。

### B2 DIFF 文档

已提供：**`scripts/step2/DIFF-Hard-Return-Telegram.md`**，包含：

- 改动文件路径（如何用 08 脚本确认）
- 关键 diff（能看到 `return` / handled）
- 简短解释：为什么之前会进入 LLM

---

## C) 三用户 gateway 重启并加载新逻辑

**前提**：A 已修好 PATH（ao001/ao002 能跑 openclaw），B 已完成硬返回代码修改。

```bash
bash /Users/yzliu/work/tlvc/scripts/step2/09-gateway-restart-all.sh
```

每用户会：stop → start → status → tail gateway.log。

---

## D) Telegram 端到端验收（必须“三个 bot 都一样”）

在 Telegram 里分别对 **ao000 / ao001 / ao002** 发：

1. **`/tlvc_status ep_0007`**  
   期望：只返回脚本 stdout 两行（step2 / artifacts），不得再出现任何解释性文字。

2. **`/tlvc_deliver ep_0007 /Users/yzliu/work/tlvc/uploads/ep_0007.zip`**  
   期望：只返回脚本 stdout（含 top1/outDir 或 artifacts_dir），不得再出现“我来帮你配置 token / what's next”。

详见 **`06-e2e-acceptance.md`**。
