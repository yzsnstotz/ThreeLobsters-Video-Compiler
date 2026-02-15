# Telegram 硬路由 + 立即返回（hard-return）实现说明

## 问题

当前路由块写在 **TOOLS.md / 入口文档** 里，是“给 LLM 的指令”。LLM 执行工具后仍会继续生成“What’s next?”等补话，且可能被内置 `/status` 抢占。要彻底避免 LLM 介入，必须在 **Telegram 消息处理代码** 里做**前缀匹配 + 直接回执 + return**。

## 为什么之前会进入 LLM

- 当前实现里，**所有** Telegram 文本消息都会走到同一分支：调用 `handleWithLLM()` / `agent.respond()` / `continueConversation()`。
- 没有对 `/tlvc_status`、`/tlvc_deliver` 做**此前缀匹配并直接 return** 的分支，所以即使用户发了这两条命令，也会被当作普通消息交给 LLM；LLM 再调工具、生成回复，并习惯性补上“What’s next?”、“我来帮你…”等话术。
- 因此必须在「进入 LLM 之前」增加一段：前缀匹配 → exec allowlisted 脚本 → `sendMessage(stdout)` → **立即 return**，不再进入 LLM。

## 改动文件路径

- **位置**：OpenClaw 源码中「处理 Telegram 消息、并在调用 LLM 之前」的入口文件。
- **如何确认**：在每用户机器上运行 `scripts/step2/08-locate-openclaw-telegram.sh`，根据输出的 `sendMessage` / `handleMessage` / `processUpdate` / `exec.*allowlist` 命中行确定具体文件。
- **典型路径**（以 OpenClaw 仓库根为 `OPENCLAW_ROOT`）：  
  `OPENCLAW_ROOT/src/telegram/TelegramProvider.ts` 或 `.../telegram/message-handler.ts`、`.../providers/telegram.ts` 等（仓库结构以实际为准）。  
- 各用户安装目录示例：`/Users/ao000/openclaw`、`/Users/ao001/openclaw`、`/Users/ao002/openclaw`（gateway status 会打印实际使用的 dist 路径）。

## 必须加入的逻辑（伪代码 → 最小 diff）

在 **进入 LLM 之前** 增加一段，匹配 `/tlvc_status` 与 `/tlvc_deliver` 并**直接返回**：

```ts
// === TLVC hard-route: prefix match, exec, sendMessage, return. No LLM. ===
const text = (message?.text || '').trim();
if (text.startsWith('/tlvc_status ')) {
  const epId = text.slice('/tlvc_status '.length).trim().split(/\s+/)[0];
  if (/^ep_[0-9]{4}$/.test(epId)) {
    const result = await execAllowlisted(
      path.join(homedir(), '.openclaw', 'workspace', 'tools', 'tlvc', 'tlvc_status'),
      ['--ep', epId],
      { env: { ...process.env, TLVC_TOKEN_FILE: path.join(homedir(), '.secrets', 'tlvc.token'), TLVC_API_BASE: 'http://127.0.0.1:8789' } }
    );
    await sendMessage(chatId, result.stdout || result.stderr || 'OK');
    return; // handled, do NOT call handleWithLLM / agent.respond
  }
}
if (text.startsWith('/tlvc_deliver ')) {
  const rest = text.slice('/tlvc_deliver '.length).trim().split(/\s+/);
  const [epId, zipPath, outDir] = [rest[0], rest[1], rest[2] || path.join(homedir(), 'tlvc_artifacts', rest[0])];
  if (epId && zipPath && /^ep_[0-9]{4}$/.test(epId)) {
    const result = await execAllowlisted(
      path.join(homedir(), '.openclaw', 'workspace', 'tools', 'tlvc', 'tlvc_deliver'),
      ['--ep', epId, '--zip', zipPath, '--out', outDir],
      { env: { ...process.env, TLVC_TOKEN_FILE: path.join(homedir(), '.secrets', 'tlvc.token'), TLVC_API_BASE: 'http://127.0.0.1:8789' } }
    );
    const out = result.stdout + (result.exitCode !== 0 ? '\nFAILED (exit=' + result.exitCode + '): ' + (result.stderr || '').slice(-800) : '\nartifacts_dir: ' + outDir);
    await sendMessage(chatId, out);
    return;
  }
}
// === end TLVC hard-route ===
// ... existing: handleWithLLM() / agent.respond() ...
```

## 关键 diff（unified，插入位置以实际行为准）

在「处理 Telegram 文本消息」的函数中，在调用 `handleWithLLM()` / `agent.respond()` 的**上一行**插入以下块（`HANDLER_FILE` 为 08 脚本定位到的文件）：

```diff
--- a/HANDLER_FILE
+++ b/HANDLER_FILE
@@ -N,6 +N,45 @@ async function handleTelegramMessage(update, chatId) {
+  // === TLVC hard-route: prefix match, exec, sendMessage, return. No LLM. ===
+  const text = (message?.text || '').trim();
+  if (text.startsWith('/tlvc_status ')) {
+    const epId = text.slice('/tlvc_status '.length).trim().split(/\s+/)[0];
+    if (/^ep_[0-9]{4}$/.test(epId)) {
+      const result = await execAllowlisted(
+        path.join(homedir(), '.openclaw', 'workspace', 'tools', 'tlvc', 'tlvc_status'),
+        ['--ep', epId],
+        { env: { ...process.env, TLVC_TOKEN_FILE: path.join(homedir(), '.secrets', 'tlvc.token'), TLVC_API_BASE: 'http://127.0.0.1:8789' } }
+      );
+      await sendMessage(chatId, result.stdout || result.stderr || 'OK');
+      return; // handled, do NOT call handleWithLLM
+    }
+  }
+  if (text.startsWith('/tlvc_deliver ')) {
+    const rest = text.slice('/tlvc_deliver '.length).trim().split(/\s+/);
+    const [epId, zipPath, outDir] = [rest[0], rest[1], rest[2] || path.join(homedir(), 'tlvc_artifacts', rest[0])];
+    if (epId && zipPath && /^ep_[0-9]{4}$/.test(epId)) {
+      const result = await execAllowlisted(
+        path.join(homedir(), '.openclaw', 'workspace', 'tools', 'tlvc', 'tlvc_deliver'),
+        ['--ep', epId, '--zip', zipPath, '--out', outDir],
+        { env: { ...process.env, TLVC_TOKEN_FILE: path.join(homedir(), '.secrets', 'tlvc.token'), TLVC_API_BASE: 'http://127.0.0.1:8789' } }
+      );
+      const out = result.stdout + (result.exitCode !== 0 ? '\nFAILED (exit=' + result.exitCode + '): ' + (result.stderr || '').slice(-800) : '\nartifacts_dir: ' + outDir);
+      await sendMessage(chatId, out);
+      return;
+    }
+  }
+  // === end TLVC hard-route ===
+
   await handleWithLLM(chatId, message);
 }
```

要点：两处 **`return`** 确保 send 后不再执行 `handleWithLLM()`，从而不会出现任何 LLM 话术。

## 最小 diff 要点

1. **位置**：在调用 `handleWithLLM()` / `agent.respond()` / `continueConversation()` 的**之前**插入上述分支。
2. **匹配**：`text.startsWith('/tlvc_status ')` 与 `text.startsWith('/tlvc_deliver ')`（注意空格，避免误匹配）。
3. **执行**：使用现有 allowlisted exec（或等价安全执行），传入 `TLVC_TOKEN_FILE`、`TLVC_API_BASE`（或依赖脚本内 fallback）。
4. **返回**：`sendMessage(...)` 后 **立即 `return`**（或设置 `handled = true` 并跳过后续 LLM 调用）。

## 若 OpenClaw 为闭源/不可改

- 则只能依赖「入口文档 + 极强措辞」约束 LLM 不补话，并确保无其他命令占用 `/tlvc_status`（见 05-grep-tlvc-conflict.sh）。
- 或与 OpenClaw 维护方约定：在 Telegram provider 中增加可配置的「前缀 → 命令 → 直接回执」表，由配置驱动硬路由。
